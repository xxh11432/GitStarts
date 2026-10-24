package com.githubstars.controller;

import com.githubstars.dto.QuotaResponse;
import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.service.QuotaService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class QuotaController {

    private final QuotaService quotaService;

    public QuotaController(QuotaService quotaService) {
        this.quotaService = quotaService;
    }

    @GetMapping("/quota")
    public QuotaResponse quota(@AuthenticationPrincipal OAuth2UserPrincipal principal) {
        return quotaService.current(principal.getUserId());
    }
}
