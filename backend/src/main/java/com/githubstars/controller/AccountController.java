package com.githubstars.controller;

import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.service.AccountService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 账号数据清理：删除账号及收藏、想法、对比、会话、画像与用量记录。
 */
@RestController
@RequestMapping("/account")
public class AccountController {

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    @DeleteMapping
    public Map<String, Object> delete(@AuthenticationPrincipal OAuth2UserPrincipal principal,
                                      HttpServletRequest request,
                                      HttpServletResponse response) {
        accountService.delete(principal.getUserId());
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        new SecurityContextLogoutHandler().logout(request, response, authentication);
        return Map.of("ok", true);
    }
}
