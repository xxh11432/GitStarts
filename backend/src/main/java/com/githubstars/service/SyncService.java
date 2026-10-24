package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.githubstars.collector.GithubClient;
import com.githubstars.entity.Repository;
import com.githubstars.entity.SyncLog;
import com.githubstars.mapper.RepositoryMapper;
import com.githubstars.mapper.SyncLogMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Future;

@Service
public class SyncService {

    private static final Logger log = LoggerFactory.getLogger(SyncService.class);

    private static final String LOCK_PREFIX = "sync:lock:";
    private static final int PAGE_SIZE = 100;
    private static final int DEFAULT_MAX_REPOS = 1000;
    private static final int INCREMENTAL_BATCH = 100;

    private static final List<String> TOP_LANGUAGES = List.of(
            "Java", "JavaScript", "TypeScript", "Python", "Go", "Rust", "C++", "C",
            "C#", "PHP", "Ruby", "Swift", "Kotlin", "Scala", "Dart", "Shell", "HTML", "CSS");

    private final GithubClient githubClient;
    private final RepositoryMapper repositoryMapper;
    private final SyncLogMapper syncLogMapper;
    private final TagService tagService;
    private final Categorizer categorizer;
    private final PlatformResolver platformResolver;
    private final StringRedisTemplate redisTemplate;
    private final ThreadPoolTaskExecutor syncExecutor;

    public SyncService(GithubClient githubClient,
                       RepositoryMapper repositoryMapper,
                       SyncLogMapper syncLogMapper,
                       TagService tagService,
                       Categorizer categorizer,
                       PlatformResolver platformResolver,
                       StringRedisTemplate redisTemplate,
                       @Qualifier("syncExecutor") ThreadPoolTaskExecutor syncExecutor) {
        this.githubClient = githubClient;
        this.repositoryMapper = repositoryMapper;
        this.syncLogMapper = syncLogMapper;
        this.tagService = tagService;
        this.categorizer = categorizer;
        this.platformResolver = platformResolver;
        this.redisTemplate = redisTemplate;
        this.syncExecutor = syncExecutor;
    }

    public long countRepos() {
        Long count = repositoryMapper.selectCount(null);
        return count == null ? 0 : count;
    }

    /**
     * 为 M2 之前入库的仓库补算平台。启动时执行一次，按需分批处理。
     */
    public int backfillPlatforms() {
        List<Repository> repos = repositoryMapper.selectList(new LambdaQueryWrapper<Repository>()
                .isNull(Repository::getPlatform)
                .last("LIMIT 5000"));
        int updated = 0;
        for (Repository repo : repos) {
            repo.setPlatform(platformResolver.resolve(repo.getDescription(), repo.getTopics(), repo.getLanguage()));
            repositoryMapper.updateById(repo);
            updated++;
        }
        if (updated > 0) {
            log.info("平台回填完成，更新 {} 个仓库", updated);
        }
        return updated;
    }

    public void fullSync() {
        fullSync(DEFAULT_MAX_REPOS);
    }

    public void fullSync(int maxRepos) {
        if (!tryLock("full")) {
            log.info("已有实例在执行 full_sync，跳过");
            return;
        }
        SyncLog syncLog = startLog("full_sync");
        SyncStats stats = new SyncStats();
        try {
            fetchByQuery("stars:>=100", maxRepos, stats);
            finishLog(syncLog, "success", stats, null);
        } catch (Exception e) {
            log.error("full_sync 执行失败", e);
            finishLog(syncLog, "failed", stats, e.getMessage());
        } finally {
            unlock("full");
        }
    }

    public void languageSync() {
        if (!tryLock("language")) {
            log.info("已有实例在执行 language_sync，跳过");
            return;
        }
        SyncLog syncLog = startLog("language");
        SyncStats stats = new SyncStats();
        try {
            int perLanguage = 100;
            for (String language : TOP_LANGUAGES) {
                fetchByQuery("language:" + language + " stars:>=100", perLanguage, stats);
            }
            finishLog(syncLog, "success", stats, null);
        } catch (Exception e) {
            log.error("language_sync 执行失败", e);
            finishLog(syncLog, "failed", stats, e.getMessage());
        } finally {
            unlock("language");
        }
    }

    public void incrementalSync() {
        if (!tryLock("incremental")) {
            log.info("已有实例在执行 incremental，跳过");
            return;
        }
        SyncLog syncLog = startLog("incremental");
        SyncStats stats = new SyncStats();
        try {
            List<Repository> repos = repositoryMapper.selectList(new LambdaQueryWrapper<Repository>()
                    .orderByAsc(Repository::getSyncedAt)
                    .last("LIMIT " + INCREMENTAL_BATCH));
            stats.total = repos.size();

            List<Future<Boolean>> futures = new ArrayList<>();
            for (Repository repo : repos) {
                futures.add(syncExecutor.submit(() -> updateRepoStats(repo)));
            }
            for (Future<Boolean> future : futures) {
                try {
                    if (Boolean.TRUE.equals(future.get())) {
                        stats.succeeded++;
                    } else {
                        stats.failed++;
                    }
                } catch (Exception e) {
                    stats.failed++;
                }
            }
            finishLog(syncLog, "success", stats, null);
        } catch (Exception e) {
            log.error("incremental 执行失败", e);
            finishLog(syncLog, "failed", stats, e.getMessage());
        } finally {
            unlock("incremental");
        }
    }

