package com.githubstars.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 只读分享视图：不包含用户、idea 与 cacheKey 等内部信息。
 */
public record ComparisonShareResponse(
        List<String> repoKeys,
        String schemaVersion,
        JsonNode result,
        LocalDateTime createdAt) {
}
