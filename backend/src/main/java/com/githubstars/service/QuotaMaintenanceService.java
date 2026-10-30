package com.githubstars.service;

import com.githubstars.entity.QuotaLedger;
import com.githubstars.entity.UsageDaily;
import com.githubstars.mapper.QuotaLedgerMapper;
import com.githubstars.mapper.UsageDailyMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 配额账本运维：超时预留回收、按账本对账校准、180 天保留期清理。
 */
@Service
public class QuotaMaintenanceService {

    private static final Logger log = LoggerFactory.getLogger(QuotaMaintenanceService.class);
    private static final Logger alertLog = LoggerFactory.getLogger("ops_alert");
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final int REAP_BATCH_SIZE = 200;

    private final QuotaService quotaService;
    private final QuotaLedgerMapper quotaLedgerMapper;
    private final UsageDailyMapper usageDailyMapper;
    private final int chatReaperMinutes;
    private final int compareReaperMinutes;
    private final int retentionDays;

    public QuotaMaintenanceService(QuotaService quotaService,
                                   QuotaLedgerMapper quotaLedgerMapper,
                                   UsageDailyMapper usageDailyMapper,
                                   @Value("${app.quota.reaper-timeout-minutes:15}") int chatReaperMinutes,
                                   @Value("${app.quota.reaper-compare-timeout-minutes:120}") int compareReaperMinutes,
                                   @Value("${app.quota.ledger-retention-days:180}") int retentionDays) {
        this.quotaService = quotaService;
        this.quotaLedgerMapper = quotaLedgerMapper;
        this.usageDailyMapper = usageDailyMapper;
        this.chatReaperMinutes = chatReaperMinutes;
        this.compareReaperMinutes = compareReaperMinutes;
        this.retentionDays = retentionDays;
    }

    /**
     * compare 的回收阈值大于 checkpoint TTL（1 小时），避免断点续跑期间把预留释放掉。
     */
    @Scheduled(initialDelay = 60_000, fixedDelay = 300_000)
    public void reapStaleReservations() {
        LocalDateTime now = LocalDateTime.now(ZONE);
        int chat = releaseStale(QuotaKind.CHAT, now.minusMinutes(chatReaperMinutes));
        int compare = releaseStale(QuotaKind.COMPARE, now.minusMinutes(compareReaperMinutes));
        int total = chat + compare;
        if (total > 0) {
            log.warn("quota_reaper_released chat={} compare={}", chat, compare);
            alertLog.warn("ops_budget_alert code=quota_reaper_released day={} value={} threshold=0",
                    LocalDate.now(ZONE), total);
        }
    }

    /**
     * 按 quota_ledger 重算当天与昨天的占用计数，修正任何漂移。
     */
    @Scheduled(cron = "0 10 0 * * *", zone = "Asia/Shanghai")
    public void reconcileDaily() {
        LocalDate today = LocalDate.now(ZONE);
        int mismatches = reconcile(today) + reconcile(today.minusDays(1));
        if (mismatches > 0) {
            alertLog.warn("ops_budget_alert code=quota_reconcile_mismatch day={} value={} threshold=0",
                    today, mismatches);
        }
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "Asia/Shanghai")
    public void purgeExpiredLedger() {
        if (retentionDays <= 0) {
            return;
        }
        try {
            LocalDateTime cutoff = LocalDateTime.now(ZONE).minusDays(retentionDays);
            int deleted = quotaLedgerMapper.deleteOlderThan(cutoff);
            if (deleted > 0) {
                log.info("quota_ledger_purged cutoff={} deleted={}", cutoff, deleted);
            }
        } catch (Exception e) {
            log.warn("quota_ledger_purge_failed", e);
        }
    }

    private int releaseStale(QuotaKind kind, LocalDateTime cutoff) {
        List<QuotaLedger> rows = quotaLedgerMapper.selectStaleReserved(
                kind.value(), cutoff, REAP_BATCH_SIZE);
        int released = 0;
        for (QuotaLedger row : rows) {
            try {
                if (quotaService.release(row.getIdemKey(), "reaper")) {
                    released++;
                }
            } catch (Exception e) {
                log.warn("quota_reaper_release_failed idemKey={}", row.getIdemKey(), e);
            }
        }
        return released;
    }

    private int reconcile(LocalDate day) {
        Map<Long, int[]> expected = new HashMap<>();
        for (Map<String, Object> row : quotaLedgerMapper.countChargedByDay(day)) {
            Long userId = asLong(row.get("userId"));
            String kind = String.valueOf(row.get("kind"));
            Long counted = asLong(row.get("cnt"));
            if (userId == null || counted == null) {
                continue;
            }
            int count = counted.intValue();
            int[] counts = expected.computeIfAbsent(userId, key -> new int[2]);
            if (QuotaKind.CHAT.value().equals(kind)) {
                counts[0] = count;
            } else {
                counts[1] = count;
            }
        }

        int mismatches = 0;
        for (UsageDaily usage : usageDailyMapper.selectByDay(day)) {
            // 只校准账本覆盖到的用户，避免把升级前的历史计数误清零
            int[] counts = expected.get(usage.getUserId());
            if (counts == null) {
                continue;
            }
            int chatCount = usage.getChatCount() == null ? 0 : usage.getChatCount();
            int compareCount = usage.getCompareCount() == null ? 0 : usage.getCompareCount();
            if (chatCount == counts[0] && compareCount == counts[1]) {
                continue;
            }
            usageDailyMapper.overrideCounts(usage.getUserId(), day, counts[0], counts[1]);
            mismatches++;
            log.warn("quota_reconcile_fixed userId={} day={} chat={}->{} compare={}->{}",
                    usage.getUserId(), day, chatCount, counts[0], compareCount, counts[1]);
        }
        return mismatches;
    }

    private static Long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }
}