    private void fetchByQuery(String query, int maxRepos, SyncStats stats) {
        int page = 1;
        while (stats.total < maxRepos) {
            JsonNode result;
            try {
                result = githubClient.searchRepositories(query, "stars", "desc", page, PAGE_SIZE);
            } catch (Exception e) {
                log.warn("搜索第 {} 页失败：{}", page, e.getMessage());
                stats.failed++;
                return;
            }
            JsonNode items = result.path("items");
            if (!items.isArray() || items.isEmpty()) {
                return;
            }
            for (JsonNode item : items) {
                stats.total++;
                try {
                    Repository repo = mapRepo(item);
                    upsert(repo);
                    tagService.syncTags(repo);
                    stats.succeeded++;
                } catch (Exception e) {
                    log.warn("处理仓库失败：{}", item.path("full_name").asText(""), e);
                    stats.failed++;
                }
            }
            if (items.size() < PAGE_SIZE) {
                return;
            }
            page++;
        }
    }

    private boolean updateRepoStats(Repository repo) {
        try {
            JsonNode node = githubClient.getRepository(repo.getOwner(), repo.getName());
            repo.setStars(node.path("stargazers_count").asInt(repo.getStars()));
            repo.setForks(node.path("forks_count").asInt(repo.getForks()));
            repo.setWatchers(node.path("watchers_count").asInt(repo.getWatchers()));
            repo.setOpenIssues(node.path("open_issues_count").asInt(repo.getOpenIssues()));
            repo.setPushedAt(parseDate(node.path("pushed_at")));
            repo.setArchived(node.path("archived").asBoolean(false) ? 1 : 0);
            repo.setSyncedAt(LocalDateTime.now());
            repositoryMapper.updateById(repo);
            return true;
        } catch (Exception e) {
            log.warn("更新仓库 {} 失败：{}", repo.getFullName(), e.getMessage());
            return false;
        }
    }

    private void upsert(Repository repo) {
        Repository existing = repositoryMapper.selectOne(
                new LambdaQueryWrapper<Repository>().eq(Repository::getFullName, repo.getFullName()));
        if (existing == null) {
            repositoryMapper.insert(repo);
        } else {
            repo.setId(existing.getId());
            repositoryMapper.updateById(repo);
        }
    }

    private Repository mapRepo(JsonNode item) {
        Repository repo = new Repository();
        repo.setFullName(item.path("full_name").asText(null));
        repo.setName(item.path("name").asText(null));
        repo.setOwner(item.path("owner").path("login").asText(null));
        repo.setDescription(item.path("description").asText(null));
        repo.setHomepage(item.path("homepage").asText(null));
        repo.setLanguage(item.path("language").asText(null));
        JsonNode license = item.path("license");
        if (license != null && !license.isNull()) {
            repo.setLicense(license.path("spdx_id").asText(null));
        }
        repo.setStars(item.path("stargazers_count").asInt(0));
        repo.setForks(item.path("forks_count").asInt(0));
        repo.setWatchers(item.path("watchers_count").asInt(0));
        repo.setOpenIssues(item.path("open_issues_count").asInt(0));
        JsonNode topics = item.path("topics");
        repo.setTopics(topics.isArray() ? topics.toString() : null);
        repo.setDefaultBranch(item.path("default_branch").asText(null));
        repo.setPushedAt(parseDate(item.path("pushed_at")));
        repo.setCreatedAt(parseDate(item.path("created_at")));
        repo.setArchived(item.path("archived").asBoolean(false) ? 1 : 0);
        repo.setDisabled(item.path("disabled").asBoolean(false) ? 1 : 0);
        repo.setCategory(categorizer.categorize(repo.getDescription(), repo.getTopics(), repo.getLanguage()));
        repo.setPlatform(platformResolver.resolve(repo.getDescription(), repo.getTopics(), repo.getLanguage()));
        repo.setSyncedAt(LocalDateTime.now());
        return repo;
    }

    private LocalDateTime parseDate(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        String text = node.asText(null);
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return OffsetDateTime.parse(text).toLocalDateTime();
        } catch (Exception e) {
            try {
                return LocalDateTime.parse(text);
            } catch (Exception e2) {
                return null;
            }
        }
    }

    private SyncLog startLog(String jobType) {
        SyncLog syncLog = new SyncLog();
        syncLog.setJobType(jobType);
        syncLog.setStartedAt(LocalDateTime.now());
        syncLog.setStatus("running");
        syncLogMapper.insert(syncLog);
        return syncLog;
    }

    private void finishLog(SyncLog syncLog, String status, SyncStats stats, String errorDetail) {
        syncLog.setStatus(status);
        syncLog.setFinishedAt(LocalDateTime.now());
        syncLog.setTotal(stats.total);
        syncLog.setSucceeded(stats.succeeded);
        syncLog.setFailed(stats.failed);
        syncLog.setErrorDetail(errorDetail);
        syncLogMapper.updateById(syncLog);
    }

    private boolean tryLock(String job) {
        Boolean ok = redisTemplate.opsForValue().setIfAbsent(LOCK_PREFIX + job, "1", Duration.ofHours(2));
        return Boolean.TRUE.equals(ok);
    }

    private void unlock(String job) {
        redisTemplate.delete(LOCK_PREFIX + job);
    }

    private static class SyncStats {
        int total = 0;
        int succeeded = 0;
        int failed = 0;
    }
}
