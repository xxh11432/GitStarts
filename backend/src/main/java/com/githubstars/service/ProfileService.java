package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.githubstars.dto.ProfileResponse;
import com.githubstars.dto.ProfileUpdateRequest;
import com.githubstars.dto.RecommendationResponse;
import com.githubstars.entity.Favorite;
import com.githubstars.entity.Repository;
import com.githubstars.entity.UserProfile;
import com.githubstars.mapper.FavoriteMapper;
import com.githubstars.mapper.RepositoryMapper;
import com.githubstars.mapper.UserProfileMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 用户画像（技能 / 兴趣 / 偏好）与基于画像的规则推荐。
 * 画像只用于站内检索排序，不直接暴露给其他用户。
 */
@Service
public class ProfileService {

    private static final int MAX_ITEMS = 20;
    private static final int MAX_ITEM_LENGTH = 40;
    private static final int MAX_QUERY_TOKENS = 12;
    private static final int CANDIDATE_POOL_SIZE = 120;
    private static final int RECOMMENDATION_MAX = 12;

    private final UserProfileMapper userProfileMapper;
    private final RepositoryMapper repositoryMapper;
    private final FavoriteMapper favoriteMapper;
    private final RepoAssembler assembler;
    private final ObjectMapper objectMapper;

    public ProfileService(UserProfileMapper userProfileMapper, RepositoryMapper repositoryMapper,
                          FavoriteMapper favoriteMapper, RepoAssembler assembler,
                          ObjectMapper objectMapper) {
        this.userProfileMapper = userProfileMapper;
        this.repositoryMapper = repositoryMapper;
        this.favoriteMapper = favoriteMapper;
        this.assembler = assembler;
        this.objectMapper = objectMapper;
    }

    public ProfileResponse get(Long userId) {
        UserProfile profile = userProfileMapper.selectById(userId);
        if (profile == null) {
            return new ProfileResponse(List.of(), List.of(), List.of(), null);
        }
        return toResponse(profile);
    }

    public ProfileResponse update(Long userId, ProfileUpdateRequest request) {
        List<String> skills = normalize(request == null ? null : request.skills());
        List<String> interests = normalize(request == null ? null : request.interests());
        List<String> preferences = normalize(request == null ? null : request.preferences());

        UserProfile profile = userProfileMapper.selectById(userId);
        LocalDateTime now = LocalDateTime.now();
        if (profile == null) {
            profile = new UserProfile();
            profile.setUserId(userId);
            profile.setSkills(toJson(skills));
            profile.setInterests(toJson(interests));
            profile.setPreferences(toJson(preferences));
            profile.setUpdatedAt(now);
            userProfileMapper.insert(profile);
        } else {
            profile.setSkills(toJson(skills));
            profile.setInterests(toJson(interests));
            profile.setPreferences(toJson(preferences));
            profile.setUpdatedAt(now);
            userProfileMapper.updateById(profile);
        }
        return toResponse(profile);
    }

    /**
     * 基于画像技能的规则推荐：语言 / 分类 / topics / 描述命中关键词，
     * 排除已收藏仓库；画像为空时回退为热门项目。
     */
    public List<RecommendationResponse> recommendations(Long userId, int limit) {
        int effectiveLimit = Math.min(Math.max(limit, 1), RECOMMENDATION_MAX);
        UserProfile profile = userProfileMapper.selectById(userId);
        LinkedHashSet<String> tokenSet = new LinkedHashSet<>();
        if (profile != null) {
            tokenSet.addAll(parseList(profile.getSkills()));
            tokenSet.addAll(parseList(profile.getInterests()));
            tokenSet.addAll(parseList(profile.getPreferences()));
        }
        List<String> tokens = tokenSet.stream()
                .limit(MAX_QUERY_TOKENS)
                .collect(Collectors.toList());

        Set<Long> favoriteIds = favoriteMapper.selectList(new LambdaQueryWrapper<Favorite>()
                        .eq(Favorite::getUserId, userId))
                .stream()
                .map(Favorite::getRepoId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());

        List<Repository> pool = candidatePool(tokens, favoriteIds);
        List<RecommendationResponse> result = pool.stream()
                .map(repo -> new ScoredRepo(repo, score(repo, tokens)))
                .sorted(Comparator.comparingInt(ScoredRepo::score).reversed()
                        .thenComparing(scored -> nullSafe(scored.repo().getStars()), Comparator.reverseOrder()))
                .limit(effectiveLimit)
                .map(scored -> new RecommendationResponse(assembler.toResponse(scored.repo()), scored.reasons()))
                .collect(Collectors.toList());

        if (result.isEmpty()) {
            List<Repository> fallback = popularPool(favoriteIds);
            return fallback.stream()
                    .limit(effectiveLimit)
                    .map(repo -> new RecommendationResponse(assembler.toResponse(repo), List.of("热门项目")))
                    .collect(Collectors.toList());
        }
        return result;
    }

