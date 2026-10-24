package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.githubstars.dto.ConversationCreateRequest;
import com.githubstars.dto.ConversationDetail;
import com.githubstars.dto.ConversationSummary;
import com.githubstars.dto.MessageCreateRequest;
import com.githubstars.dto.MessageView;
import com.githubstars.dto.PageResult;
import com.githubstars.entity.Conversation;
import com.githubstars.entity.Message;
import com.githubstars.exception.ConversationNotFoundException;
import com.githubstars.mapper.ConversationMapper;
import com.githubstars.mapper.MessageMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 会话与消息落库：由 llm-service 通过内部接口写入，业务侧只做持久化。
 */
@Service
public class ConversationService {

    private static final int TITLE_MAX_LENGTH = 200;
    private static final String DEFAULT_MODE = "chat";

    private final ConversationMapper conversationMapper;
    private final MessageMapper messageMapper;
    private final ObjectMapper objectMapper;

    public ConversationService(ConversationMapper conversationMapper, MessageMapper messageMapper,
                               ObjectMapper objectMapper) {
        this.conversationMapper = conversationMapper;
        this.messageMapper = messageMapper;
        this.objectMapper = objectMapper;
    }

    public Long create(ConversationCreateRequest request) {
        if (request.userId() == null) {
            throw new IllegalArgumentException("userId 必填");
        }
        LocalDateTime now = LocalDateTime.now();
        Conversation conversation = new Conversation();
        conversation.setUserId(request.userId());
        conversation.setIdeaId(request.ideaId());
        conversation.setMode(request.mode() == null || request.mode().isBlank() ? DEFAULT_MODE : request.mode());
        conversation.setTitle(truncate(request.title(), TITLE_MAX_LENGTH));
        conversation.setCreatedAt(now);
        conversation.setUpdatedAt(now);
        conversationMapper.insert(conversation);
        return conversation.getId();
    }

    public Long append(MessageCreateRequest request) {
        if (request.conversationId() == null) {
            throw new IllegalArgumentException("conversationId 必填");
        }
        if (request.userId() == null) {
            throw new IllegalArgumentException("userId 必填");
        }
        if (request.role() == null || request.role().isBlank()) {
            throw new IllegalArgumentException("role 必填");
        }
        // 会话归属校验：避免客户端传入他人 conversationId 造成消息注入
        Conversation conversation = find(request.userId(), request.conversationId());
        LocalDateTime now = LocalDateTime.now();
        Message message = new Message();
        message.setConversationId(conversation.getId());
        message.setRole(request.role());
        message.setContent(request.content());
        message.setToolTrace(toJson(request.toolTrace()));
        message.setRefs(toJson(request.refs()));
        message.setTokensIn(request.tokensIn());
        message.setTokensOut(request.tokensOut());
        message.setCreatedAt(now);
        messageMapper.insert(message);
        conversationMapper.touch(conversation.getId(), now);
        return message.getId();
    }

    public PageResult<ConversationSummary> list(Long userId, int page, int size) {
        int current = Math.max(page, 1);
        int pageSize = Math.min(Math.max(size, 1), 50);
        Page<Conversation> result = conversationMapper.selectPage(new Page<>(current, pageSize),
                new LambdaQueryWrapper<Conversation>()
                        .eq(Conversation::getUserId, userId)
                        .orderByDesc(Conversation::getUpdatedAt));

        List<Long> ids = result.getRecords().stream().map(Conversation::getId).toList();
        Map<Long, Long> counts = messageCounts(ids);
        List<ConversationSummary> items = result.getRecords().stream()
                .map(conversation -> toSummary(conversation, counts.getOrDefault(conversation.getId(), 0L)))
                .collect(Collectors.toList());
        return new PageResult<>(items, result.getTotal(), current, pageSize);
    }

    public ConversationDetail get(Long userId, Long id) {
        Conversation conversation = find(userId, id);
        List<Message> messages = messageMapper.selectList(new LambdaQueryWrapper<Message>()
                .eq(Message::getConversationId, id)
                .orderByAsc(Message::getId));
        List<MessageView> views = messages.stream()
                .map(message -> new MessageView(message.getId(), message.getRole(), message.getContent(),
                        parseJson(message.getRefs()), message.getCreatedAt()))
                .collect(Collectors.toList());
        return new ConversationDetail(toSummary(conversation, views.size()), views);
    }

    @Transactional
    public void delete(Long userId, Long id) {
        find(userId, id);
        messageMapper.delete(new LambdaQueryWrapper<Message>().eq(Message::getConversationId, id));
        conversationMapper.deleteById(id);
    }

    /** 账号删除时清理该用户的全部会话与消息。 */
    @Transactional
    public void deleteAllByUser(Long userId) {
        List<Long> ids = conversationMapper.selectList(new LambdaQueryWrapper<Conversation>()
                        .eq(Conversation::getUserId, userId))
                .stream()
                .map(Conversation::getId)
                .toList();
        if (!ids.isEmpty()) {
            messageMapper.delete(new LambdaQueryWrapper<Message>().in(Message::getConversationId, ids));
        }
        conversationMapper.delete(new LambdaQueryWrapper<Conversation>().eq(Conversation::getUserId, userId));
    }

    private Conversation find(Long userId, Long id) {
        Conversation conversation = conversationMapper.selectById(id);
        if (conversation == null || !userId.equals(conversation.getUserId())) {
            throw new ConversationNotFoundException("会话不存在或无权访问");
        }
        return conversation;
    }

    private Map<Long, Long> messageCounts(List<Long> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        QueryWrapper<Message> wrapper = new QueryWrapper<>();
        wrapper.select("conversation_id AS conversation_id", "COUNT(*) AS cnt")
                .in("conversation_id", ids)
                .groupBy("conversation_id");
        Map<Long, Long> counts = new HashMap<>();
        for (Map<String, Object> row : messageMapper.selectMaps(wrapper)) {
            Object id = row.containsKey("conversation_id") ? row.get("conversation_id") : row.get("conversationId");
            Object count = row.containsKey("cnt") ? row.get("cnt") : row.get("CNT");
            if (id instanceof Number idNumber && count instanceof Number countNumber) {
                counts.put(idNumber.longValue(), countNumber.longValue());
            }
        }
        return counts;
    }

    private ConversationSummary toSummary(Conversation conversation, long messageCount) {
        return new ConversationSummary(conversation.getId(), conversation.getTitle(), conversation.getMode(),
                conversation.getIdeaId(), messageCount, conversation.getCreatedAt(), conversation.getUpdatedAt());
    }

    private JsonNode parseJson(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(value);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private String toJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("JSON 序列化失败：" + e.getOriginalMessage());
        }
    }

    private String truncate(String value, int maxLength) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }
}
