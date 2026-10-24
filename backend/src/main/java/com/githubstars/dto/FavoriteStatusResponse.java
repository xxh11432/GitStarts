package com.githubstars.dto;

public record FavoriteStatusResponse(boolean favorited, Long id, String note) {
}
