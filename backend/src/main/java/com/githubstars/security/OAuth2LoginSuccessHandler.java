package com.githubstars.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * 登录成功后回到前端。OAuth 之前的站内目标地址从会话中取出并校验。
 */
@Component
public class OAuth2LoginSuccessHandler implements AuthenticationSuccessHandler {

    public static final String NEXT_ATTRIBUTE = "auth.next";

    private final String frontendUrl;

    public OAuth2LoginSuccessHandler(@Value("${app.frontend-url:http://localhost}") String frontendUrl) {
        this.frontendUrl = frontendUrl.endsWith("/")
                ? frontendUrl.substring(0, frontendUrl.length() - 1)
                : frontendUrl;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException {
        String next = "/";
        HttpSession session = request.getSession(false);
        if (session != null) {
            Object stored = session.getAttribute(NEXT_ATTRIBUTE);
            session.removeAttribute(NEXT_ATTRIBUTE);
            if (stored instanceof String value) {
                next = SafeRedirect.normalize(value);
            }
        }
        response.sendRedirect(frontendUrl + next);
    }
}
