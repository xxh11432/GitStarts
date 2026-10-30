package com.githubstars.service;

import com.githubstars.dto.QuotaResponse;
import com.githubstars.dto.QuotaView;
import com.githubstars.entity.QuotaLedger;
import com.githubstars.entity.UsageDaily;
import com.githubstars.mapper.QuotaLedgerMapper;
import com.githubstars.mapper.UsageDailyMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

/**
 * 每日配额：MySQL usage_daily 为权威计数，quota_ledger 为幂等账本。
 *
 * <p>预留（reserve）以 SHA256(userId|kind|clientKey|fingerprint) 为主键，同一逻辑请求
 * 无论重试多少次都只扣一次；生成结束再按产出 commit 或失败 release。</p>
 */
@Service
public class QuotaService {

    private static final Logger log = LoggerFactory.getLogger(QuotaService.class);

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final String STATE_RESERVED = "reserved";
    private static final String STATE_COMMITTED = "committed";
    private static final String STATE_RELEASED = "released";
    private static final String STATE_REFUNDED = "refunded";

    private final UsageDailyMapper usageDailyMapper;
    private final QuotaLedgerMapper quotaLedgerMapper;
    private final int chatLimit;
    private final int compareLimit;
    private final long tokenDailyLimit;

    public QuotaService(UsageDailyMapper usageDailyMapper,
                        QuotaLedgerMapper quotaLedgerMapper,
                        @Value("${app.quota.chat-daily:30}") int chatLimit,
                        @Value("${app.quota.compare-daily:3}") int compareLimit,
                        @Value("${app.quota.token-daily:200000}") long tokenDailyLimit) {
        this.usageDailyMapper = usageDailyMapper;
        this.quotaLedgerMapper = quotaLedgerMapper;
        this.chatLimit = chatLimit;
        this.compareLimit = compareLimit;
        this.tokenDailyLimit = tokenDailyLimit;
    }

    public QuotaResponse current(Long userId) {
        LocalDate day = LocalDate.now(ZONE);
        return new QuotaResponse(
                new QuotaView(used(userId, day, QuotaKind.CHAT), chatLimit),
                new QuotaView(used(userId, day, QuotaKind.COMPARE), compareLimit),
                resetAt());
    }

    /**
     * 幂等预留：同键处于 reserved / committed 时直接返回原结果，不重复计数。
     */
    @Transactional
    public Reservation reserve(Long userId, QuotaKind kind,
                               String clientKey, String fingerprint, String requestId) {
        int limit = limitOf(kind);
        LocalDate day = LocalDate.now(ZONE);
        LocalDateTime now = LocalDateTime.now(ZONE);
        String idemKey = idemKey(userId, kind, clientKey, fingerprint, requestId);

        // 固定加锁顺序：先账本行、后 usage_daily 行，避免与 commit/release 形成死锁
        int inserted = quotaLedgerMapper.insertIgnore(idemKey, userId, kind.value(),
                blankToEmpty(clientKey), blankToEmpty(fingerprint), day, blankToNull(requestId), now);

        if (inserted == 0) {
            QuotaLedger existing = quotaLedgerMapper.selectForUpdate(idemKey);
            if (existing == null) {
                throw new IllegalStateException("配额账本行缺失：" + idemKey);
            }
            if (STATE_RESERVED.equals(existing.getState()) || STATE_COMMITTED.equals(existing.getState())) {
                if (STATE_RESERVED.equals(existing.getState())) {
                    quotaLedgerMapper.touchReserved(idemKey, now);
                }
                int used = existing.getUsedAfter() == null
                        ? used(userId, day, kind) : existing.getUsedAfter();
                return new Reservation(true, used, limit, idemKey, true, null);
            }
            // released / refunded：上次失败已归还，本次重试重新占位。
        }

        usageDailyMapper.ensureRow(userId, day);
        if (overTokenBudget(userId, day)) {
            int used = used(userId, day, kind);
            quotaLedgerMapper.markReleased(idemKey, "token_budget_exceeded", used, now);
            return new Reservation(false, used, limit, idemKey, false, "token_budget_exceeded");
        }

        int incremented = kind == QuotaKind.CHAT
                ? usageDailyMapper.incrementChatIfBelow(userId, day, limit)
                : usageDailyMapper.incrementCompareIfBelow(userId, day, limit);
        if (incremented == 0) {
            int used = used(userId, day, kind);
            quotaLedgerMapper.markReleased(idemKey, "quota_exceeded", used, now);
            return new Reservation(false, used, limit, idemKey, false, "quota_exceeded");
        }

        int used = used(userId, day, kind);
        quotaLedgerMapper.markReserved(idemKey, day, used, now);
        return new Reservation(true, used, limit, idemKey, false, null);
    }

