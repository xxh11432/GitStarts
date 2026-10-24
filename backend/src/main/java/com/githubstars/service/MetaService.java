package com.githubstars.service;

import com.githubstars.dto.FacetItem;
import com.githubstars.dto.MetaResponse;
import com.githubstars.mapper.RepositoryMapper;
import com.githubstars.mapper.TagMapper;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class MetaService {

    private final RepositoryMapper repositoryMapper;
    private final TagMapper tagMapper;
    private final Categorizer categorizer;
    private final CacheService cacheService;

    public MetaService(RepositoryMapper repositoryMapper, TagMapper tagMapper, Categorizer categorizer,
                       CacheService cacheService) {
        this.repositoryMapper = repositoryMapper;
        this.tagMapper = tagMapper;
        this.categorizer = categorizer;
        this.cacheService = cacheService;
    }

    private static final Map<String, String> PLATFORM_LABELS = Map.of(
            "windows", "Windows",
            "mac", "macOS",
            "linux", "Linux",
            "android", "Android",
            "ios", "iOS",
            "harmony", "HarmonyOS",
            "extension", "浏览器扩展",
            "other", "其他");

    public MetaResponse meta() {
        String key = "meta:facets:v2";
        return cacheService.get(key, MetaResponse.class).orElseGet(() -> {
            MetaResponse response = new MetaResponse(
                    facetsBySlugify(repositoryMapper.countByCategory()),
                    facetsBySlugify(repositoryMapper.countByLanguage()),
                    facetsWithSlug(tagMapper.selectTopTopics(50)),
                    platformFacets());
            cacheService.set(key, response, Duration.ofMinutes(10));
            return response;
        });
    }

    private List<FacetItem> platformFacets() {
        return repositoryMapper.countByPlatform().stream()
                .map(row -> {
                    String name = String.valueOf(row.get("name"));
                    return new FacetItem(PLATFORM_LABELS.getOrDefault(name, name), name, countOf(row));
                })
                .collect(Collectors.toList());
    }

    private List<FacetItem> facetsBySlugify(List<Map<String, Object>> rows) {
        return rows.stream().map(row -> {
            String name = String.valueOf(row.get("name"));
            return new FacetItem(name, categorizer.slugify(name), countOf(row));
        }).collect(Collectors.toList());
    }

    private List<FacetItem> facetsWithSlug(List<Map<String, Object>> rows) {
        return rows.stream().map(row -> {
            String name = String.valueOf(row.get("name"));
            String slug = row.get("slug") == null ? categorizer.slugify(name) : String.valueOf(row.get("slug"));
            return new FacetItem(name, slug, countOf(row));
        }).collect(Collectors.toList());
    }

    private long countOf(Map<String, Object> row) {
        Object cnt = row.get("cnt");
        return cnt == null ? 0 : ((Number) cnt).longValue();
    }
}
