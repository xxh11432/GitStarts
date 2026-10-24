package com.githubstars.dto;

public record ConversationCreateRequest(Long userId, String mode, Long ideaId, String title) {
}
