package com.githubstars.service;

import com.githubstars.dto.OpsMetricsResponse;
import com.githubstars.entity.AiMetric;
import com.githubstars.mapper.AiMetricMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AI 成本与延迟看板：只做聚合读取，不参与配额与计费。
 */
@Service
public class OpsMetricsService {

    private static final Logger log = LoggerFactory.getLogger(OpsMetricsService.class);
    private static final Logger alertLog = LoggerFactory.getLogger("ops_alert");
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final Set<String> KINDS = Set.of("chat", "match", "compare");
    private static final Set<String> STATUSES = Set.of("ok", "error", "timeout", "cancelled");
    private static final int MAX_DAYS = 90;

    private static final int PURGE_BATCH_SIZE = 10_000;
    private static final int PURGE_MAX_BATCHES = 20;

    private final AiMetricMapper mapper;
    private final long dailyTokenBudget;
    private final long dailyCompareBudget;
    private final int retentionDays;
    private final Map<String, Long> p95Thresholds;

    public OpsMetricsService(
            AiMetricMapper mapper,
            @Value("${app.ops.daily-token-budget:2000000}") long dailyTokenBudget,
            @Value("${app.ops.daily-compare-budget:200}") long dailyCompareBudget,
            @Value("${app.ops.p95-chat-ms:30000}") long p95ChatMs,
            @Value("${app.ops.p95-match-ms:30000}") long p95MatchMs,
            @Value("${app.ops.p95-compare-ms:180000}") long p95CompareMs,
            @Value("${app.ops.retention-days:180}") int retentionDays) {
        this.mapper = mapper;
        this.dailyTokenBudget = dailyTokenBudget;
        this.dailyCompareBudget = dailyCompareBudget;
        this.retentionDays = retentionDays;
        this.p95Thresholds = Map.of("chat", p95ChatMs, "match", p95MatchMs, "compare", p95CompareMs);
    }

    /**
     * 记录一次 AI 请求。指标失败不能影响主链路，异常由调用方（内部接口）兜底。
     */
    public void record(String kind, String status, Long tokensIn, Long tokensOut,
                       Long latencyMs, Boolean cached) {
        AiMetric metric = new AiMetric();
        metric.setKind(KINDS.contains(kind) ? kind : "chat");
        metric.setStatus(STATUSES.contains(status) ? status : "error");
        metric.setTokensIn(nonNegative(tokensIn));
        metric.setTokensOut(nonNegative(tokensOut));
        metric.setLatencyMs((int) Math.min(nonNegative(latencyMs), Integer.MAX_VALUE));
        metric.setCached(Boolean.TRUE.equals(cached));
        metric.setCreatedAt(LocalDateTime.now(ZONE));
        mapper.insert(metric);
    }

    public OpsMetricsResponse summary(int requestedDays) {
        int days = Math.min(Math.max(requestedDays, 1), MAX_DAYS);
        LocalDate to = LocalDate.now(ZONE);
        LocalDate from = to.minusDays(days - 1L);
        LocalDateTime fromTime = from.atStartOfDay();

        Map<String, Map<String, DayAccumulator>> byDay = new LinkedHashMap<>();
        for (int i = 0; i < days; i++) {
            byDay.put(from.plusDays(i).toString(), new LinkedHashMap<>());
        }
        for (Map<String, Object> row : mapper.aggregateDaily(fromTime)) {
            String day = String.valueOf(row.get("day"));
            Map<String, DayAccumulator> kinds = byDay.get(day);
            if (kinds == null) {
                continue;
            }
            String kind = String.valueOf(row.get("kind"));
            DayAccumulator acc = kinds.computeIfAbsent(kind, key -> new DayAccumulator());
            acc.requests += asLong(row.get("cnt"));
            acc.tokensIn += asLong(row.get("tokens_in"));
            acc.tokensOut += asLong(row.get("tokens_out"));
            acc.errors += asLong(row.get("errors"));
        }

        Map<String, Map<String, List<Long>>> latencies = new LinkedHashMap<>();
        for (Map<String, Object> row : mapper.latencySamples(fromTime)) {
            latencies.computeIfAbsent(String.valueOf(row.get("day")), key -> new LinkedHashMap<>())
                    .computeIfAbsent(String.valueOf(row.get("kind")), key -> new ArrayList<>())
                    .add(asLong(row.get("latency_ms")));
        }

        List<OpsMetricsResponse.OpsDay> dayRows = new ArrayList<>();
        OpsMetricsResponse.OpsTotals totals = new OpsMetricsResponse.OpsTotals(
                0, 0, 0, 0, 0, 0, 0, null);
        List<OpsMetricsResponse.OpsAlert> alerts = new ArrayList<>();
        List<Long> allLatencies = new ArrayList<>();

        for (Map.Entry<String, Map<String, DayAccumulator>> entry : byDay.entrySet()) {
            String day = entry.getKey();
            Map<String, DayAccumulator> kinds = entry.getValue();
            Map<String, Long> p95ByKind = new LinkedHashMap<>();
            List<Long> dayLatencies = new ArrayList<>();
            for (String kind : KINDS) {
                List<Long> samples = latencies.getOrDefault(day, Map.of()).getOrDefault(kind, List.of());
                Long p95 = percentile95(samples);
                if (p95 != null) {
                    p95ByKind.put(kind, p95);
                }
                dayLatencies.addAll(samples);
            }
            long chat = count(kinds, "chat");
            long match = count(kinds, "match");
            long compare = count(kinds, "compare");
            long tokensIn = sum(kinds, true);
            long tokensOut = sum(kinds, false);
            long requests = chat + match + compare;
            long errors = totalErrors(kinds);
            Long p95Ms = percentile95(dayLatencies);

            dayRows.add(new OpsMetricsResponse.OpsDay(day, chat, match, compare,
                    tokensIn, tokensOut, requests, errors, p95Ms, p95ByKind));

            if (requests > 0) {
                if (tokensIn + tokensOut > dailyTokenBudget) {
                    alerts.add(new OpsMetricsResponse.OpsAlert(
                            "daily_tokens_exceeded", day, tokensIn + tokensOut, dailyTokenBudget));
                }
                if (compare > dailyCompareBudget) {
                    alerts.add(new OpsMetricsResponse.OpsAlert(
                            "daily_compares_exceeded", day, compare, dailyCompareBudget));
                }
                for (Map.Entry<String, Long> latency : p95ByKind.entrySet()) {
                    long threshold = p95Thresholds.getOrDefault(latency.getKey(), Long.MAX_VALUE);
                    if (latency.getValue() > threshold) {
                        alerts.add(new OpsMetricsResponse.OpsAlert(
                                "p95_" + latency.getKey() + "_exceeded",
                                day, latency.getValue(), threshold));
                    }
                }
            }

            totals = new OpsMetricsResponse.OpsTotals(
                    totals.chatCount() + chat,
                    totals.matchCount() + match,
                    totals.compareCount() + compare,
                    totals.tokensIn() + tokensIn,
                    totals.tokensOut() + tokensOut,
                    totals.requests() + requests,
                    totals.errors() + errors,
                    null);
            allLatencies.addAll(dayLatencies);
        }

        Long totalP95 = percentile95(allLatencies);
        totals = new OpsMetricsResponse.OpsTotals(totals.chatCount(), totals.matchCount(),
                totals.compareCount(), totals.tokensIn(), totals.tokensOut(), totals.requests(),
                totals.errors(), totalP95);

        return new OpsMetricsResponse(from.toString(), to.toString(), dayRows, totals,
                new OpsMetricsResponse.OpsBudgets(dailyTokenBudget, dailyCompareBudget,
                        p95Thresholds.get("chat"), p95Thresholds.get("match"),
                        p95Thresholds.get("compare")),
                alerts);
    }

