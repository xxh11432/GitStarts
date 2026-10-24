package com.githubstars.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.LocalDateTime;

public record MessageView(
        Long id,
        String role,
        String content,
        JsonNode refs,
        LocalDateTime createdAt) {
}
