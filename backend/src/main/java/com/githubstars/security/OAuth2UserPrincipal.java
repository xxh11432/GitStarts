package com.githubstars.security;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.io.Serial;
import java.io.Serializable;
import java.util.Collection;
import java.util.Map;

/**
 * 会话中保存的登录主体。只保留业务需要的字段，避免把 GitHub 全量响应写进 Redis。
 */
public class OAuth2UserPrincipal implements OAuth2User, Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private final Long userId;
    private final String login;
    private final String nickname;
    private final String avatarUrl;
    private final Collection<? extends GrantedAuthority> authorities;

    public OAuth2UserPrincipal(Long userId, String login, String nickname, String avatarUrl,
                               Collection<? extends GrantedAuthority> authorities) {
        this.userId = userId;
        this.login = login;
        this.nickname = nickname;
        this.avatarUrl = avatarUrl;
        this.authorities = authorities;
    }

    @Override
    public Map<String, Object> getAttributes() {
        return Map.of("login", login == null ? "" : login);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getName() {
        return login == null ? String.valueOf(userId) : login;
    }

    public Long getUserId() {
        return userId;
    }

    public String getLogin() {
        return login;
    }

    public String getNickname() {
        return nickname;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }
}
