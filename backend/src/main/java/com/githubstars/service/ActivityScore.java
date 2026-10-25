package com.githubstars.service;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * 活跃度评分：Star 体量（对数缩放）× 最近推送时间衰减，用于榜单与筛选排序。
 *
 * <p>公式与 repositories.heat_score 的回填 SQL 保持一致：
 * {@code round(log10(stars + 1) * 100 * 新鲜度权重)}，权重按 30 / 90 / 180 天分档。
 */
public final class ActivityScore {

    private static final double WEIGHT_ACTIVE = 1.0;
    private static final double WEIGHT_QUARTER = 0.8;
    private static final double WEIGHT_HALF_YEAR = 0.6;
    private static final double WEIGHT_STALE = 0.4;
    private static final double WEIGHT_UNKNOWN = 0.3;

    private ActivityScore() {
    }

    public static int score(Integer stars, LocalDateTime pushedAt) {
        return score(stars, pushedAt, LocalDateTime.now());
    }

    public static int score(Integer stars, LocalDateTime pushedAt, LocalDateTime now) {
        int starCount = stars == null || stars < 0 ? 0 : stars;
        double base = Math.log10(starCount + 1) * 100;
        return (int) Math.round(base * freshnessWeight(pushedAt, now));
    }

    private static double freshnessWeight(LocalDateTime pushedAt, LocalDateTime now) {
        if (pushedAt == null) {
            return WEIGHT_UNKNOWN;
        }
        long days = Duration.between(pushedAt, now).toDays();
        if (days <= 30) {
            return WEIGHT_ACTIVE;
        }
        if (days <= 90) {
            return WEIGHT_QUARTER;
        }
        if (days <= 180) {
            return WEIGHT_HALF_YEAR;
        }
        return WEIGHT_STALE;
    }
}
