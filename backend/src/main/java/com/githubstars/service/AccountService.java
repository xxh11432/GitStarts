package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.githubstars.entity.Idea;
import com.githubstars.entity.UsageDaily;
import com.githubstars.entity.UserProfile;
import com.githubstars.mapper.IdeaMapper;
import com.githubstars.mapper.UsageDailyMapper;
import com.githubstars.mapper.UserMapper;
import com.githubstars.mapper.UserProfileMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 账号数据清理：删除账号时一并移除收藏、想法、对比、会话、画像与用量记录。
 */
@Service
public class AccountService {

    private final UserMapper userMapper;
    private final UserProfileMapper userProfileMapper;
    private final IdeaMapper ideaMapper;
    private final UsageDailyMapper usageDailyMapper;
    private final FavoriteService favoriteService;
    private final ComparisonService comparisonService;
    private final ConversationService conversationService;
    private final QuotaService quotaService;

    public AccountService(UserMapper userMapper, UserProfileMapper userProfileMapper,
                          IdeaMapper ideaMapper, UsageDailyMapper usageDailyMapper,
                          FavoriteService favoriteService, ComparisonService comparisonService,
                          ConversationService conversationService, QuotaService quotaService) {
        this.userMapper = userMapper;
        this.userProfileMapper = userProfileMapper;
        this.ideaMapper = ideaMapper;
        this.usageDailyMapper = usageDailyMapper;
        this.favoriteService = favoriteService;
        this.comparisonService = comparisonService;
        this.conversationService = conversationService;
        this.quotaService = quotaService;
    }

    @Transactional
    public void delete(Long userId) {
        conversationService.deleteAllByUser(userId);
        favoriteService.deleteAllByUser(userId);
        comparisonService.deleteAllByUser(userId);
        ideaMapper.delete(new LambdaQueryWrapper<Idea>().eq(Idea::getUserId, userId));
        userProfileMapper.delete(new LambdaQueryWrapper<UserProfile>().eq(UserProfile::getUserId, userId));
        usageDailyMapper.delete(new LambdaQueryWrapper<UsageDaily>().eq(UsageDaily::getUserId, userId));
        userMapper.deleteById(userId);
        quotaService.clear(userId);
    }
}
