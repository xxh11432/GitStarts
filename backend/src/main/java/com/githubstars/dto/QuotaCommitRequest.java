package com.githubstars.dto;

public record QuotaCommitRequest(Long userId, String kind, String idemKey,
                                 Long tokensIn, Long tokensOut, String requestId) {
}
