package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.githubstars.dto.RepoResponse;
import com.githubstars.entity.RepoTag;
import com.githubstars.entity.Repository;
import com.githubstars.entity.Tag;
import com.githubstars.mapper.RepoTagMapper;
import com.githubstars.mapper.RepositoryMapper;
import com.githubstars.mapper.TagMapper;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class RankService {

    private final RepositoryMapper repositoryMapper;
    private final TagMapper tagMapper;
    private final RepoTagMapper repoTagMapper;
    private final RepoAssembler assembler;
    private final CacheService cacheService;
    private final Categorizer categorizer;

    public RankService(RepositoryMapper repositoryMapper, TagMapper tagMapper, RepoTagMapper repoTagMapper,
                       RepoAssembler assembler, CacheService cacheService, Categorizer categorizer) {
        this.repositoryMapper = repositoryMapper;
        this.tagMapper = tagMapper;
        this.repoTagMapper = repoTagMapper;
        this.assembler = assembler;
        this.cacheService = cacheService;
        this.categorizer = categorizer;
    }

    public List<RepoResponse> rank(String type, String language, String topic, int limit) {
        final int effectiveLimit = (limit <= 0 || limit > 100) ? 20 : limit;
        String normalizedType = type == null || type.isBlank() ? "total" : type;
        String key = "rank:" + normalizedType + ":" + (language == null ? "" : language) + ":"
                + (topic == null ? "" : topic) + ":" + effectiveLimit;
        return cacheService.get(key, new TypeReference<List<RepoResponse>>() {})
                .orElseGet(() -> {
                    List<RepoResponse> items = computeRank(normalizedType, language, topic, effectiveLimit);
                    cacheService.set(key, items, Duration.ofMinutes(10));
                    return items;
                });
    }

    private List<RepoResponse> computeRank(String type, String language, String topic, int limit) {
        LambdaQueryWrapper<Repository> wrapper = new LambdaQueryWrapper<>();
        if (language != null && !language.isBlank()) {
            wrapper.eq(Repository::getLanguage, language);
        }
        if (topic != null && !topic.isBlank()) {
            List<Long> repoIds = repoIdsByTopic(topic);
            if (repoIds.isEmpty()) {
                return List.of();
            }
            wrapper.in(Repository::getId, repoIds);
        }
        LocalDateTime now = LocalDateTime.now();
        switch (type) {
            case "weekly" -> wrapper.ge(Repository::getPushedAt, now.minusDays(7)).orderByDesc(Repository::getStars);
            case "monthly" -> wrapper.ge(Repository::getPushedAt, now.minusDays(30)).orderByDesc(Repository::getStars);
            case "active" -> wrapper.orderByDesc(Repository::getHeatScore).orderByDesc(Repository::getStars);
            case "new" -> wrapper.orderByDesc(Repository::getCreatedAt);
            default -> wrapper.orderByDesc(Repository::getStars);
        }
        Page<Repository> page = repositoryMapper.selectPage(new Page<>(1, limit), wrapper);
        return page.getRecords().stream().map(assembler::toResponse).collect(Collectors.toList());
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
}
