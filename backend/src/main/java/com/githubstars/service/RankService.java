package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.type.TypeReference;
import com.githubstars.dto.RepoResponse;
import com.githubstars.entity.Repository;
import com.githubstars.mapper.RepositoryMapper;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class RankService {

    private final RepositoryMapper repositoryMapper;
    private final RepoAssembler assembler;
    private final CacheService cacheService;

    public RankService(RepositoryMapper repositoryMapper, RepoAssembler assembler, CacheService cacheService) {
        this.repositoryMapper = repositoryMapper;
        this.assembler = assembler;
        this.cacheService = cacheService;
    }

    public List<RepoResponse> rank(String type, String language, int limit) {
        final int effectiveLimit = (limit <= 0 || limit > 100) ? 20 : limit;
        String normalizedType = type == null || type.isBlank() ? "total" : type;
        String key = "rank:" + normalizedType + ":" + (language == null ? "" : language) + ":" + effectiveLimit;
        return cacheService.get(key, new TypeReference<List<RepoResponse>>() {})
                .orElseGet(() -> {
                    List<RepoResponse> items = computeRank(normalizedType, language, effectiveLimit);
                    cacheService.set(key, items, Duration.ofMinutes(10));
                    return items;
                });
    }

    private List<RepoResponse> computeRank(String type, String language, int limit) {
        LambdaQueryWrapper<Repository> wrapper = new LambdaQueryWrapper<>();
        if (language != null && !language.isBlank()) {
            wrapper.eq(Repository::getLanguage, language);
        }
        LocalDateTime now = LocalDateTime.now();
        switch (type) {
            case "weekly" -> wrapper.ge(Repository::getPushedAt, now.minusDays(7)).orderByDesc(Repository::getStars);
            case "monthly" -> wrapper.ge(Repository::getPushedAt, now.minusDays(30)).orderByDesc(Repository::getStars);
            case "new" -> wrapper.orderByDesc(Repository::getCreatedAt);
            default -> wrapper.orderByDesc(Repository::getStars);
        }
        Page<Repository> page = repositoryMapper.selectPage(new Page<>(1, limit), wrapper);
        return page.getRecords().stream().map(assembler::toResponse).collect(Collectors.toList());
    }
}
