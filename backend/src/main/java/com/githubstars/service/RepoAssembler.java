package com.githubstars.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.githubstars.dto.RepoResponse;
import com.githubstars.entity.Repository;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class RepoAssembler {

    private final ObjectMapper objectMapper;

    public RepoAssembler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public RepoResponse toResponse(Repository repo) {
        return new RepoResponse(
                repo.getId(),
                repo.getFullName(),
                repo.getName(),
                repo.getOwner(),
                repo.getDescription(),
                repo.getHomepage(),
                repo.getLanguage(),
                repo.getLicense(),
                repo.getStars(),
                repo.getForks(),
                repo.getWatchers(),
                repo.getOpenIssues(),
                repo.getHeatScore(),
                parseTopics(repo.getTopics()),
                repo.getCategory(),
                repo.getPlatform(),
                parsePlatforms(repo.getPlatforms(), repo.getPlatform()),
                repo.getLatestReleaseTag(),
                repo.getLatestReleaseAt(),
                repo.getDefaultBranch(),
                repo.getPushedAt(),
                repo.getCreatedAt());
    }

    /**
     * 多平台字段按逗号存储；历史数据只有单平台时回退到 platform。
     */
    private List<String> parsePlatforms(String stored, String fallback) {
        List<String> parsed = new ArrayList<>();
        if (stored != null && !stored.isBlank()) {
            for (String item : stored.split(",")) {
                String value = item.trim();
                if (!value.isEmpty() && !parsed.contains(value)) {
                    parsed.add(value);
                }
            }
        }
        if (parsed.isEmpty() && fallback != null && !fallback.isBlank()) {
            parsed.add(fallback);
        }
        return parsed;
    }

    public List<String> parseTopics(String topicsJson) {
        if (topicsJson == null || topicsJson.isBlank()) {
            return List.of();
        }
        try {
            JsonNode node = objectMapper.readTree(topicsJson);
            List<String> result = new ArrayList<>();
            if (node.isArray()) {
                for (JsonNode topic : node) {
                    result.add(topic.asText());
                }
            }
            return result;
        } catch (Exception e) {
            return List.of();
        }
    }
}
