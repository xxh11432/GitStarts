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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Future;
import java.util.regex.Pattern;

@Service
public class SyncService {

    private static final Logger log = LoggerFactory.getLogger(SyncService.class);

    private static final String LOCK_PREFIX = "sync:lock:";
    private static final int PAGE_SIZE = 100;
    private static final int PER_QUERY_CAP = 1000;
    private static final int PLATFORM_BACKFILL_BATCH = 500;
    private static final int RELEASE_BATCH = 50;
    private static final int RELEASE_REFRESH_DAYS = 30;
    private static final Pattern REPO_NAME_PATTERN = Pattern.compile("^[A-Za-z0-9_.-]+$");

    // 分层采集门槛：高星基石 / 高活跃主力 / 近期热点 / 语言补齐
    private static final int TIER_STARS_PRIMARY = 5000;
    private static final int TIER_STARS_ACTIVE = 1000;
    private static final int TIER_STARS_RECENT = 300;
    private static final int TIER_STARS_LANGUAGE = 300;

    private static final List<String> TOP_LANGUAGES = List.of(
            "Java", "JavaScript", "TypeScript", "Python", "Go", "Rust", "C++", "C",
            "C#", "PHP", "Ruby", "Swift", "Kotlin", "Scala", "Dart", "Shell", "HTML", "CSS");

    @Value("${github.sync.max-repos:2000}")
    private int maxRepos;

    @Value("${github.sync.incremental-batch:200}")
    private int incrementalBatch;

    @Value("${github.sync.active-days:90}")
    private int activeDays;

    @Value("${github.sync.language-batch:100}")
    private int languageBatch;

    @Value("${github.sync.release-refresh-daily:2000}")
    private int releaseRefreshDaily;

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

    public int targetRepoCount() {
        return maxRepos;
    }

    public int releaseRefreshBudget() {
        return releaseRefreshDaily;
    }

    /**
     * 回填历史仓库的活跃度评分（启动时执行，公式见 ActivityScore）。
     */
    public int backfillHeatScores() {
        int updated = repositoryMapper.backfillHeatScores();
        if (updated > 0) {
            log.info("活跃度评分回填完成，更新 {} 个仓库", updated);
        }
        return updated;
    }

    /**
     * 为 M2 之前入库的仓库补算平台。启动时执行一次，按 id 游标分批处理直到没有缺失行。
     */
    public int backfillPlatforms() {
        int updated = 0;
        long cursor = 0;
        while (true) {
            List<Repository> repos = repositoryMapper.selectList(new LambdaQueryWrapper<Repository>()
                    .and(w -> w.isNull(Repository::getPlatform).or().isNull(Repository::getPlatforms))
                    .gt(Repository::getId, cursor)
                    .orderByAsc(Repository::getId)
                    .last("LIMIT " + PLATFORM_BACKFILL_BATCH));
            if (repos.isEmpty()) {
                break;
            }
            for (Repository repo : repos) {
                repo.setPlatform(platformResolver.resolve(repo.getDescription(), repo.getTopics(), repo.getLanguage()));
                repo.setPlatforms(String.join(",", platformResolver.resolveAll(
                        repo.getDescription(), repo.getTopics(), repo.getLanguage())));
                repo.setHeatScore(ActivityScore.score(repo.getStars(), repo.getPushedAt()));
                repositoryMapper.updateById(repo);
                cursor = repo.getId();
                updated++;
            }
        }
        if (updated > 0) {
            log.info("平台回填完成，更新 {} 个仓库", updated);
        }
        return updated;
    }

