package com.githubstars.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * 启动期安全自检：把“上线漏配”从静默降级变成显式失败。
 *
 * 只对声明了 HTTPS 前端地址的部署做硬校验（本地 http 调试不受影响）：
 * - HTTPS 站点必须开启 SESSION_COOKIE_SECURE，否则会话 Cookie 会走明文；
 * - HTTPS 站点不允许继续使用示例数据库 / Redis 口令。
 */
@Configuration
public class StartupSecurityCheck {

    private static final Logger log = LoggerFactory.getLogger(StartupSecurityCheck.class);

    private static final String DEFAULT_DB_PASSWORD = "githubstarspass";
    private static final String DEFAULT_REDIS_PASSWORD = "redispass";

    private final String environment;
    private final String frontendUrl;
    private final boolean secureCookie;
    private final String internalToken;
    private final String dbPassword;
    private final String redisPassword;

    public StartupSecurityCheck(@Value("${app.environment:production}") String environment,
                                @Value("${app.frontend-url:http://localhost}") String frontendUrl,
                                @Value("${server.servlet.session.cookie.secure:false}") boolean secureCookie,
                                @Value("${app.internal-token:}") String internalToken,
                                @Value("${spring.datasource.password:}") String dbPassword,
                                @Value("${spring.data.redis.password:}") String redisPassword) {
        this.environment = environment;
        this.frontendUrl = frontendUrl;
        this.secureCookie = secureCookie;
        this.internalToken = internalToken;
        this.dbPassword = dbPassword;
        this.redisPassword = redisPassword;
    }

    @PostConstruct
    void validate() {
        boolean httpsSite = frontendUrl.startsWith("https://");

        if (httpsSite && !secureCookie) {
            throw new IllegalStateException(
                    "APP_FRONTEND_URL 为 HTTPS，但 SESSION_COOKIE_SECURE=false；"
                            + "请改为 true，否则会话 Cookie 会以明文传输");
        }
        if (!httpsSite && secureCookie) {
            log.warn("SESSION_COOKIE_SECURE=true 但 APP_FRONTEND_URL={} 不是 HTTPS，"
                    + "浏览器将不会回传会话 Cookie", frontendUrl);
        }
        if (httpsSite && DEFAULT_DB_PASSWORD.equals(dbPassword)) {
            throw new IllegalStateException("生产环境仍在使用示例 MySQL 口令，请修改 MYSQL_PASSWORD");
        }
        if (httpsSite && DEFAULT_REDIS_PASSWORD.equals(redisPassword)) {
            throw new IllegalStateException("生产环境仍在使用示例 Redis 口令，请修改 REDIS_PASSWORD");
        }
        if (!httpsSite && (DEFAULT_DB_PASSWORD.equals(dbPassword)
                || DEFAULT_REDIS_PASSWORD.equals(redisPassword))) {
            log.warn("当前仍在使用 .env.example 的示例数据库 / Redis 口令，仅适用于本地调试");
        }
        if (internalToken == null || internalToken.isBlank()) {
            log.error("INTERNAL_TOKEN 为空：/api/internal/** 已 fail-closed，"
                    + "AI 对话 / 匹配 / 对比全部不可用");
        }
        if (httpsSite && (internalToken == null || internalToken.length() < 32)) {
            log.warn("INTERNAL_TOKEN 长度不足 32 字符，建议使用 openssl rand -hex 32 重新生成");
        }
        log.info("security_check_passed environment={} https_site={} secure_cookie={}",
                environment, httpsSite, secureCookie);
    }
}
