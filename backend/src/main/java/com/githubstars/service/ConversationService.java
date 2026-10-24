package com.githubstars.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.githubstars.dto.ConversationCreateRequest;
import com.githubstars.dto.MessageCreateRequest;
import com.githubstars.entity.Conversation;
import com.githubstars.entity.Message;
import com.githubstars.mapper.ConversationMapper;
import com.githubstars.mapper.MessageMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

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
        if (request.role() == null || request.role().isBlank()) {
            throw new IllegalArgumentException("role 必填");
        }
        LocalDateTime now = LocalDateTime.now();
        Message message = new Message();
        message.setConversationId(request.conversationId());
        message.setRole(request.role());
        message.setContent(request.content());
        message.setToolTrace(toJson(request.toolTrace()));
        message.setRefs(toJson(request.refs()));
        message.setTokensIn(request.tokensIn());
        message.setTokensOut(request.tokensOut());
        message.setCreatedAt(now);
        messageMapper.insert(message);
        conversationMapper.touch(request.conversationId(), now);
        return message.getId();
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