    private List<Repository> candidatePool(List<String> tokens, Set<Long> favoriteIds) {
        LambdaQueryWrapper<Repository> wrapper = baseWrapper(favoriteIds);
        if (!tokens.isEmpty()) {
            wrapper.and(w -> {
                for (int index = 0; index < tokens.size(); index++) {
                    if (index > 0) {
                        w.or();
                    }
                    String token = tokens.get(index);
                    w.like(Repository::getLanguage, token)
                            .or().like(Repository::getCategory, token)
                            .or().like(Repository::getTopics, token)
                            .or().like(Repository::getDescription, token);
                }
            });
        }
        wrapper.orderByDesc(Repository::getStars).last("LIMIT " + CANDIDATE_POOL_SIZE);
        return repositoryMapper.selectList(wrapper);
    }

    private List<Repository> popularPool(Set<Long> favoriteIds) {
        return repositoryMapper.selectList(baseWrapper(favoriteIds)
                .orderByDesc(Repository::getStars)
                .last("LIMIT " + CANDIDATE_POOL_SIZE));
    }

    private LambdaQueryWrapper<Repository> baseWrapper(Set<Long> favoriteIds) {
        LambdaQueryWrapper<Repository> wrapper = new LambdaQueryWrapper<Repository>()
                .eq(Repository::getArchived, 0)
                .eq(Repository::getDisabled, 0);
        if (!favoriteIds.isEmpty()) {
            wrapper.notIn(Repository::getId, favoriteIds);
        }
        return wrapper;
    }

    private Scored score(Repository repo, List<String> tokens) {
        if (tokens.isEmpty()) {
            return new Scored(0, List.of("热门项目"));
        }
        int score = 0;
        LinkedHashSet<String> reasons = new LinkedHashSet<>();
        String language = repo.getLanguage();
        String category = repo.getCategory();
        String topics = repo.getTopics();
        String description = repo.getDescription();

        for (String token : tokens) {
            if (equalsIgnoreCase(language, token)) {
                score += 4;
                reasons.add("技术栈：" + token);
            } else if (equalsIgnoreCase(category, token)) {
                score += 4;
                reasons.add("分类：" + token);
            } else if (containsIgnoreCase(topics, token)) {
                score += 3;
                reasons.add("主题：" + token);
            } else if (containsIgnoreCase(description, token)) {
                score += 1;
            }
        }
        if (reasons.isEmpty()) {
            reasons.add("与画像关键词相关");
        }
        List<String> limited = reasons.stream().limit(3).collect(Collectors.toList());
        return new Scored(score, limited);
    }

    private boolean equalsIgnoreCase(String source, String target) {
        return source != null && source.equalsIgnoreCase(target);
    }

    private boolean containsIgnoreCase(String source, String target) {
        return source != null && source.toLowerCase(Locale.ROOT).contains(target.toLowerCase(Locale.ROOT));
    }

    private int nullSafe(Integer value) {
        return value == null ? 0 : value;
    }

    private List<String> normalize(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> result = new LinkedHashSet<>();
        for (String value : values) {
            if (value == null) {
                continue;
            }
            String trimmed = value.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            result.add(trimmed.length() <= MAX_ITEM_LENGTH
                    ? trimmed : trimmed.substring(0, MAX_ITEM_LENGTH));
            if (result.size() >= MAX_ITEMS) {
                break;
            }
        }
        return new ArrayList<>(result);
    }

    private List<String> parseList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            if (!node.isArray()) {
                return List.of();
            }
            List<String> result = new ArrayList<>();
            for (JsonNode item : node) {
                String value = item.asText("").trim();
                if (!value.isEmpty()) {
                    result.add(value);
                }
            }
            return result;
        } catch (Exception e) {
            return List.of();
        }
    }

    private String toJson(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("画像序列化失败");
        }
    }

    private ProfileResponse toResponse(UserProfile profile) {
        return new ProfileResponse(parseList(profile.getSkills()), parseList(profile.getInterests()),
                parseList(profile.getPreferences()), profile.getUpdatedAt());
    }

    private record Scored(int score, List<String> reasons) {
    }

    private record ScoredRepo(Repository repo, Scored scored) {

        int score() {
            return scored.score();
        }

        List<String> reasons() {
            return scored.reasons();
        }
    }
}
