package com.githubstars.controller;

import com.githubstars.dto.IdeaCreateRequest;
import com.githubstars.dto.IdeaResponse;
import com.githubstars.dto.IdeaUpdateRequest;
import com.githubstars.dto.PageResult;
import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.service.IdeaService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 想法与条件编辑：登录用户仅能访问自己的数据。
 */
@RestController
@RequestMapping("/ideas")
public class IdeaController {

    private final IdeaService ideaService;

    public IdeaController(IdeaService ideaService) {
        this.ideaService = ideaService;
    }

    @PostMapping
    public IdeaResponse create(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                               @RequestBody IdeaCreateRequest request) {
        return ideaService.create(new IdeaCreateRequest(principal.getUserId(), request.title(),
                request.rawText(), request.structured()));
    }

    @GetMapping
    public PageResult<IdeaResponse> list(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                         @RequestParam(defaultValue = "1") int page,
                                         @RequestParam(defaultValue = "20") int size) {
        return ideaService.list(principal.getUserId(), page, size);
    }

    @GetMapping("/{id}")
    public IdeaResponse get(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                            @PathVariable Long id) {
        return ideaService.get(id, principal.getUserId());
    }

    @PatchMapping("/{id}")
    public IdeaResponse update(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                               @PathVariable Long id,
                               @RequestBody IdeaUpdateRequest request) {
        return ideaService.update(id, principal.getUserId(), request);
    }
}
