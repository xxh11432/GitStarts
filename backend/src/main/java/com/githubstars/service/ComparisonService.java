package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.githubstars.dto.ComparisonResponse;
import com.githubstars.dto.ComparisonSaveRequest;
import com.githubstars.dto.ComparisonShareResponse;
import com.githubstars.dto.ComparisonSummary;
import com.githubstars.dto.PageResult;
import com.githubstars.entity.Comparison;
import com.githubstars.exception.ComparisonNotFoundException;
import com.githubstars.mapper.ComparisonMapper;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 深度对比结果：AI 侧生成，backend 负责落库、历史查询与只读分享。
 */
@Service
public class ComparisonService {

    private static final String DEFAULT_SCHEMA_VERSION = "v1";
    private static final int REPO_KEYS_MAX_LENGTH = 500;

    private final ComparisonMapper comparisonMapper;
    private final ObjectMapper objectMapper;
    private final SecureRandom random = new SecureRandom();

    public ComparisonService(ComparisonMapper comparisonMapper, ObjectMapper objectMapper) {
        this.comparisonMapper = comparisonMapper;
        this.objectMapper = objectMapper;
    }

    public Long create(ComparisonSaveRequest request) {
        if (request.userId() == null) {
            throw new IllegalArgumentException("userId 必填");
        }
        if (request.result() == null || request.result().isNull()) {
            throw new IllegalArgumentException("result 必填");
        }
        String repoKeys = String.join(",", normalizeRepoKeys(request.repoKeys()));
        if (repoKeys.isBlank() || repoKeys.length() > REPO_KEYS_MAX_LENGTH) {
            throw new IllegalArgumentException("repoKeys 不合法");
        }
        String cacheKey = request.cacheKey() == null ? "" : request.cacheKey().trim();
        if (cacheKey.length() > 64) {
            throw new IllegalArgumentException("cacheKey 过长");
        }

        Comparison comparison = new Comparison();
        comparison.setUserId(request.userId());
        comparison.setIdeaId(request.ideaId());
        comparison.setRepoKeys(repoKeys);
        comparison.setSchemaVersion(request.schemaVersion() == null || request.schemaVersion().isBlank()
                ? DEFAULT_SCHEMA_VERSION : request.schemaVersion().trim());
        comparison.setResult(toJson(request.result()));
        comparison.setCacheKey(cacheKey);
        comparison.setCreatedAt(LocalDateTime.now());
        comparisonMapper.insert(comparison);
        return comparison.getId();
    }

    public ComparisonResponse get(Long id, Long userId) {
        Comparison comparison = comparisonMapper.selectById(id);
        if (comparison == null || (userId != null && !userId.equals(comparison.getUserId()))) {
            throw new ComparisonNotFoundException("对比不存在或无权访问");
        }
        return toResponse(comparison);
    }

    public PageResult<ComparisonSummary> list(Long userId, int page, int size) {
        int current = Math.max(page, 1);
        int pageSize = Math.min(Math.max(size, 1), 50);
        Page<Comparison> result = comparisonMapper.selectPage(new Page<>(current, pageSize),
                new LambdaQueryWrapper<Comparison>()
                        .eq(Comparison::getUserId, userId)
                        .orderByDesc(Comparison::getId));
        List<ComparisonSummary> items = result.getRecords().stream()
                .map(comparison -> new ComparisonSummary(comparison.getId(), splitRepoKeys(comparison),
                        comparison.getSchemaVersion(), hasShare(comparison), comparison.getCreatedAt()))
                .collect(Collectors.toList());
        return new PageResult<>(items, result.getTotal(), current, pageSize);
    }

    /**
     * 生成（或复用）只读分享 token；token 与用户解绑，只能读取这一条对比。
     */
    public String share(Long id, Long userId) {
        Comparison comparison = comparisonMapper.selectById(id);
        if (comparison == null || !userId.equals(comparison.getUserId())) {
            throw new ComparisonNotFoundException("对比不存在或无权访问");
        }
        if (comparison.getShareToken() != null && !comparison.getShareToken().isBlank()) {
            return comparison.getShareToken();
        }
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        String token = HexFormat.of().formatHex(bytes);
        Comparison patch = new Comparison();
        patch.setId(id);
        patch.setShareToken(token);
        comparisonMapper.updateById(patch);
        return token;
    }

    /**
     * 撤销只读分享：清空 token 后旧链接立即失效，再次分享会生成新 token。
     */
    public void revokeShare(Long id, Long userId) {
        Comparison comparison = comparisonMapper.selectById(id);
        if (comparison == null || !userId.equals(comparison.getUserId())) {
            throw new ComparisonNotFoundException("对比不存在或无权访问");
        }
        comparisonMapper.update(null, new LambdaUpdateWrapper<Comparison>()
                .eq(Comparison::getId, id)
                .setSql("share_token = NULL"));
    }

    public void delete(Long id, Long userId) {
        Comparison comparison = comparisonMapper.selectById(id);
        if (comparison == null || !userId.equals(comparison.getUserId())) {
            throw new ComparisonNotFoundException("对比不存在或无权访问");
        }
        comparisonMapper.deleteById(id);
    }

    /** 账号删除时清理该用户的全部对比记录。 */
    public void deleteAllByUser(Long userId) {
        comparisonMapper.delete(new LambdaQueryWrapper<Comparison>().eq(Comparison::getUserId, userId));
    }

    public ComparisonShareResponse getByShare(String token) {
        if (token == null || token.isBlank() || token.length() > 32) {
            throw new ComparisonNotFoundException("分享链接无效");
        }
        Comparison comparison = comparisonMapper.selectOne(new LambdaQueryWrapper<Comparison>()
                .eq(Comparison::getShareToken, token));
        if (comparison == null) {
            throw new ComparisonNotFoundException("分享链接无效");
        }
        return new ComparisonShareResponse(splitRepoKeys(comparison), comparison.getSchemaVersion(),
                parseJson(comparison.getResult()), comparison.getCreatedAt());
    }

    private ComparisonResponse toResponse(Comparison comparison) {
        return new ComparisonResponse(comparison.getId(), comparison.getIdeaId(),
                splitRepoKeys(comparison), comparison.getSchemaVersion(),
                parseJson(comparison.getResult()), comparison.getShareToken(), comparison.getCreatedAt());
    }

    private List<String> normalizeRepoKeys(List<String> repoKeys) {
        if (repoKeys == null || repoKeys.isEmpty()) {
            return List.of();
        }
        return repoKeys.stream()
                .filter(key -> key != null && !key.isBlank())
                .map(String::trim)
                .distinct()
                .limit(4)
                .toList();
    }

    private boolean hasShare(Comparison comparison) {
        return comparison.getShareToken() != null && !comparison.getShareToken().isBlank();
    }

    private List<String> splitRepoKeys(Comparison comparison) {
        if (comparison.getRepoKeys() == null || comparison.getRepoKeys().isBlank()) {
            return List.of();
        }
        return Arrays.stream(comparison.getRepoKeys().split(","))
                .filter(key -> !key.isBlank())
                .toList();
    }

    private String toJson(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("result 序列化失败");
        }
    }

    private JsonNode parseJson(String value) {
        if (value == null || value.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(value);
        } catch (JsonProcessingException e) {
            return objectMapper.createObjectNode();
        }
    }
}
