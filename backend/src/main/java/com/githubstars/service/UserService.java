package com.githubstars.service;

import com.githubstars.entity.User;
import com.githubstars.entity.UserProfile;
import com.githubstars.mapper.UserMapper;
import com.githubstars.mapper.UserProfileMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
public class UserService {

    private static final String PROVIDER_GITHUB = "github";

    private final UserMapper userMapper;
    private final UserProfileMapper userProfileMapper;

    public UserService(UserMapper userMapper, UserProfileMapper userProfileMapper) {
        this.userMapper = userMapper;
        this.userProfileMapper = userProfileMapper;
    }

    /**
     * GitHub 登录时落库：首次创建，之后刷新昵称 / 头像 / 最近登录时间。
     */
    @Transactional
    public User findOrCreateGithub(String providerUid, String login, String nickname,
                                   String avatarUrl, String email) {
        LocalDateTime now = LocalDateTime.now();
        User user = userMapper.findByProviderUid(PROVIDER_GITHUB, providerUid);
        if (user == null) {
            User created = new User();
            created.setProvider(PROVIDER_GITHUB);
            created.setProviderUid(providerUid);
            created.setEmail(email);
            created.setNickname(nickname);
            created.setAvatarUrl(avatarUrl);
            created.setCreatedAt(now);
            created.setLastLoginAt(now);
            try {
                userMapper.insert(created);
                return created;
            } catch (DuplicateKeyException e) {
                // 并发首次登录：唯一键兜底后重新读取
                user = userMapper.findByProviderUid(PROVIDER_GITHUB, providerUid);
                if (user == null) {
                    throw e;
                }
            }
        }
        user.setNickname(nickname);
        user.setAvatarUrl(avatarUrl);
        if (email != null && !email.isBlank()) {
            user.setEmail(email);
        }
        user.setLastLoginAt(now);
        userMapper.updateById(user);
        return user;
    }

    public User requireById(Long id) {
        User user = userMapper.selectById(id);
        if (user == null) {
            throw new IllegalStateException("用户不存在：" + id);
        }
        return user;
    }

    public UserProfile getProfile(Long userId) {
        UserProfile profile = userProfileMapper.selectById(userId);
        if (profile != null) {
            return profile;
        }
        UserProfile empty = new UserProfile();
        empty.setUserId(userId);
        empty.setUpdatedAt(LocalDateTime.now());
        return empty;
    }

    @Transactional
    public void saveProfile(Long userId, String skills, String interests, String preferences) {
        UserProfile profile = userProfileMapper.selectById(userId);
        LocalDateTime now = LocalDateTime.now();
        if (profile == null) {
            profile = new UserProfile();
            profile.setUserId(userId);
            profile.setSkills(skills);
            profile.setInterests(interests);
            profile.setPreferences(preferences);
            profile.setUpdatedAt(now);
            userProfileMapper.insert(profile);
            return;
        }
        profile.setSkills(skills);
        profile.setInterests(interests);
        profile.setPreferences(preferences);
        profile.setUpdatedAt(now);
        userProfileMapper.updateById(profile);
    }
}
