package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.githubstars.dto.IdeaCreateRequest;
import com.githubstars.dto.IdeaResponse;
import com.githubstars.dto.IdeaUpdateRequest;
import com.githubstars.dto.PageResult;
import com.githubstars.entity.Idea;
import com.githubstars.exception.IdeaNotFoundException;
import com.githubstars.mapper.IdeaMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 想法与结构化条件：AI 生成、用户可编辑，所有读写都按 userId 隔离。
 */
@Service
public class IdeaService {

    private static final int TITLE_MAX_LENGTH = 200;
    private static final int RAW_TEXT_MAX_LENGTH = 8000;
    private static final String EMPTY_STRUCTURED = "{}";

    private final IdeaMapper ideaMapper;
    private final ObjectMapper objectMapper;

    public IdeaService(IdeaMapper ideaMapper, ObjectMapper objectMapper) {
        this.ideaMapper = ideaMapper;
        this.objectMapper = objectMapper;
    }

    public IdeaResponse create(IdeaCreateRequest request) {
        if (request.userId() == null) {
            throw new IllegalArgumentException("userId 必填");
        }
        String rawText = requireRawText(request.rawText());
        LocalDateTime now = LocalDateTime.now();
        Idea idea = new Idea();
        idea.setUserId(request.userId());
        idea.setTitle(truncate(request.title() == null || request.title().isBlank()
                ? rawText : request.title(), TITLE_MAX_LENGTH));
        idea.setRawText(rawText);
        idea.setStructured(toJson(request.structured()));
        idea.setRevision(1);
        idea.setCreatedAt(now);
        idea.setUpdatedAt(now);
        ideaMapper.insert(idea);
        return toResponse(idea);
    }

    public PageResult<IdeaResponse> list(Long userId, int page, int size) {
        int current = Math.max(page, 1);
        int pageSize = Math.min(Math.max(size, 1), 50);
        Page<Idea> result = ideaMapper.selectPage(new Page<>(current, pageSize),
                new LambdaQueryWrapper<Idea>()
                        .eq(Idea::getUserId, userId)
                        .orderByDesc(Idea::getId));
        List<IdeaResponse> items = result.getRecords().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
        return new PageResult<>(items, result.getTotal(), current, pageSize);
    }

    public IdeaResponse get(Long id, Long userId) {
        return toResponse(find(id, userId));
    }

    public IdeaResponse update(Long id, Long userId, IdeaUpdateRequest request) {
        Idea idea = find(id, userId);
        if (request.title() != null && !request.title().isBlank()) {
            idea.setTitle(truncate(request.title(), TITLE_MAX_LENGTH));
        }
        if (request.structured() != null) {
            idea.setStructured(toJson(request.structured()));
            idea.setRevision((idea.getRevision() == null ? 1 : idea.getRevision()) + 1);
        }
        idea.setUpdatedAt(LocalDateTime.now());
        ideaMapper.updateById(idea);
        return toResponse(idea);
    }

    private Idea find(Long id, Long userId) {
        Idea idea = ideaMapper.selectById(id);
        if (idea == null || (userId != null && !userId.equals(idea.getUserId()))) {
            throw new IdeaNotFoundException(id);
        }
        return idea;
    }

    private IdeaResponse toResponse(Idea idea) {
        return new IdeaResponse(
                idea.getId(),
                idea.getTitle(),
                idea.getRawText(),
                parseJson(idea.getStructured()),
                idea.getRevision(),
                idea.getCreatedAt(),
                idea.getUpdatedAt());
    }

    private String requireRawText(String rawText) {
        if (rawText == null || rawText.isBlank()) {
            throw new IllegalArgumentException("rawText 必填");
        }
        String trimmed = rawText.trim();
        if (trimmed.length() > RAW_TEXT_MAX_LENGTH) {
            throw new IllegalArgumentException("rawText 过长");
        }
        return trimmed;
    }

    private String toJson(JsonNode node) {
        if (node == null || node.isNull()) {
            return EMPTY_STRUCTURED;
        }
        try {
            return objectMapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("structured 序列化失败");
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

    private String truncate(String value, int maxLength) {
        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }
}
