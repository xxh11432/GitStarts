package com.githubstars.collector;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class GithubClient {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final TokenBucketRateLimiter searchRateLimiter;
    private final TokenBucketRateLimiter restRateLimiter;

    public GithubClient(@Value("${github.api-base}") String apiBase,
                        @Value("${github.token}") String token,
                        ObjectMapper objectMapper,
                        @Qualifier("searchRateLimiter") TokenBucketRateLimiter searchRateLimiter,
                        @Qualifier("restRateLimiter") TokenBucketRateLimiter restRateLimiter) {
        this.objectMapper = objectMapper;
        this.searchRateLimiter = searchRateLimiter;
        this.restRateLimiter = restRateLimiter;

        RestClient.Builder builder = RestClient.builder()
                .baseUrl(apiBase)
                .defaultHeader("Accept", "application/vnd.github+json")
                .defaultHeader("X-GitHub-Api-Version", "2022-11-28")
                .defaultHeader("User-Agent", "github-stars-aggregator");
        if (token != null && !token.isBlank()) {
            builder.defaultHeader("Authorization", "Bearer " + token);
        }
        this.restClient = builder.build();
    }

    public JsonNode searchRepositories(String query, String sort, String order, int page, int perPage) {
        searchRateLimiter.acquire();
        String body = restClient.get()
                .uri(uriBuilder -> uriBuilder.path("/search/repositories")
                        .queryParam("q", query)
                        .queryParam("sort", sort)
                        .queryParam("order", order)
                        .queryParam("page", page)
                        .queryParam("per_page", perPage)
                        .build())
                .retrieve()
                .body(String.class);
        return parse(body);
    }

    public JsonNode getRepository(String owner, String name) {
        restRateLimiter.acquire();
        String body = restClient.get()
                .uri("/repos/{owner}/{repo}", owner, name)
                .retrieve()
                .body(String.class);
        return parse(body);
    }

    private JsonNode parse(String body) {
        try {
            return objectMapper.readTree(body);
        } catch (Exception e) {
            throw new GithubApiException("解析 GitHub 响应失败", e);
        }
    }
}
