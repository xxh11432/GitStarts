package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.githubstars.collector.GithubClient;
import com.githubstars.dto.PageResult;
import com.githubstars.dto.ReadmeSummary;
import com.githubstars.dto.RepoResponse;
import com.githubstars.entity.RepoTag;
import com.githubstars.entity.Repository;
import com.githubstars.entity.Tag;
import com.githubstars.exception.RepoNotFoundException;
import com.githubstars.mapper.RepoTagMapper;
import com.githubstars.mapper.RepositoryMapper;
import com.githubstars.mapper.TagMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class RepoService {

    private static final Logger log = LoggerFactory.getLogger(RepoService.class);

    private static final int SIMILAR_POOL_SIZE = 200;
    private static final int README_SUMMARY_CHARS = 600;

    private final RepositoryMapper repositoryMapper;
    private final TagMapper tagMapper;
    private final RepoTagMapper repoTagMapper;
    private final RepoAssembler assembler;
    private final Categorizer categorizer;
    private final CacheService cacheService;
    private final GithubClient githubClient;
    private final ReadmeSummarizer readmeSummarizer;

    public RepoService(RepositoryMapper repositoryMapper, TagMapper tagMapper, RepoTagMapper repoTagMapper,
                       RepoAssembler assembler, Categorizer categorizer, CacheService cacheService,
                       GithubClient githubClient, ReadmeSummarizer readmeSummarizer) {
        this.repositoryMapper = repositoryMapper;
        this.tagMapper = tagMapper;
        this.repoTagMapper = repoTagMapper;
        this.assembler = assembler;
        this.categorizer = categorizer;
        this.cacheService = cacheService;
        this.githubClient = githubClient;
        this.readmeSummarizer = readmeSummarizer;
    }

    public RepoResponse getRepo(String fullName) {
        String normalized = normalizeFullName(fullName);
        String key = "repo:detail:" + normalized;
        return cacheService.get(key, RepoResponse.class).orElseGet(() -> {
            Repository repo = findRepo(normalized);
            RepoResponse response = assembler.toResponse(repo);
            cacheService.set(key, response, Duration.ofHours(1));
            return response;
        });
    }

    /**
     * 详情页 README 摘要：按需从 GitHub 读取并缓存，失败时仍返回仓库与原文链接。
     */
    public ReadmeSummary readmeSummary(String fullName) {
        String normalized = normalizeFullName(fullName);
        String key = "repo:readme:" + normalized;
        return cacheService.get(key, ReadmeSummary.class).orElseGet(() -> {
            Repository repo = findRepo(normalized);
            String summary = null;
            try {
                String markdown = githubClient.getReadme(repo.getOwner(), repo.getName());
                summary = readmeSummarizer.summarize(markdown, README_SUMMARY_CHARS);
            } catch (Exception e) {
                log.warn("读取 README 失败：{}，{}", normalized, e.getMessage());
            }
            ReadmeSummary result = new ReadmeSummary(normalized, summary, "https://github.com/" + normalized);
            cacheService.set(key, result, summary == null ? Duration.ofMinutes(10) : Duration.ofHours(24));
            return result;
        });
    }

    /**
     * 相关推荐：同分类 / 同平台的候选池内，按 topics 重合、语言、平台、分类与 star 接近度排序。
     */
    public List<RepoResponse> similarRepos(String fullName, int limit) {
        String normalized = normalizeFullName(fullName);
        int effectiveLimit = Math.min(Math.max(limit, 1), 20);
        String key = "repo:similar:" + normalized + ":" + effectiveLimit;
        return cacheService.get(key, new TypeReference<List<RepoResponse>>() {})
                .orElseGet(() -> {
                    Repository base = findRepo(normalized);
                    List<Repository> pool = similarPool(base);
                    Set<String> baseTopics = new HashSet<>(assembler.parseTopics(base.getTopics()));

                    List<RepoResponse> result = pool.stream()
                            .map(candidate -> new ScoredRepo(candidate,
                                    similarityScore(base, candidate, baseTopics)))
                            .sorted(Comparator.comparingDouble(ScoredRepo::score).reversed()
                                    .thenComparing(scored -> nullSafe(scored.repo().getStars()), Comparator.reverseOrder()))
                            .limit(effectiveLimit)
                            .map(scored -> assembler.toResponse(scored.repo()))
                            .collect(Collectors.toList());

                    cacheService.set(key, result, Duration.ofHours(1));
                    return result;
                });
    }

    public PageResult<RepoResponse> listRepos(String q, String category, String language, String topic,
                                              String platform, String license,
                                              String sort, String order, int page, int size) {
        LambdaQueryWrapper<Repository> wrapper = new LambdaQueryWrapper<>();

        if (q != null && !q.isBlank()) {
            String like = q.trim();
            wrapper.and(w -> w.like(Repository::getFullName, like)
                    .or().like(Repository::getName, like)
                    .or().like(Repository::getDescription, like));
        }
        if (category != null && !category.isBlank()) {
            wrapper.eq(Repository::getCategory, category);
        }
        if (language != null && !language.isBlank()) {
            wrapper.eq(Repository::getLanguage, resolveLanguage(language));
        }
        if (platform != null && !platform.isBlank()) {
            wrapper.eq(Repository::getPlatform, platform.trim().toLowerCase());
        }
        if (license != null && !license.isBlank()) {
            wrapper.eq(Repository::getLicense, license.trim());
        }
        if (topic != null && !topic.isBlank()) {
            List<Long> repoIds = repoIdsByTopic(topic);
            if (repoIds.isEmpty()) {
                return new PageResult<>(List.of(), 0, page, size);
            }
            wrapper.in(Repository::getId, repoIds);
        }

        wrapper.orderBy(true, "asc".equalsIgnoreCase(order), sortColumn(sort));

        Page<Repository> result = repositoryMapper.selectPage(new Page<>(page, size), wrapper);
        List<RepoResponse> items = result.getRecords().stream()
                .map(assembler::toResponse)
                .collect(Collectors.toList());
        return new PageResult<>(items, result.getTotal(), page, size);
    }

    /**
     * AI 工具调用专用检索：关键字 + 硬条件，返回精简列表（无分页）。
     */
    public List<RepoResponse> searchForAi(String q, String language, String category, String license,
                                          String platform, Integer minStars, String sort, int limit) {
        int effectiveLimit = Math.min(Math.max(limit, 1), 20);
        LambdaQueryWrapper<Repository> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Repository::getArchived, 0).eq(Repository::getDisabled, 0);

        if (q != null && !q.isBlank()) {
            String like = q.trim();
            wrapper.and(w -> w.like(Repository::getFullName, like)
                    .or().like(Repository::getName, like)
                    .or().like(Repository::getDescription, like));
        }
        if (language != null && !language.isBlank()) {
            wrapper.eq(Repository::getLanguage, resolveLanguage(language));
        }
        if (category != null && !category.isBlank()) {
            wrapper.eq(Repository::getCategory, category.trim());
        }
        if (license != null && !license.isBlank()) {
            wrapper.eq(Repository::getLicense, license.trim());
        }
        if (platform != null && !platform.isBlank()) {
            wrapper.eq(Repository::getPlatform, platform.trim().toLowerCase());
        }
        if (minStars != null && minStars > 0) {
            wrapper.ge(Repository::getStars, minStars);
        }

        wrapper.orderByDesc("pushedAt".equalsIgnoreCase(sort)
                ? Repository::getPushedAt
                : Repository::getStars);
        wrapper.last("LIMIT " + effectiveLimit);

        return repositoryMapper.selectList(wrapper).stream()
                .map(assembler::toResponse)
                .collect(Collectors.toList());
    }

    private Repository findRepo(String normalized) {
        Repository repo = repositoryMapper.selectOne(
                new LambdaQueryWrapper<Repository>().eq(Repository::getFullName, normalized));
        if (repo == null) {
            throw new RepoNotFoundException(normalized);
        }
        return repo;
    }

    private List<Repository> similarPool(Repository base) {
        LambdaQueryWrapper<Repository> wrapper = new LambdaQueryWrapper<Repository>()
                .ne(Repository::getId, base.getId());
        if (base.getCategory() != null && base.getPlatform() != null) {
            wrapper.and(w -> w.eq(Repository::getCategory, base.getCategory())
                    .or().eq(Repository::getPlatform, base.getPlatform()));
        } else if (base.getCategory() != null) {
            wrapper.eq(Repository::getCategory, base.getCategory());
        } else if (base.getPlatform() != null) {
            wrapper.eq(Repository::getPlatform, base.getPlatform());
        }
        wrapper.orderByDesc(Repository::getStars).last("LIMIT " + SIMILAR_POOL_SIZE);
        return repositoryMapper.selectList(wrapper);
    }

    private double similarityScore(Repository base, Repository candidate, Set<String> baseTopics) {
        Set<String> candidateTopics = new HashSet<>(assembler.parseTopics(candidate.getTopics()));
        long overlap = baseTopics.stream().filter(candidateTopics::contains).count();

        double score = overlap * 4.0;
        score += equalsIgnoreCase(base.getLanguage(), candidate.getLanguage()) ? 2.0 : 0.0;
        score += equalsIgnoreCase(base.getPlatform(), candidate.getPlatform()) ? 1.0 : 0.0;
        score += equalsIgnoreCase(base.getCategory(), candidate.getCategory()) ? 2.0 : 0.0;
        score += starProximity(base.getStars(), candidate.getStars());
        return score;
    }

    private double starProximity(Integer left, Integer right) {
        int a = Math.max(nullSafe(left), 1);
        int b = Math.max(nullSafe(right), 1);
        double diff = Math.abs(Math.log10(a) - Math.log10(b));
        return Math.max(0, 1 - diff / 3);
    }

    private int nullSafe(Integer value) {
        return value == null ? 0 : value;
    }

    private boolean equalsIgnoreCase(String left, String right) {
        return left != null && left.equalsIgnoreCase(right);
    }

    private String normalizeFullName(String fullName) {
        return fullName.startsWith("/") ? fullName.substring(1) : fullName;
    }

    private String resolveLanguage(String language) {
        Tag tag = tagMapper.selectOne(new LambdaQueryWrapper<Tag>()
                .eq(Tag::getSlug, categorizer.slugify(language))
                .eq(Tag::getType, "language"));
        return tag != null ? tag.getName() : language;
    }

    private List<Long> repoIdsByTopic(String topic) {
        Tag tag = tagMapper.selectOne(new LambdaQueryWrapper<Tag>()
                .eq(Tag::getSlug, categorizer.slugify(topic))
                .eq(Tag::getType, "topic"));
        if (tag == null) {
            return List.of();
        }
        return repoTagMapper.selectList(new LambdaQueryWrapper<RepoTag>().eq(RepoTag::getTagId, tag.getId()))
                .stream()
                .map(RepoTag::getRepoId)
                .collect(Collectors.toList());
    }

    private SFunction<Repository, ?> sortColumn(String sort) {
        if (sort == null) {
            return Repository::getStars;
        }
        return switch (sort) {
            case "forks" -> Repository::getForks;
            case "pushed", "pushedAt" -> Repository::getPushedAt;
            case "created" -> Repository::getCreatedAt;
            case "active", "heat" -> Repository::getHeatScore;
            default -> Repository::getStars;
        };
    }

    private record ScoredRepo(Repository repo, double score) {
    }
}
