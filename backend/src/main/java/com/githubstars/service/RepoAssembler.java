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
                parseTopics(repo.getTopics()),
                repo.getCategory(),
                repo.getPlatform(),
                repo.getDefaultBranch(),
                repo.getPushedAt(),
                repo.getCreatedAt());
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
