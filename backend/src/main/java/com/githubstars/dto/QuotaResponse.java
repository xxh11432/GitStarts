package com.githubstars.dto;

public record QuotaResponse(QuotaView chat, QuotaView compare, String resetAt) {
}
