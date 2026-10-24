package com.githubstars.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

/**
 * 服务间接口鉴权：/internal/** 必须携带 X-Internal-Token。
 * 会话校验接口 /internal/auth/session 由 Nginx internal location 保护，仅接受会话 Cookie。
 */
public class InternalTokenFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Internal-Token";
    private static final String SESSION_PATH = "/internal/auth/session";

    private final String expectedToken;
    private final ObjectMapper objectMapper;

    public InternalTokenFilter(String expectedToken, ObjectMapper objectMapper) {
        this.expectedToken = expectedToken == null ? "" : expectedToken;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String path = request.getServletPath();
        if (!path.startsWith("/internal/") || SESSION_PATH.equals(path)) {
            filterChain.doFilter(request, response);
            return;
        }
        if (expectedToken.isBlank()) {
            writeJson(response, 503, Map.of(
                    "code", "internal_token_missing",
                    "message", "服务端未配置 INTERNAL_TOKEN，内部接口已关闭"));
            return;
        }
        String provided = request.getHeader(HEADER);
        if (provided == null || !MessageDigest.isEqual(
                expectedToken.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8))) {
            writeJson(response, 401, Map.of(
                    "code", "unauthorized",
                    "message", "内部接口鉴权失败"));
            return;
        }
        filterChain.doFilter(request, response);
    }

    private void writeJson(HttpServletResponse response, int status, Map<String, Object> body)
            throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), body);
    }
}
