package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.githubstars.dto.FavoriteCreateRequest;
import com.githubstars.dto.FavoriteResponse;
import com.githubstars.dto.FavoriteStatusResponse;
import com.githubstars.dto.FavoriteUpdateRequest;
import com.githubstars.dto.PageResult;
import com.githubstars.entity.Favorite;
import com.githubstars.entity.Repository;
import com.githubstars.exception.FavoriteNotFoundException;
import com.githubstars.mapper.FavoriteMapper;
import com.githubstars.mapper.RepositoryMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 收藏与备注：按 user_id 隔离，跨会话持久化在 MySQL。
 */
@Service
public class FavoriteService {

    private static final int NOTE_MAX_LENGTH = 500;
    private static final int MAX_FAVORITES = 200;

    private final FavoriteMapper favoriteMapper;
    private final RepositoryMapper repositoryMapper;
    private final RepoAssembler assembler;

    public FavoriteService(FavoriteMapper favoriteMapper, RepositoryMapper repositoryMapper,
                           RepoAssembler assembler) {
        this.favoriteMapper = favoriteMapper;
        this.repositoryMapper = repositoryMapper;
        this.assembler = assembler;
    }

    public FavoriteResponse create(Long userId, FavoriteCreateRequest request) {
        if (request == null || request.fullName() == null || request.fullName().isBlank()) {
            throw new IllegalArgumentException("fullName 必填");
        }
        String fullName = normalizeFullName(request.fullName());
        Repository repo = repositoryMapper.selectOne(
                new LambdaQueryWrapper<Repository>().eq(Repository::getFullName, fullName));
        if (repo == null) {
            throw new IllegalArgumentException("仓库不存在或尚未收录");
        }

        LocalDateTime now = LocalDateTime.now();
        Favorite existing = favoriteMapper.selectOne(new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, userId)
                .eq(Favorite::getRepoId, repo.getId()));
        if (existing != null) {
            if (request.note() != null) {
                existing.setNote(normalizeNote(request.note()));
            }
            existing.setUpdatedAt(now);
            LambdaUpdateWrapper<Favorite> updateWrapper = new LambdaUpdateWrapper<Favorite>()
                    .eq(Favorite::getId, existing.getId())
                    .set(Favorite::getUpdatedAt, now);
            if (existing.getNote() == null) {
                updateWrapper.setSql("note = NULL");
            } else {
                updateWrapper.set(Favorite::getNote, existing.getNote());
            }
            favoriteMapper.update(null, updateWrapper);
            return toResponse(existing, repo);
        }

        long count = favoriteMapper.selectCount(
                new LambdaQueryWrapper<Favorite>().eq(Favorite::getUserId, userId));
        if (count >= MAX_FAVORITES) {
            throw new IllegalArgumentException("收藏数量已达上限（" + MAX_FAVORITES + "）");
        }

