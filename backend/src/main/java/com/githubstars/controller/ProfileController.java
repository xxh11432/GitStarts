package com.githubstars.controller;

import com.githubstars.dto.ProfileResponse;
import com.githubstars.dto.ProfileUpdateRequest;
import com.githubstars.dto.RecommendationResponse;
import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.service.ProfileService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 用户画像与画像推荐位：画像只对本人可见，推荐只使用本人填写的技能 / 兴趣 / 偏好。
 */
@RestController
@RequestMapping("/profile")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    public ProfileResponse get(@AuthenticationPrincipal OAuth2UserPrincipal principal) {
        return profileService.get(principal.getUserId());
    }

    @PutMapping
    public ProfileResponse update(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                  @RequestBody ProfileUpdateRequest request) {
        return profileService.update(principal.getUserId(), request);
    }

    @GetMapping("/recommendations")
    public List<RecommendationResponse> recommendations(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                                        @RequestParam(defaultValue = "6") int limit) {
        return profileService.recommendations(principal.getUserId(), limit);
    }
}
