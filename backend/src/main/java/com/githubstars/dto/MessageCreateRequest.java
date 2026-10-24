package com.githubstars.dto;

public record MessageCreateRequest(
        Long conversationId,
        String role,
        String content,
        Object toolTrace,
        Object refs,
        Integer tokensIn,
        Integer tokensOut) {
}
