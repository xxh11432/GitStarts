package com.githubstars.dto;

import java.time.LocalDateTime;

public record FavoriteResponse(
        Long id,
        RepoResponse repo,
        String note,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {
}
