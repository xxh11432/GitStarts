package com.githubstars.controller;

import com.githubstars.dto.OpsMetricsResponse;
import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.service.OpsMetricsService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 运维成本看板：仅 OPS_GITHUB_LOGINS 中的登录用户可读；未配置时默认全部拒绝。
 */
@RestController
public class OpsController {

    private final OpsMetricsService opsMetricsService;
    private final Set<String> allowedLogins;

    public OpsController(OpsMetricsService opsMetricsService,
                         @Value("${app.ops.logins:}") String logins) {
        this.opsMetricsService = opsMetricsService;
        this.allowedLogins = Arrays.stream(logins.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .map(String::toLowerCase)
                .collect(Collectors.toUnmodifiableSet());
    }

    @GetMapping("/ops/metrics")
    public ResponseEntity<Object> metrics(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                          @RequestParam(defaultValue = "7") int days) {
        String login = principal == null ? null : principal.getLogin();
        if (login == null || !allowedLogins.contains(login.toLowerCase())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("code", "forbidden", "message", "无权访问成本看板"));
        }
        return ResponseEntity.ok(opsMetricsService.summary(days));
    }
}
