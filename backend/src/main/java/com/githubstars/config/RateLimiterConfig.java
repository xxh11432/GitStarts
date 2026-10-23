package com.githubstars.config;

import com.githubstars.collector.TokenBucketRateLimiter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RateLimiterConfig {

    /**
     * Search API 认证档限流 30 次/分钟，这里留 5 次余量。
     */
    @Bean("searchRateLimiter")
    public TokenBucketRateLimiter searchRateLimiter() {
        return new TokenBucketRateLimiter(25, 25);
    }

    /**
     * REST API 认证档限流 5000 次/小时，这里控制在 80 次/分钟（约 4800/hr）以内。
     */
    @Bean("restRateLimiter")
    public TokenBucketRateLimiter restRateLimiter() {
        return new TokenBucketRateLimiter(80, 80);
    }
}