    /**
     * 分层发现：单条 Search 查询最多 1000 条，按「高星 → 近期活跃 → 近期热点 → 语言补齐」
     * 多趟拉取，依赖 full_name 唯一键去重，直到仓库总量达到 github.sync.max-repos。
     */
    public int discoverySync() {
        if (!tryLock("discovery")) {
            log.info("已有实例在执行 discovery_sync，跳过");
            return 0;
        }
        SyncLog syncLog = startLog("discovery");
        SyncStats stats = new SyncStats();
        try {
            LocalDateTime now = LocalDateTime.now();
            collectTier("stars:>=" + TIER_STARS_PRIMARY + " archived:false",
                    "stars", "desc", PER_QUERY_CAP, stats);
            collectTier("stars:>=" + TIER_STARS_ACTIVE + " pushed:>=" + dateFrom(now.minusDays(activeDays))
                            + " archived:false",
                    "updated", "desc", PER_QUERY_CAP, stats);
            collectTier("stars:>=" + TIER_STARS_RECENT + " pushed:>=" + dateFrom(now.minusDays(30))
                            + " archived:false",
                    "stars", "desc", 500, stats);
            for (String language : TOP_LANGUAGES) {
                if (remaining() <= 0) {
                    break;
                }
                collectTier("language:" + language + " stars:>=" + TIER_STARS_LANGUAGE
                                + " pushed:>=" + dateFrom(now.minusDays(180)) + " archived:false",
                        "stars", "desc", languageBatch, stats);
            }
            finishLog(syncLog, "success", stats, null);
            log.info("discovery_sync 完成，当前仓库 {} / 目标 {}", countRepos(), maxRepos);
        } catch (Exception e) {
            log.error("discovery_sync 执行失败", e);
            finishLog(syncLog, "failed", stats, e.getMessage());
        } finally {
            unlock("discovery");
        }
        return stats.total;
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
                    .last("LIMIT " + incrementalBatch));
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
            refreshReleasesFor(repos);
            finishLog(syncLog, "success", stats, null);
        } catch (Exception e) {
            log.error("incremental 执行失败", e);
            finishLog(syncLog, "failed", stats, e.getMessage());
        } finally {
            unlock("incremental");
        }
    }

    /**
     * 拉取一层查询并入库；每页开始前按 MySQL 实际总量与目标差额判断是否继续，
     * 单层搜索失败只跳过该层，不影响后续分层。
     */
    private void collectTier(String query, String sort, String order, int tierCap, SyncStats stats) {
        int fetched = 0;
        int page = 1;
        while (fetched < tierCap) {
            // 只按「新增」消耗配额：命中已存在仓库时 upsert 只更新，不占用目标名额
            int room = remaining();
            if (room <= 0) {
                return;
            }
            JsonNode result;
            try {
                result = githubClient.searchRepositories(query, sort, order, page, PAGE_SIZE);
            } catch (Exception e) {
                log.warn("分层查询失败（query={}，page={}）：{}", query, page, e.getMessage());
                stats.failed++;
                return;
            }
            JsonNode items = result.path("items");
            if (!items.isArray() || items.isEmpty()) {
                return;
            }
            List<Repository> pageRepos = new ArrayList<>();
            for (JsonNode item : items) {
                if (fetched >= tierCap) {
                    break;
                }
                fetched++;
                stats.total++;
                try {
                    Repository repo = mapRepo(item);
                    Upsert upsert = upsert(repo);
                    repo.setId(upsert.id());
                    if (upsert.inserted()) {
                        room--;
                    }
                    pageRepos.add(repo);
                    tagService.syncTags(repo);
                    stats.succeeded++;
                } catch (Exception e) {
                    log.warn("处理仓库失败：{}", item.path("full_name").asText(""), e);
                    stats.failed++;
                }
                if (room <= 0) {
                    break;
                }
            }
            refreshReleasesFor(pageRepos);
            if (items.size() < PAGE_SIZE || fetched >= tierCap || room <= 0) {
                return;
            }
            page++;
        }
    }

    private int remaining() {
        return (int) Math.max(0, maxRepos - countRepos());
    }

    private String dateFrom(LocalDateTime time) {
        return time.toLocalDate().toString();
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
            repo.setHeatScore(ActivityScore.score(repo.getStars(), repo.getPushedAt()));
            repo.setSyncedAt(LocalDateTime.now());
            repositoryMapper.updateById(repo);
            return true;
        } catch (Exception e) {
            log.warn("更新仓库 {} 失败：{}", repo.getFullName(), e.getMessage());
            return false;
        }
    }

    private Upsert upsert(Repository repo) {
        Repository existing = repositoryMapper.selectOne(
                new LambdaQueryWrapper<Repository>().eq(Repository::getFullName, repo.getFullName()));
        if (existing == null) {
            repositoryMapper.insert(repo);
            return new Upsert(repo.getId(), true);
        }
        repo.setId(existing.getId());
        repositoryMapper.updateById(repo);
        return new Upsert(repo.getId(), false);
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
        repo.setPlatforms(String.join(",", platformResolver.resolveAll(
                repo.getDescription(), repo.getTopics(), repo.getLanguage())));
        repo.setHeatScore(ActivityScore.score(repo.getStars(), repo.getPushedAt()));
        repo.setSyncedAt(LocalDateTime.now());
        return repo;
    }

    /**
     * 刷新一批仓库的最新 Release（GraphQL 批量，50 个一批）。
     * 没有 Release 的仓库也会记录 releaseCheckedAt，避免每天重复检查。
     */
    private int refreshReleasesFor(List<Repository> repos) {
        if (repos == null || repos.isEmpty()) {
            return 0;
        }
        List<Repository> valid = new ArrayList<>();
        for (Repository repo : repos) {
            if (repo.getId() == null || repo.getOwner() == null || repo.getName() == null) {
                continue;
            }
            if (REPO_NAME_PATTERN.matcher(repo.getOwner()).matches()
                    && REPO_NAME_PATTERN.matcher(repo.getName()).matches()) {
                valid.add(repo);
            }
        }
        int updated = 0;
        for (int start = 0; start < valid.size(); start += RELEASE_BATCH) {
            List<Repository> batch = valid.subList(start, Math.min(start + RELEASE_BATCH, valid.size()));
            updated += refreshReleaseBatch(batch);
        }
        return updated;
    }

    private int refreshReleaseBatch(List<Repository> batch) {
        StringBuilder query = new StringBuilder("query{");
        Map<String, Repository> byAlias = new LinkedHashMap<>();
        for (int i = 0; i < batch.size(); i++) {
            Repository repo = batch.get(i);
            String alias = "r" + i;
            byAlias.put(alias, repo);
            query.append(alias).append(":repository(owner:\"").append(repo.getOwner())
                    .append("\",name:\"").append(repo.getName())
                    .append("\"){latestRelease{tagName publishedAt}}");
        }
        query.append('}');

        JsonNode data;
        try {
            data = githubClient.graphql(query.toString()).path("data");
        } catch (Exception e) {
            log.warn("刷新 Release 失败：{}", e.getMessage());
            return 0;
        }

        LocalDateTime now = LocalDateTime.now();
        int updated = 0;
        for (Map.Entry<String, Repository> entry : byAlias.entrySet()) {
            Repository repo = entry.getValue();
            JsonNode release = data.path(entry.getKey()).path("latestRelease");
            Repository patch = new Repository();
            patch.setId(repo.getId());
            patch.setReleaseCheckedAt(now);
            if (!release.isNull() && !release.isMissingNode()) {
                String tag = release.path("tagName").asText(null);
                if (tag != null && !tag.isBlank() && tag.length() <= 64) {
                    patch.setLatestReleaseTag(tag);
                }
                LocalDateTime publishedAt = parseDate(release.path("publishedAt"));
                if (publishedAt != null) {
                    patch.setLatestReleaseAt(publishedAt);
                }
            }
            repositoryMapper.updateById(patch);
            if (patch.getLatestReleaseTag() != null) {
                repo.setLatestReleaseTag(patch.getLatestReleaseTag());
            }
            repo.setLatestReleaseAt(patch.getLatestReleaseAt());
            repo.setReleaseCheckedAt(now);
            updated++;
        }
        return updated;
    }

    /**
     * 补齐/刷新历史仓库的 Release 信息；按 id 游标分页，30 天内的不重复检查。
     */
    public int refreshReleases(int maxRepos) {
        int updated = 0;
        long cursor = 0;
        LocalDateTime cutoff = LocalDateTime.now().minusDays(RELEASE_REFRESH_DAYS);
        while (updated < maxRepos) {
            int limit = Math.min(RELEASE_BATCH * 2, maxRepos - updated);
            List<Repository> repos = repositoryMapper.selectList(new LambdaQueryWrapper<Repository>()
                    .and(w -> w.isNull(Repository::getReleaseCheckedAt)
                            .or().lt(Repository::getReleaseCheckedAt, cutoff))
                    .gt(Repository::getId, cursor)
                    .orderByAsc(Repository::getId)
                    .last("LIMIT " + limit));
            if (repos.isEmpty()) {
                break;
            }
            updated += refreshReleasesFor(repos);
            cursor = repos.get(repos.size() - 1).getId();
        }
        if (updated > 0) {
            log.info("Release 刷新完成，更新 {} 个仓库", updated);
        }
        return updated;
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

    private record Upsert(Long id, boolean inserted) {
    }

    private static class SyncStats {
        int total = 0;
        int succeeded = 0;
        int failed = 0;
    }
}
