package com.githubstars.dto;

import java.time.LocalDateTime;

public record ConversationSummary(
        Long id,
        String title,
        String mode,
        Long ideaId,
        long messageCount,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {
}