        Favorite favorite = new Favorite();
        favorite.setUserId(userId);
        favorite.setRepoId(repo.getId());
        favorite.setFullName(fullName);
        favorite.setNote(normalizeNote(request.note()));
        favorite.setCreatedAt(now);
        favorite.setUpdatedAt(now);
        try {
            favoriteMapper.insert(favorite);
        } catch (DuplicateKeyException e) {
            // 并发重复收藏：由 uk_user_repo 兜底，回查并复用已存在的记录
            return recoverConcurrent(userId, repo.getId(), request.note(), now, repo);
        }
        return toResponse(favorite, repo);
    }

    private FavoriteResponse recoverConcurrent(Long userId, Long repoId, String note, LocalDateTime now,
                                               Repository repo) {
        Favorite concurrent = favoriteMapper.selectOne(new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, userId)
                .eq(Favorite::getRepoId, repoId));
        if (concurrent == null) {
            throw new IllegalStateException("收藏写入冲突，请重试");
        }
        if (note != null) {
            String normalized = normalizeNote(note);
            LambdaUpdateWrapper<Favorite> updateWrapper = new LambdaUpdateWrapper<Favorite>()
                    .eq(Favorite::getId, concurrent.getId())
                    .set(Favorite::getUpdatedAt, now);
            if (normalized == null) {
                updateWrapper.setSql("note = NULL");
            } else {
                updateWrapper.set(Favorite::getNote, normalized);
            }
            favoriteMapper.update(null, updateWrapper);
            concurrent.setNote(normalized);
            concurrent.setUpdatedAt(now);
        }
        return toResponse(concurrent, repo);
    }

    public PageResult<FavoriteResponse> list(Long userId, int page, int size) {
        int current = Math.max(page, 1);
        int pageSize = Math.min(Math.max(size, 1), 50);
        Page<Favorite> result = favoriteMapper.selectPage(new Page<>(current, pageSize),
                new LambdaQueryWrapper<Favorite>()
                        .eq(Favorite::getUserId, userId)
                        .orderByDesc(Favorite::getId));

        Map<Long, Repository> repos = new HashMap<>();
        List<Long> repoIds = result.getRecords().stream()
                .map(Favorite::getRepoId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (!repoIds.isEmpty()) {
            repositoryMapper.selectBatchIds(repoIds)
                    .forEach(repo -> repos.put(repo.getId(), repo));
        }

        List<FavoriteResponse> items = result.getRecords().stream()
                .filter(favorite -> repos.containsKey(favorite.getRepoId()))
                .map(favorite -> toResponse(favorite, repos.get(favorite.getRepoId())))
                .collect(Collectors.toList());
        // total 只统计仓库仍存在的收藏，避免与过滤后的 items 数量不一致
        long total = favoriteMapper.selectCount(new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, userId)
                .inSql(Favorite::getRepoId, "SELECT id FROM repositories"));
        return new PageResult<>(items, total, current, pageSize);
    }

    public FavoriteStatusResponse status(Long userId, String fullName) {
        String normalized = normalizeFullName(fullName);
        Favorite favorite = favoriteMapper.selectOne(new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, userId)
                .eq(Favorite::getFullName, normalized));
        if (favorite == null) {
            return new FavoriteStatusResponse(false, null, null);
        }
        return new FavoriteStatusResponse(true, favorite.getId(), favorite.getNote());
    }

    /**
     * 列表页批量查询收藏状态：一次请求覆盖当前页所有仓库。
     */
    public Map<String, FavoriteStatusResponse> statuses(Long userId, List<String> fullNames) {
        if (fullNames == null || fullNames.isEmpty()) {
            return Map.of();
        }
        List<String> normalized = fullNames.stream()
                .filter(name -> name != null && !name.isBlank())
                .map(this::normalizeFullName)
                .distinct()
                .limit(50)
                .toList();
        if (normalized.isEmpty()) {
            return Map.of();
        }
        Map<String, FavoriteStatusResponse> result = new LinkedHashMap<>();
        for (String name : normalized) {
            result.put(name, new FavoriteStatusResponse(false, null, null));
        }
        List<Favorite> favorites = favoriteMapper.selectList(new LambdaQueryWrapper<Favorite>()
                .eq(Favorite::getUserId, userId)
                .in(Favorite::getFullName, normalized));
        for (Favorite favorite : favorites) {
            result.put(favorite.getFullName(),
                    new FavoriteStatusResponse(true, favorite.getId(), favorite.getNote()));
        }
        return result;
    }

    public FavoriteResponse update(Long userId, Long id, FavoriteUpdateRequest request) {
        Favorite favorite = find(userId, id);
        String note = normalizeNote(request == null ? null : request.note());
        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<Favorite> updateWrapper = new LambdaUpdateWrapper<Favorite>()
                .eq(Favorite::getId, id)
                .set(Favorite::getUpdatedAt, now);
        if (note == null) {
            updateWrapper.setSql("note = NULL");
        } else {
            updateWrapper.set(Favorite::getNote, note);
        }
        favoriteMapper.update(null, updateWrapper);
        favorite.setNote(note);
        favorite.setUpdatedAt(now);
        Repository repo = repositoryMapper.selectById(favorite.getRepoId());
        if (repo == null) {
            throw new FavoriteNotFoundException("收藏的仓库已不存在");
        }
        return toResponse(favorite, repo);
    }

    public void delete(Long userId, Long id) {
        find(userId, id);
        favoriteMapper.deleteById(id);
    }

    /** 账号删除时清理该用户的全部收藏。 */
    public void deleteAllByUser(Long userId) {
        favoriteMapper.delete(new LambdaQueryWrapper<Favorite>().eq(Favorite::getUserId, userId));
    }

    private Favorite find(Long userId, Long id) {
        Favorite favorite = favoriteMapper.selectById(id);
        if (favorite == null || !userId.equals(favorite.getUserId())) {
            throw new FavoriteNotFoundException("收藏不存在或无权访问");
        }
        return favorite;
    }

    private FavoriteResponse toResponse(Favorite favorite, Repository repo) {
        return new FavoriteResponse(favorite.getId(), assembler.toResponse(repo), favorite.getNote(),
                favorite.getCreatedAt(), favorite.getUpdatedAt());
    }

    private String normalizeFullName(String fullName) {
        String value = fullName.trim();
        if (value.startsWith("/")) {
            value = value.substring(1);
        }
        if (value.length() > 255) {
            throw new IllegalArgumentException("fullName 过长");
        }
        return value;
    }

    private String normalizeNote(String note) {
        if (note == null) {
            return null;
        }
        String value = note.trim();
        if (value.isEmpty()) {
            return null;
        }
        return value.length() <= NOTE_MAX_LENGTH ? value : value.substring(0, NOTE_MAX_LENGTH);
    }
}
