package com.githubstars.security;

import com.githubstars.entity.User;
import com.githubstars.service.UserService;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class GithubOAuth2UserService extends DefaultOAuth2UserService {

    private final UserService userService;

    public GithubOAuth2UserService(UserService userService) {
        this.userService = userService;
    }

    @Override
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        OAuth2User githubUser = super.loadUser(userRequest);
        Map<String, Object> attributes = githubUser.getAttributes();

        String providerUid = stringValue(attributes.get("id"));
        if (providerUid.isBlank()) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error("invalid_user_info", "GitHub 未返回用户 id", null));
        }
        String login = stringValue(attributes.get("login"));
        String nickname = firstNonBlank(stringValue(attributes.get("name")), login, "GitHub 用户");
        String avatarUrl = stringValue(attributes.get("avatar_url"));
        String email = stringValue(attributes.get("email"));

        User user = userService.findOrCreateGithub(providerUid, login, nickname, avatarUrl, email);
        return new OAuth2UserPrincipal(user.getId(), login, user.getNickname(), user.getAvatarUrl(),
                List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }
}
