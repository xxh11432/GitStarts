package com.githubstars.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ComparisonSummary(
        Long id,
        List<String> repoKeys,
        String schemaVersion,
        LocalDateTime createdAt) {
}
