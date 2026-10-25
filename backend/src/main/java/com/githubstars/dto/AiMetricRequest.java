package com.githubstars.dto;

/**
 * llm-service 上报的单次 AI 请求指标。
 */
public record AiMetricRequest(
        String kind,
        String status,
        Long tokensIn,
        Long tokensOut,
        Long latencyMs,
        Boolean cached) {
}
