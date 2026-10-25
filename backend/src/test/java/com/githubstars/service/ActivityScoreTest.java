package com.githubstars.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ActivityScoreTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 25, 12, 0);

    @Test
    void recentRepositoryOutscoresStaleOne() {
        int active = ActivityScore.score(50_000, NOW.minusDays(5), NOW);
        int stale = ActivityScore.score(50_000, NOW.minusDays(200), NOW);

        assertTrue(active > stale, "近期有推送的仓库热度应更高");
    }

    @Test
    void freshnessBucketsFollowDocumentedFormula() {
        assertEquals(470, ActivityScore.score(50_000, NOW.minusDays(5), NOW));
        assertEquals(376, ActivityScore.score(50_000, NOW.minusDays(60), NOW));
        assertEquals(282, ActivityScore.score(50_000, NOW.minusDays(120), NOW));
        assertEquals(188, ActivityScore.score(50_000, NOW.minusDays(200), NOW));
        assertEquals(141, ActivityScore.score(50_000, null, NOW));
    }

    @Test
    void missingStarsScoreZero() {
        assertEquals(0, ActivityScore.score(null, NOW, NOW));
        assertEquals(0, ActivityScore.score(0, NOW, NOW));
    }
}
