package com.githubstars.controller;

import com.githubstars.dto.MeResponse;
import com.githubstars.security.OAuth2LoginSuccessHandler;
import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.security.SafeRedirect;
import com.githubstars.service.QuotaService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class AuthController {

    private final QuotaService quotaService;

    public AuthController(QuotaService quotaService) {
        this.quotaService = quotaService;
    }

    /**
     * 站内登录入口：记录回跳地址后交给 Spring Security 的 GitHub 授权端点。
     */
    @GetMapping("/auth/github/login")
    public void githubLogin(@RequestParam(required = false) String next,
                            HttpServletRequest request,
                            HttpServletResponse response) {
        String target = SafeRedirect.normalize(next);
        if (!"/".equals(target)) {
            request.getSession(true).setAttribute(OAuth2LoginSuccessHandler.NEXT_ATTRIBUTE, target);
        }
        // 使用相对 Location，由浏览器保持当前协议与主机（HTTPS 部署不会被降级）
        response.setStatus(HttpServletResponse.SC_FOUND);
        response.setHeader("Location", request.getContextPath() + "/oauth2/authorization/github");
    }

    @GetMapping("/auth/me")
    public MeResponse me(@AuthenticationPrincipal OAuth2UserPrincipal principal) {
        return new MeResponse(principal.getUserId(), principal.getNickname(), principal.getAvatarUrl(),
                quotaService.current(principal.getUserId()));
    }

    /**
     * 供前端在写请求前获取 CSRF token（同时确保 XSRF-TOKEN Cookie 已下发）。
     */
    @GetMapping("/auth/csrf")
    public Map<String, String> csrf(CsrfToken csrfToken) {
        return Map.of("token", csrfToken.getToken());
    }
}
