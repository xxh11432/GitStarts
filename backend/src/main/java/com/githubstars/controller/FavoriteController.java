package com.githubstars.controller;

import com.githubstars.dto.FavoriteCreateRequest;
import com.githubstars.dto.FavoriteResponse;
import com.githubstars.dto.FavoriteStatusResponse;
import com.githubstars.dto.FavoriteUpdateRequest;
import com.githubstars.dto.PageResult;
import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.service.FavoriteService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 收藏仓库与备注：仅登录用户访问，数据按 user_id 隔离。
 */
@RestController
@RequestMapping("/favorites")
public class FavoriteController {

    private final FavoriteService favoriteService;

    public FavoriteController(FavoriteService favoriteService) {
        this.favoriteService = favoriteService;
    }

    @PostMapping
    public FavoriteResponse create(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                   @RequestBody FavoriteCreateRequest request) {
        return favoriteService.create(principal.getUserId(), request);
    }

    @GetMapping
    public PageResult<FavoriteResponse> list(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                             @RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "20") int size) {
        return favoriteService.list(principal.getUserId(), page, size);
    }

    @GetMapping("/status")
    public FavoriteStatusResponse status(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                         @RequestParam String fullName) {
        return favoriteService.status(principal.getUserId(), fullName);
    }

    /**
     * 列表页批量收藏状态：fullNames 用逗号分隔，最多 50 个。
     */
    @GetMapping("/statuses")
    public Map<String, FavoriteStatusResponse> statuses(
            @AuthenticationPrincipal OAuth2UserPrincipal principal,
            @RequestParam String fullNames) {
        return favoriteService.statuses(principal.getUserId(), List.of(fullNames.split(",")));
    }

    @PatchMapping("/{id}")
    public FavoriteResponse update(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                   @PathVariable Long id,
                                   @RequestBody FavoriteUpdateRequest request) {
        return favoriteService.update(principal.getUserId(), id, request);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                      @PathVariable Long id) {
        favoriteService.delete(principal.getUserId(), id);
        return Map.of("ok", true);
    }
}
