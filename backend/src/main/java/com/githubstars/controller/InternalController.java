package com.githubstars.controller;

import com.githubstars.dto.QuotaReserveRequest;
import com.githubstars.dto.QuotaReserveResponse;
import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.service.QuotaKind;
import com.githubstars.service.QuotaService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 服务间接口：仅 llm-service 调用（X-Internal-Token + Nginx 外网 404）。
 */
@RestController
@RequestMapping("/internal")
public class InternalController {

    private final QuotaService quotaService;

    public InternalController(QuotaService quotaService) {
        this.quotaService = quotaService;
    }

    @PostMapping("/quota/reserve")
    public ResponseEntity<Object> reserveQuota(@RequestBody QuotaReserveRequest request) {
        if (request.userId() == null) {
            throw new IllegalArgumentException("userId 必填");
        }
        QuotaKind kind = QuotaKind.from(request.kind());
        QuotaService.Reservation reservation = quotaService.reserve(request.userId(), kind);
        String resetAt = quotaService.resetAt();

        if (!reservation.allowed()) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("code", "quota_exceeded");
            body.put("message", quotaService.limitMessage(kind));
            body.put("kind", kind.value());
            body.put("used", reservation.used());
            body.put("limit", reservation.limit());
            body.put("resetAt", resetAt);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(body);
        }

        return ResponseEntity.ok(new QuotaReserveResponse(true, reservation.used(), reservation.limit(),
                reservation.remaining(), resetAt));
    }

    /**
     * Nginx auth_request 子请求：校验会话并回传 X-User-Id，供 llm-service 使用。
     */
    @GetMapping("/auth/session")
    public ResponseEntity<Map<String, Object>> session() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken
                || !(authentication.getPrincipal() instanceof OAuth2UserPrincipal principal)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("code", "unauthorized"));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("userId", principal.getUserId());
        body.put("nickname", principal.getNickname());
        return ResponseEntity.ok()
                .header("X-User-Id", String.valueOf(principal.getUserId()))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(body);
    }
}
