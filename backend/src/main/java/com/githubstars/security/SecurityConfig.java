package com.githubstars.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final GithubOAuth2UserService githubOAuth2UserService;
    private final OAuth2LoginSuccessHandler successHandler;
    private final ObjectMapper objectMapper;
    private final String frontendUrl;
    private final String internalToken;

    public SecurityConfig(GithubOAuth2UserService githubOAuth2UserService,
                          OAuth2LoginSuccessHandler successHandler,
                          ObjectMapper objectMapper,
                          @Value("${app.frontend-url:http://localhost}") String frontendUrl,
                          @Value("${app.internal-token:}") String internalToken) {
        this.githubOAuth2UserService = githubOAuth2UserService;
        this.successHandler = successHandler;
        this.objectMapper = objectMapper;
        this.frontendUrl = frontendUrl.endsWith("/")
                ? frontendUrl.substring(0, frontendUrl.length() - 1)
                : frontendUrl;
        this.internalToken = internalToken;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        SimpleUrlAuthenticationFailureHandler failureHandler =
                new SimpleUrlAuthenticationFailureHandler(frontendUrl + "/login?error=oauth");

        http
                .csrf(csrf -> csrf
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        // 不使用 XOR 掩码，保证浏览器 Cookie 中的 token 可直接作为请求头回传
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                        .ignoringRequestMatchers("/internal/**"))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/health", "/repos/**", "/meta",
                                "/auth/github/login", "/auth/github/callback", "/auth/csrf",
                                "/oauth2/**", "/login/**", "/comparisons/share/**").permitAll()
                        .requestMatchers("/internal/**").permitAll()
                        .requestMatchers("/auth/me", "/auth/logout", "/quota", "/ideas/**",
                                "/comparisons/**").authenticated()
                        .anyRequest().permitAll())
                .oauth2Login(oauth -> oauth
                        .redirectionEndpoint(endpoint -> endpoint.baseUri("/auth/github/callback"))
                        .userInfoEndpoint(userInfo -> userInfo.userService(githubOAuth2UserService))
                        .successHandler(successHandler)
                        .failureHandler(failureHandler))
                .logout(logout -> logout
                        .logoutUrl("/auth/logout")
                        .invalidateHttpSession(true)
                        // Spring Session 失效时会写入同路径的过期 Cookie，无需 deleteCookies
                        .logoutSuccessHandler((request, response, authentication) ->
                                writeJson(response, 200, "ok", "已退出登录")))
                .requestCache(cache -> cache.disable())
                .exceptionHandling(exception -> exception
                        .authenticationEntryPoint((request, response, e) ->
                                writeJson(response, 401, "unauthorized", "请先登录"))
                        .accessDeniedHandler((request, response, e) ->
                                writeJson(response, 403, "forbidden", "无权访问")))
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
                        .sessionFixation(fixation -> fixation.changeSessionId()))
                .addFilterBefore(new InternalTokenFilter(internalToken, objectMapper),
                        AnonymousAuthenticationFilter.class)
                .addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class);

        return http.build();
    }

    private void writeJson(HttpServletResponse response, int status, String code, String message)
            throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), Map.of("code", code, "message", message));
    }
}
