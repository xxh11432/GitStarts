package com.githubstars.controller;

import com.githubstars.dto.ComparisonResponse;
import com.githubstars.dto.ComparisonShareResponse;
import com.githubstars.dto.ComparisonSummary;
import com.githubstars.dto.PageResult;
import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.service.ComparisonService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 对比历史、详情与只读分享：分享链接无需登录，但只暴露对比本身。
 */
@RestController
@RequestMapping("/comparisons")
public class ComparisonController {

    private final ComparisonService comparisonService;

    public ComparisonController(ComparisonService comparisonService) {
        this.comparisonService = comparisonService;
    }

    @GetMapping("/{id}")
    public ComparisonResponse get(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                  @PathVariable Long id) {
        return comparisonService.get(id, principal.getUserId());
    }

    @GetMapping
    public PageResult<ComparisonSummary> list(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                              @RequestParam(defaultValue = "1") int page,
                                              @RequestParam(defaultValue = "20") int size,
                                              @RequestParam(required = false) Long ideaId) {
        return comparisonService.list(principal.getUserId(), page, size, ideaId);
    }

    @PostMapping("/{id}/share")
    public Map<String, Object> share(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                     @PathVariable Long id) {
        return Map.of("token", comparisonService.share(id, principal.getUserId()));
    }

    @PostMapping("/{id}/share/revoke")
    public Map<String, Object> revokeShare(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                           @PathVariable Long id) {
        comparisonService.revokeShare(id, principal.getUserId());
        return Map.of("ok", true);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                      @PathVariable Long id) {
        comparisonService.delete(id, principal.getUserId());
        return Map.of("ok", true);
    }

    @GetMapping("/share/{token}")
    public ComparisonShareResponse share(@PathVariable String token) {
        return comparisonService.getByShare(token);
    }
}
