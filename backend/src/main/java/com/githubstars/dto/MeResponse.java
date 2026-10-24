package com.githubstars.dto;

public record MeResponse(Long id, String nickname, String avatarUrl, QuotaResponse quota) {
}
