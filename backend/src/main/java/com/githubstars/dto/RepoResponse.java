package com.githubstars.dto;

import java.time.LocalDateTime;
import java.util.List;

public record RepoResponse(
        Long id,
        String fullName,
        String name,
        String owner,
        String description,
        String homepage,
        String language,
        String license,
        Integer stars,
        Integer forks,
        Integer watchers,
        Integer openIssues,
        Integer heatScore,
        List<String> topics,
        String category,
        String platform,
        List<String> platforms,
        String latestReleaseTag,
        LocalDateTime latestReleaseAt,
        String defaultBranch,
        LocalDateTime pushedAt,
        LocalDateTime createdAt) {
}
