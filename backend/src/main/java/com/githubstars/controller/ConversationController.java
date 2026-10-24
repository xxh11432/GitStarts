package com.githubstars.controller;

import com.githubstars.dto.ConversationDetail;
import com.githubstars.dto.ConversationSummary;
import com.githubstars.dto.PageResult;
import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.service.ConversationService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 会话历史：列表与详情都只返回当前登录用户自己的会话。
 */
@RestController
@RequestMapping("/conversations")
public class ConversationController {

    private final ConversationService conversationService;

    public ConversationController(ConversationService conversationService) {
        this.conversationService = conversationService;
    }

    @GetMapping
    public PageResult<ConversationSummary> list(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                                @RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "20") int size) {
        return conversationService.list(principal.getUserId(), page, size);
    }

    @GetMapping("/{id}")
    public ConversationDetail get(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                  @PathVariable Long id) {
        return conversationService.get(principal.getUserId(), id);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                      @PathVariable Long id) {
        conversationService.delete(principal.getUserId(), id);
        return Map.of("ok", true);
    }
}
