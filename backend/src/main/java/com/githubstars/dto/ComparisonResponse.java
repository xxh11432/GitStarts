package com.githubstars.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDateTime;
import java.util.List;

public record ComparisonResponse(
        Long id,
        Long ideaId,
        List<String> repoKeys,
        String schemaVersion,
        JsonNode result,
        String shareToken,
        LocalDateTime createdAt) {
}
