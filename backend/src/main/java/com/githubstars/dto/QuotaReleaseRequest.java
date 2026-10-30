package com.githubstars.dto;

public record QuotaReleaseRequest(Long userId, String kind, String idemKey, String reason) {
}
