package com.githubstars.dto;

public record MessageCreateRequest(
        Long conversationId,
        Long userId,
        String role,
        String content,
        Object toolTrace,
        Object refs,
        Integer tokensIn,
        Integer tokensOut) {
}
