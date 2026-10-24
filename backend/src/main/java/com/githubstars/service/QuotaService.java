package com.githubstars.service;

import com.githubstars.dto.QuotaResponse;
import com.githubstars.dto.QuotaView;
import com.githubstars.mapper.UsageDailyMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 每日配额：Redis 原子扣减（Lua 脚本），MySQL usage_daily 只做成本统计。
 */
@Service
public class QuotaService {

    private static final Logger log = LoggerFactory.getLogger(QuotaService.class);

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter DAY_KEY = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final String KEY_PREFIX = "quota:";

    /**
     * KEYS[1] 配额键；ARGV[1] 上限；ARGV[2] 过期秒数。
     * 返回扣减后的用量；超限回滚并返回 -1。
     */
    private static final DefaultRedisScript<Long> RESERVE_SCRIPT = new DefaultRedisScript<>("""
            local current = redis.call('INCR', KEYS[1])
            redis.call('EXPIRE', KEYS[1], ARGV[2])
            if current > tonumber(ARGV[1]) then
              redis.call('DECR', KEYS[1])
              return -1
            end
            return current
            """, Long.class);

    private final StringRedisTemplate redis;
    private final UsageDailyMapper usageDailyMapper;
    private final int chatLimit;
    private final int compareLimit;

    public QuotaService(StringRedisTemplate redis,
                        UsageDailyMapper usageDailyMapper,
                        @Value("${app.quota.chat-daily:30}") int chatLimit,
                        @Value("${app.quota.compare-daily:3}") int compareLimit) {
        this.redis = redis;
        this.usageDailyMapper = usageDailyMapper;
        this.chatLimit = chatLimit;
        this.compareLimit = compareLimit;
    }

    public QuotaResponse current(Long userId) {
        return new QuotaResponse(
                new QuotaView(used(userId, QuotaKind.CHAT), chatLimit),
                new QuotaView(used(userId, QuotaKind.COMPARE), compareLimit),
                resetAt());
    }

    public Reservation reserve(Long userId, QuotaKind kind) {
        int limit = limitOf(kind);
        String key = key(userId, kind);
        Long used = redis.execute(RESERVE_SCRIPT, List.of(key),
                String.valueOf(limit), String.valueOf(secondsUntilReset()));
        if (used == null) {
            throw new IllegalStateException("配额扣减未返回结果");
        }
        if (used < 0) {
            return new Reservation(false, limit, limit);
        }
        recordUsage(userId, kind);
        return new Reservation(true, used.intValue(), limit);
    }

    public String resetAt() {
        return resetInstant().format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    public String limitMessage(QuotaKind kind) {
        return switch (kind) {
            case CHAT -> "今日 AI 对话额度已用完，明天 00:00 重置";
            case COMPARE -> "今日深度对比额度已用完，明天 00:00 重置";
        };
    }

    private void recordUsage(Long userId, QuotaKind kind) {
        try {
            LocalDate today = LocalDate.now(ZONE);
            if (kind == QuotaKind.CHAT) {
                usageDailyMapper.incrementCounts(userId, today, 1, 0);
            } else {
                usageDailyMapper.incrementCounts(userId, today, 0, 1);
            }
        } catch (Exception e) {
            // 统计失败不能影响配额扣减结果
            log.warn("usage_daily 写入失败 userId={} kind={}", userId, kind, e);
        }
    }

    private int used(Long userId, QuotaKind kind) {
        String value = redis.opsForValue().get(key(userId, kind));
        if (value == null) {
            return 0;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private int limitOf(QuotaKind kind) {
        return kind == QuotaKind.CHAT ? chatLimit : compareLimit;
    }

    private String key(Long userId, QuotaKind kind) {
        return KEY_PREFIX + kind.value() + ":" + userId + ":" + LocalDate.now(ZONE).format(DAY_KEY);
    }

    private ZonedDateTime resetInstant() {
        return LocalDate.now(ZONE).plusDays(1).atStartOfDay(ZONE);
    }

    private long secondsUntilReset() {
        long seconds = Duration.between(ZonedDateTime.now(ZONE), resetInstant()).getSeconds();
        return Math.max(seconds, 1);
    }

    public record Reservation(boolean allowed, int used, int limit) {

        public int remaining() {
            return Math.max(0, limit - used);
        }
    }
}