    /**
     * 成功终态：committed 幂等，重复调用不会重复累计 token。
     */
    @Transactional
    public boolean commit(Long userId, QuotaKind kind, String idemKey,
                          long tokensIn, long tokensOut, String requestId) {
        QuotaLedger row = quotaLedgerMapper.selectForUpdate(idemKey);
        if (row == null || !userId.equals(row.getUserId()) || !kind.value().equals(row.getKind())) {
            log.warn("quota_commit_unknown idemKey={} userId={} kind={}", idemKey, userId, kind);
            return false;
        }
        if (STATE_COMMITTED.equals(row.getState())) {
            return true;
        }
        if (!STATE_RESERVED.equals(row.getState())) {
            log.warn("quota_commit_invalid_state idemKey={} state={}", idemKey, row.getState());
            return false;
        }
        LocalDateTime now = LocalDateTime.now(ZONE);
        long in = Math.max(tokensIn, 0);
        long out = Math.max(tokensOut, 0);
        int updated = quotaLedgerMapper.markCommitted(idemKey, in, out,
                row.getUsedAfter(), now);
        if (updated == 0) {
            return false;
        }
        usageDailyMapper.addTokens(userId, row.getDay(), in, out);
        if (requestId != null && !requestId.isBlank()) {
            QuotaLedger patch = new QuotaLedger();
            patch.setIdemKey(idemKey);
            patch.setRequestId(requestId);
            quotaLedgerMapper.updateById(patch);
        }
        return true;
    }

    /**
     * 失败 / 取消终态：释放占位并归还当日计数；仅 reserved 状态会真正归还。
     */
    @Transactional
    public boolean release(String idemKey, String reason) {
        QuotaLedger row = quotaLedgerMapper.selectForUpdate(idemKey);
        if (row == null) {
            return false;
        }
        if (!STATE_RESERVED.equals(row.getState())) {
            return STATE_RELEASED.equals(row.getState()) || STATE_REFUNDED.equals(row.getState());
        }
        QuotaKind kind = QuotaKind.from(row.getKind());
        LocalDate day = row.getDay() == null ? LocalDate.now(ZONE) : row.getDay();
        if (Boolean.TRUE.equals(row.getCharged())) {
            if (kind == QuotaKind.CHAT) {
                usageDailyMapper.decrementChat(row.getUserId(), day);
            } else {
                usageDailyMapper.decrementCompare(row.getUserId(), day);
            }
        }
        int used = used(row.getUserId(), day, kind);
        quotaLedgerMapper.markReleased(idemKey,
                reason == null || reason.isBlank() ? "released" : reason, used, LocalDateTime.now(ZONE));
        return true;
    }

