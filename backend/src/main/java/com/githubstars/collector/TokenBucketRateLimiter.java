package com.githubstars.collector;

/**
 * 令牌桶限流器，用于控制对 GitHub API 的请求频率。
 * 线程安全，acquire 在令牌不足时会阻塞等待。
 */
public class TokenBucketRateLimiter {

    private final double capacity;
    private final double refillPerSecond;
    private double tokens;
    private long lastRefillNanos;
    private final Object lock = new Object();

    public TokenBucketRateLimiter(double capacity, double refillPerMinute) {
        this.capacity = capacity;
        this.refillPerSecond = refillPerMinute / 60.0;
        this.tokens = capacity;
        this.lastRefillNanos = System.nanoTime();
    }

    public void acquire() {
        while (true) {
            synchronized (lock) {
                refill();
                if (tokens >= 1.0) {
                    tokens -= 1.0;
                    return;
                }
            }
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private void refill() {
        long now = System.nanoTime();
        double elapsedSeconds = (now - lastRefillNanos) / 1_000_000_000.0;
        tokens = Math.min(capacity, tokens + elapsedSeconds * refillPerSecond);
        lastRefillNanos = now;
    }
}
