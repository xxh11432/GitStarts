package com.githubstars.controller;

import com.githubstars.dto.OpsMetricsResponse;
import com.githubstars.dto.QuotaRefundRequest;
import com.githubstars.entity.QuotaLedger;
import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.service.OpsMetricsService;
import com.githubstars.service.QuotaService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 运维成本看板与配额运营工具：仅 OPS_GITHUB_LOGINS 中的登录用户可读；未配置时默认全部拒绝。
 */
@RestController
public class OpsController {

    private final OpsMetricsService opsMetricsService;
    private final QuotaService quotaService;
    private final Set<String> allowedLogins;

    public OpsController(OpsMetricsService opsMetricsService,
                         QuotaService quotaService,
                         @Value("${app.ops.logins:}") String logins) {
        this.opsMetricsService = opsMetricsService;
        this.quotaService = quotaService;
        this.allowedLogins = Arrays.stream(logins.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .map(String::toLowerCase)
                .collect(Collectors.toUnmodifiableSet());
    }

    @GetMapping("/ops/metrics")
    public ResponseEntity<Object> metrics(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                          @RequestParam(defaultValue = "7") int days) {
        if (!allowed(principal)) {
            return forbidden();
        }
        return ResponseEntity.ok(opsMetricsService.summary(days));
    }

    /**
     * 运营工具：按 requestId / idemKey 查询扣费账本，便于对账与用户申诉。
     */
    @GetMapping("/ops/quota/ledger")
    public ResponseEntity<Object> ledger(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                         @RequestParam(required = false) String idemKey,
                                         @RequestParam(required = false) String requestId) {
        if (!allowed(principal)) {
            return forbidden();
        }
        List<QuotaLedger> rows = quotaService.ledger(idemKey, requestId);
        return ResponseEntity.ok(rows);
    }

    /**
     * 运营工具：按幂等键或 requestId 补退一次额度，重复调用幂等。
     */
    @PostMapping("/ops/quota/refund")
    public ResponseEntity<Object> refund(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                         @RequestBody QuotaRefundRequest request) {
        if (!allowed(principal)) {
            return forbidden();
        }
        boolean ok = quotaService.refund(request.idemKey(), request.requestId(), request.reason());
        return ResponseEntity.ok(Map.of("ok", ok));
    }

    private boolean allowed(OAuth2UserPrincipal principal) {
        String login = principal == null ? null : principal.getLogin();
        return login != null && allowedLogins.contains(login.toLowerCase());
    }

    private ResponseEntity<Object> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("code", "forbidden", "message", "无权访问运维接口"));
    }
}
