package com.githubstars.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.githubstars.entity.Comparison;
import com.githubstars.exception.ComparisonNotFoundException;
import com.githubstars.mapper.ComparisonMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ComparisonServiceTest {

    private ComparisonMapper mapper;
    private ComparisonService service;

    @BeforeEach
    void setUp() {
        mapper = mock(ComparisonMapper.class);
        service = new ComparisonService(mapper, new ObjectMapper());
    }

    @Test
    void otherUserCannotReadComparison() {
        when(mapper.selectById(9L)).thenReturn(comparison(2L));

        assertThrows(ComparisonNotFoundException.class, () -> service.get(9L, 1L));
    }

    @Test
    void shareCreatesTokenOnce() {
        Comparison own = comparison(1L);
        when(mapper.selectById(9L)).thenReturn(own);
        // 模拟落库：把生成的 share token 写回实体，第二次分享应复用同一 token
        when(mapper.updateById(any(Comparison.class))).thenAnswer(invocation -> {
            Comparison patch = invocation.getArgument(0);
            own.setShareToken(patch.getShareToken());
            return 1;
        });

        String token = service.share(9L, 1L);

        assertNotNull(token);
        assertEquals(32, token.length());
        verify(mapper).updateById(any(Comparison.class));
        assertEquals(token, service.share(9L, 1L));
    }

    @Test
    void shareRevokeAndDeleteRejectOtherUser() {
        when(mapper.selectById(9L)).thenReturn(comparison(2L));

        assertThrows(ComparisonNotFoundException.class, () -> service.share(9L, 1L));
        assertThrows(ComparisonNotFoundException.class, () -> service.revokeShare(9L, 1L));
        assertThrows(ComparisonNotFoundException.class, () -> service.delete(9L, 1L));
    }

    @Test
    void unknownShareTokenIsRejected() {
        when(mapper.selectOne(any())).thenReturn(null);

        assertThrows(ComparisonNotFoundException.class, () -> service.getByShare("0123456789abcdef0123456789abcdef"));
        assertThrows(ComparisonNotFoundException.class, () -> service.getByShare("short"));
        assertThrows(ComparisonNotFoundException.class, () -> service.getByShare(null));
    }

    private Comparison comparison(Long userId) {
        Comparison comparison = new Comparison();
        comparison.setId(9L);
        comparison.setUserId(userId);
        comparison.setRepoKeys("a/b,c/d");
        comparison.setSchemaVersion("v1");
        comparison.setResult("{}");
        comparison.setCacheKey("cache");
        comparison.setCreatedAt(LocalDateTime.now());
        return comparison;
    }
}
