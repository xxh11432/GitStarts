package com.githubstars.dto;

public record QuotaReserveResponse(boolean allowed, int used, int limit, int remaining,
                                   String resetAt, String idemKey, boolean replayed) {
}
