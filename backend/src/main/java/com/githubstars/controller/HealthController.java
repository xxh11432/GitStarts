package com.githubstars.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 健康检查：同时探测 MySQL 与 Redis，依赖不可用时返回 503，供容器健康检查与入口层判断。
 */
@RestController
public class HealthController {

    private static final Logger log = LoggerFactory.getLogger(HealthController.class);

    private final DataSource dataSource;
    private final StringRedisTemplate redisTemplate;

    public HealthController(DataSource dataSource, StringRedisTemplate redisTemplate) {
        this.dataSource = dataSource;
        this.redisTemplate = redisTemplate;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        boolean mysql = checkMysql();
        boolean redis = checkRedis();
        boolean healthy = mysql && redis;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", healthy ? "ok" : "degraded");
        body.put("service", "github-stars-backend");
        body.put("timestamp", LocalDateTime.now().toString());
        body.put("checks", Map.of("mysql", mysql ? "up" : "down", "redis", redis ? "up" : "down"));
        return ResponseEntity.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }

    private boolean checkMysql() {
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid(1);
        } catch (Exception e) {
            log.warn("health_mysql_down error={}", e.getClass().getSimpleName());
            return false;
        }
    }

    private boolean checkRedis() {
        RedisConnection connection = null;
        try {
            connection = redisTemplate.getConnectionFactory().getConnection();
            return "PONG".equalsIgnoreCase(connection.ping());
        } catch (Exception e) {
            log.warn("health_redis_down error={}", e.getClass().getSimpleName());
            return false;
        } finally {
            if (connection != null) {
                connection.close();
            }
        }
    }
}
