package com.githubstars.dto;

/**
 * clientKey 为前端/服务端生成的逻辑请求 ID（chat 用 turnId），
 * fingerprint 为请求内容指纹（match / compare 直接使用）。
 */
public record QuotaReserveRequest(Long userId, String kind, String clientKey,
                                  String fingerprint, String requestId) {
}