    /**
     * 管理员补退：按幂等键或 requestId 定位账本并归还一次，重复调用幂等。
     */
    @Transactional
    public boolean refund(String idemKey, String requestId, String reason) {
        String key = idemKey;
        if ((key == null || key.isBlank()) && requestId != null && !requestId.isBlank()) {
            List<QuotaLedger> rows = quotaLedgerMapper.selectByRequestId(requestId);
            if (rows.isEmpty()) {
                return false;
            }
            key = rows.get(0).getIdemKey();
        }
        if (key == null || key.isBlank()) {
            return false;
        }
        QuotaLedger row = quotaLedgerMapper.selectForUpdate(key);
        if (row == null) {
            return false;
        }
        if (STATE_RELEASED.equals(row.getState()) || STATE_REFUNDED.equals(row.getState())) {
            return true;
        }
        QuotaKind kind = QuotaKind.from(row.getKind());
        LocalDate day = row.getDay() == null ? LocalDate.now(ZONE) : row.getDay();
        if (Boolean.TRUE.equals(row.getCharged())) {
            if (kind == QuotaKind.CHAT) {
                usageDailyMapper.decrementChat(row.getUserId(), day);
            } else {
                usageDailyMapper.decrementCompare(row.getUserId(), day);
            }
        }
        int used = used(row.getUserId(), day, kind);
        quotaLedgerMapper.markRefunded(key,
                reason == null || reason.isBlank() ? "admin_refund" : reason, used, LocalDateTime.now(ZONE));
        return true;
    }

    public List<QuotaLedger> ledger(String idemKey, String requestId) {
        if (idemKey != null && !idemKey.isBlank()) {
            QuotaLedger row = quotaLedgerMapper.selectByKey(idemKey);
            return row == null ? List.of() : List.of(row);
        }
        if (requestId != null && !requestId.isBlank()) {
            return quotaLedgerMapper.selectByRequestId(requestId);
        }
        throw new IllegalArgumentException("idemKey 与 requestId 至少传一个");
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

    public String costLimitMessage() {
        return "今日 AI 成本预算已用完，明天 00:00 重置";
    }

    public boolean overTokenBudget(Long userId, LocalDate day) {
        if (tokenDailyLimit <= 0) {
            return false;
        }
        UsageDaily row = usageDailyMapper.selectByUserDay(userId, day);
        if (row == null) {
            return false;
        }
        long tokens = nonNegative(row.getTokensIn()) + nonNegative(row.getTokensOut());
        return tokens >= tokenDailyLimit;
    }

    public static String idemKey(Long userId, QuotaKind kind,
                                 String clientKey, String fingerprint, String requestId) {
        String client = blankToEmpty(clientKey);
        String fp = blankToEmpty(fingerprint);
        if (client.isEmpty() && fp.isEmpty()) {
            // 两个业务身份都缺失时退回 requestId / 随机值，避免所有请求落到同一个键
            String fallback = requestId;
            if (fallback == null || fallback.isBlank()) {
                fallback = UUID.randomUUID().toString();
            }
            client = fallback;
        }
        String raw = userId + "|" + kind.value() + "|" + client + "|" + fp;
        return sha256(raw);
    }

    private int used(Long userId, LocalDate day, QuotaKind kind) {
        UsageDaily row = usageDailyMapper.selectByUserDay(userId, day);
        if (row == null) {
            return 0;
        }
        Integer value = kind == QuotaKind.CHAT ? row.getChatCount() : row.getCompareCount();
        return value == null ? 0 : value;
    }

    private int limitOf(QuotaKind kind) {
        return kind == QuotaKind.CHAT ? chatLimit : compareLimit;
    }

    private ZonedDateTime resetInstant() {
        return LocalDate.now(ZONE).plusDays(1).atStartOfDay(ZONE);
    }

    private static long nonNegative(Long value) {
        return value == null ? 0 : Math.max(value, 0);
    }

    private static String blankToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String sha256(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(bytes.length * 2);
            for (byte value : bytes) {
                hex.append(String.format("%02x", value));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    public record Reservation(boolean allowed, int used, int limit,
                              String idemKey, boolean replayed, String reason) {

        public int remaining() {
            return Math.max(0, limit - used);
        }
    }
}
