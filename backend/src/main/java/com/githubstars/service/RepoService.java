package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.githubstars.dto.PageResult;
import com.githubstars.dto.RepoResponse;
import com.githubstars.entity.RepoTag;
import com.githubstars.entity.Repository;
import com.githubstars.entity.Tag;
import com.githubstars.exception.RepoNotFoundException;
import com.githubstars.mapper.RepoTagMapper;
import com.githubstars.mapper.RepositoryMapper;
import com.githubstars.mapper.TagMapper;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class RepoService {

    private final RepositoryMapper repositoryMapper;
    private final TagMapper tagMapper;
    private final RepoTagMapper repoTagMapper;
    private final RepoAssembler assembler;
    private final Categorizer categorizer;
    private final CacheService cacheService;

    public RepoService(RepositoryMapper repositoryMapper, TagMapper tagMapper, RepoTagMapper repoTagMapper,
                       RepoAssembler assembler, Categorizer categorizer, CacheService cacheService) {
        this.repositoryMapper = repositoryMapper;
        this.tagMapper = tagMapper;
        this.repoTagMapper = repoTagMapper;
        this.assembler = assembler;
        this.categorizer = categorizer;
        this.cacheService = cacheService;
    }

    public RepoResponse getRepo(String fullName) {
        String normalized = fullName.startsWith("/") ? fullName.substring(1) : fullName;
        String key = "repo:detail:" + normalized;
        return cacheService.get(key, RepoResponse.class).orElseGet(() -> {
            Repository repo = repositoryMapper.selectOne(
                    new LambdaQueryWrapper<Repository>().eq(Repository::getFullName, normalized));
            if (repo == null) {
                throw new RepoNotFoundException(normalized);
            }
            RepoResponse response = assembler.toResponse(repo);
            cacheService.set(key, response, Duration.ofHours(1));
            return response;
        });
    }

    public PageResult<RepoResponse> listRepos(String q, String category, String language, String topic,
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
            case "pushed" -> Repository::getPushedAt;
            case "created" -> Repository::getCreatedAt;
            default -> Repository::getStars;
        };
    }
}
