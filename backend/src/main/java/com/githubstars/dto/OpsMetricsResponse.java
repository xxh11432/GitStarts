package com.githubstars.dto;

import java.util.List;
import java.util.Map;

/**
 * 成本看板：按天聚合的请求数、token、P95 延迟与预算告警。
 */
public record OpsMetricsResponse(
        String from,
        String to,
        List<OpsDay> days,
        OpsTotals totals,
        OpsBudgets budgets,
        List<OpsAlert> alerts) {

    public record OpsDay(
            String day,
            long chatCount,
            long matchCount,
            long compareCount,
            long tokensIn,
            long tokensOut,
            long requests,
            long errors,
            Long p95Ms,
            Map<String, Long> p95ByKind) {
    }

    public record OpsTotals(
            long chatCount,
            long matchCount,
            long compareCount,
            long tokensIn,
            long tokensOut,
            long requests,
            long errors,
            Long p95Ms) {
    }

    public record OpsBudgets(
            long dailyTokens,
            long dailyCompares,
            long p95ChatMs,
            long p95MatchMs,
            long p95CompareMs) {
    }

    public record OpsAlert(String code, String day, long value, long threshold) {
    }
}
