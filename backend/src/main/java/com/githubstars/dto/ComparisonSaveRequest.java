package com.githubstars.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

public record ComparisonSaveRequest(
        Long userId,
        Long ideaId,
        List<String> repoKeys,
        String schemaVersion,
        JsonNode result,
        String cacheKey) {
}
