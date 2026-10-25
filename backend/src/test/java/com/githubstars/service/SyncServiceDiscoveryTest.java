package com.githubstars.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.githubstars.collector.GithubClient;
import com.githubstars.entity.Repository;
import com.githubstars.entity.SyncLog;
import com.githubstars.mapper.RepositoryMapper;
import com.githubstars.mapper.SyncLogMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 分层发现的关键约束：总量不得超过目标；达到目标后不再发起语言补齐查询。
 */
class SyncServiceDiscoveryTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicLong stored = new AtomicLong();
    private final AtomicInteger pageCounter = new AtomicInteger();

    private GithubClient githubClient;
    private RepositoryMapper repositoryMapper;
    private StringRedisTemplate redisTemplate;
    private SyncService syncService;

    @BeforeEach
    void setUp() {
        githubClient = mock(GithubClient.class);
        repositoryMapper = mock(RepositoryMapper.class);
        SyncLogMapper syncLogMapper = mock(SyncLogMapper.class);
        TagService tagService = mock(TagService.class);
        Categorizer categorizer = mock(Categorizer.class);
        PlatformResolver platformResolver = mock(PlatformResolver.class);
        redisTemplate = mock(StringRedisTemplate.class);
        ThreadPoolTaskExecutor syncExecutor = mock(ThreadPoolTaskExecutor.class);

        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOps = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
        when(valueOps.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(true);

        when(repositoryMapper.selectCount(any())).thenAnswer(invocation -> stored.get());
        when(repositoryMapper.selectOne(any())).thenReturn(null);
        when(repositoryMapper.insert(any(Repository.class))).thenAnswer(invocation -> {
            Repository repo = invocation.getArgument(0);
            repo.setId(stored.incrementAndGet());
            return 1;
        });
        when(repositoryMapper.updateById(any(Repository.class))).thenReturn(1);
        when(syncLogMapper.insert(any(SyncLog.class))).thenReturn(1);
        when(syncLogMapper.updateById(any(SyncLog.class))).thenReturn(1);
        when(githubClient.graphql(anyString())).thenReturn(objectMapper.createObjectNode());
        when(githubClient.searchRepositories(anyString(), anyString(), anyString(), anyInt(), anyInt()))
                .thenAnswer(invocation -> repoPage(pageCounter.incrementAndGet(), invocation.getArgument(4)));
        when(platformResolver.resolveAll(any(), any(), any())).thenReturn(List.of());

        syncService = new SyncService(githubClient, repositoryMapper, syncLogMapper, tagService,
                categorizer, platformResolver, redisTemplate, syncExecutor);
        ReflectionTestUtils.setField(syncService, "maxRepos", 2600);
        ReflectionTestUtils.setField(syncService, "incrementalBatch", 200);
        ReflectionTestUtils.setField(syncService, "activeDays", 90);
        ReflectionTestUtils.setField(syncService, "languageBatch", 100);
        ReflectionTestUtils.setField(syncService, "releaseRefreshDaily", 2000);
    }

    @Test
    void stopsAtTargetAndSkipsLanguageTiersOnceFull() {
        int processed = syncService.discoverySync();

        assertEquals(2600, processed, "达到目标后应立即停止，不再多抓");
        assertEquals(2600, stored.get(), "入库总量应等于目标值");
        // 高星 10 页 + 活跃 10 页 + 热点 5 页 + 语言补齐 1 页
        verify(githubClient, times(26))
                .searchRepositories(anyString(), anyString(), anyString(), anyInt(), anyInt());
        verify(githubClient, times(1))
                .searchRepositories(contains("language:Java"), anyString(), anyString(), anyInt(), anyInt());
    }

    private ObjectNode repoPage(int sequence, int perPage) {
        ObjectNode root = objectMapper.createObjectNode();
        ArrayNode items = root.putArray("items");
        for (int index = 0; index < perPage; index++) {
            String suffix = sequence + "-" + index;
            ObjectNode item = items.addObject();
            item.put("full_name", "owner/repo-" + suffix);
            item.put("name", "repo-" + suffix);
            item.putObject("owner").put("login", "owner");
            item.put("description", "demo repository");
            item.put("language", "Java");
            item.put("stargazers_count", 10000);
            item.put("forks_count", 100);
            item.put("watchers_count", 100);
            item.put("open_issues_count", 5);
            item.put("default_branch", "main");
            item.put("pushed_at", "2026-10-20T00:00:00Z");
            item.put("created_at", "2020-01-01T00:00:00Z");
            item.put("archived", false);
            item.put("disabled", false);
        }
        return root;
    }
}
