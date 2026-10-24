package com.githubstars.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDateTime;

public record IdeaResponse(
        Long id,
        String title,
        String rawText,
        JsonNode structured,
        Integer revision,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {
}