    /**
     * 每天分批清理超过保留期的指标；0 表示关闭自动清理（由运维手工维护）。
     */
    @Scheduled(initialDelay = 5 * 60_000, fixedDelay = 24 * 3_600_000)
    public void purgeOldMetrics() {
        if (retentionDays <= 0) {
            return;
        }
        LocalDateTime cutoff = LocalDateTime.now(ZONE).minusDays(retentionDays);
        int total = 0;
        try {
            for (int batch = 0; batch < PURGE_MAX_BATCHES; batch++) {
                int deleted = mapper.deleteOlderThan(cutoff);
                total += deleted;
                if (deleted < PURGE_BATCH_SIZE) {
                    break;
                }
            }
            if (total > 0) {
                log.info("ai_metrics_purged cutoff={} deleted={}", cutoff, total);
            }
        } catch (Exception e) {
            log.warn("ai_metrics_purge_failed", e);
        }
    }

    /**
     * 每小时检查当天是否越过预算；日志名独立为 ops_alert，便于日志平台直接告警。
     */
    @Scheduled(initialDelay = 60_000, fixedDelay = 3_600_000)
    public void checkBudgets() {
        try {
            OpsMetricsResponse response = summary(1);
            for (OpsMetricsResponse.OpsAlert alert : response.alerts()) {
                alertLog.warn("ops_budget_alert code={} day={} value={} threshold={}",
                        alert.code(), alert.day(), alert.value(), alert.threshold());
            }
        } catch (Exception e) {
            log.warn("ops_budget_check_failed", e);
        }
    }

    private static long count(Map<String, DayAccumulator> kinds, String kind) {
        DayAccumulator acc = kinds.get(kind);
        return acc == null ? 0 : acc.requests;
    }

    private static long sum(Map<String, DayAccumulator> kinds, boolean tokensIn) {
        long total = 0;
        for (DayAccumulator acc : kinds.values()) {
            total += tokensIn ? acc.tokensIn : acc.tokensOut;
        }
        return total;
    }

    private static long totalErrors(Map<String, DayAccumulator> kinds) {
        long total = 0;
        for (DayAccumulator acc : kinds.values()) {
            total += acc.errors;
        }
        return total;
    }

    /**
     * 最近秩法 P95：样本排序后取 ceil(0.95 × n) - 1。
     */
    private static Long percentile95(List<Long> samples) {
        if (samples == null || samples.isEmpty()) {
            return null;
        }
        List<Long> sorted = new ArrayList<>(samples);
        sorted.sort(Long::compareTo);
        int index = (int) Math.ceil(sorted.size() * 0.95) - 1;
        return sorted.get(Math.max(0, Math.min(index, sorted.size() - 1)));
    }

    private static long nonNegative(Long value) {
        return value == null ? 0 : Math.max(value, 0);
    }

    private static long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0;
    }

    private static final class DayAccumulator {
        private long requests;
        private long tokensIn;
        private long tokensOut;
        private long errors;
    }
}
