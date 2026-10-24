package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.githubstars.dto.IndexRepoItem;
import com.githubstars.dto.IndexRepoPage;
import com.githubstars.dto.RepoDocumentUpsertRequest;
import com.githubstars.dto.RepoResponse;
import com.githubstars.entity.RepoDocument;
import com.githubstars.entity.Repository;
import com.githubstars.mapper.RepoDocumentMapper;
import com.githubstars.mapper.RepositoryMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 文档与索引状态：ingest-worker 经内部接口读写，backend 仍是唯一数据出口。
 */
@Service
public class DocumentService {

    private static final String KIND_README = "readme";
    private static final int CONTENT_MAX_LENGTH = 2_000_000;

    private final RepoDocumentMapper documentMapper;
    private final RepositoryMapper repositoryMapper;
    private final RepoAssembler assembler;

    public DocumentService(RepoDocumentMapper documentMapper, RepositoryMapper repositoryMapper,
                           RepoAssembler assembler) {
        this.documentMapper = documentMapper;
        this.repositoryMapper = repositoryMapper;
        this.assembler = assembler;
    }

    public IndexRepoPage listIndexRepos(Long cursor, int limit) {
        int pageSize = Math.min(Math.max(limit, 1), 500);
        long after = cursor == null ? 0L : cursor;
        List<Repository> repos = repositoryMapper.selectList(
                new LambdaQueryWrapper<Repository>()
                        .gt(Repository::getId, after)
                        .eq(Repository::getArchived, 0)
                        .eq(Repository::getDisabled, 0)
                        .orderByAsc(Repository::getId)
                        .last("LIMIT " + pageSize));
        List<IndexRepoItem> items = repos.stream()
                .map(repo -> new IndexRepoItem(repo.getId(), repo.getFullName(), repo.getDefaultBranch(),
                        repo.getPushedAt(), repo.getReadmeSha(), null, repo.getDocsIndexedAt(),
                        repo.getLanguage(), repo.getCategory(), repo.getLicense(), repo.getPlatform(),
                        repo.getStars()))
                .toList();
        if (!items.isEmpty()) {
            Map<Long, String> etags = documentMapper.selectList(new LambdaQueryWrapper<RepoDocument>()
                            .eq(RepoDocument::getKind, KIND_README)
                            .in(RepoDocument::getRepoId, items.stream().map(IndexRepoItem::repoId).toList()))
                    .stream()
                    .filter(document -> document.getEtag() != null)
                    .collect(Collectors.toMap(RepoDocument::getRepoId, RepoDocument::getEtag));
            items = items.stream()
                    .map(item -> new IndexRepoItem(item.repoId(), item.fullName(), item.defaultBranch(),
                            item.pushedAt(), item.readmeSha(), etags.get(item.repoId()), item.docsIndexedAt(),
                            item.language(), item.category(), item.license(), item.platform(), item.stars()))
                    .toList();
        }
        Long nextCursor = items.isEmpty() ? null : items.get(items.size() - 1).repoId();
        return new IndexRepoPage(items, nextCursor);
    }

    public Long upsert(RepoDocumentUpsertRequest request) {
        if (request.repoId() == null) {
            throw new IllegalArgumentException("repoId 必填");
        }
        String kind = request.kind() == null || request.kind().isBlank() ? KIND_README : request.kind();
        if (request.content() != null && request.content().length() > CONTENT_MAX_LENGTH) {
            throw new IllegalArgumentException("文档内容超出长度上限");
        }
        Repository repo = repositoryMapper.selectById(request.repoId());
        if (repo == null) {
            throw new IllegalArgumentException("仓库不存在：" + request.repoId());
        }

        RepoDocument existing = documentMapper.selectOne(new LambdaQueryWrapper<RepoDocument>()
                .eq(RepoDocument::getRepoId, request.repoId())
                .eq(RepoDocument::getKind, kind));

        LocalDateTime now = LocalDateTime.now();
        RepoDocument document = existing == null ? new RepoDocument() : existing;
        document.setRepoId(request.repoId());
        document.setKind(kind);
        document.setSourceUrl(request.sourceUrl());
        document.setSha(request.sha());
        document.setEtag(request.etag());
        document.setContent(request.content());
        document.setTokenCount(request.tokenCount());
        document.setFetchedAt(now);
        if (existing == null) {
            documentMapper.insert(document);
        } else {
            documentMapper.updateById(document);
        }

        if (KIND_README.equals(kind)) {
            repositoryMapper.update(null, new LambdaUpdateWrapper<Repository>()
                    .eq(Repository::getId, request.repoId())
                    .set(Repository::getReadmeSha, request.sha()));
        }
        return document.getId();
    }

    public void markIndexed(List<Long> repoIds) {
        if (repoIds == null || repoIds.isEmpty()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        repositoryMapper.update(null, new LambdaUpdateWrapper<Repository>()
                .in(Repository::getId, repoIds)
                .set(Repository::getDocsIndexedAt, now));
    }

    public List<RepoResponse> batch(List<String> fullNames) {
        if (fullNames == null || fullNames.isEmpty()) {
            return List.of();
        }
        List<String> unique = fullNames.stream()
                .filter(name -> name != null && !name.isBlank())
                .distinct()
                .limit(100)
                .toList();
        if (unique.isEmpty()) {
            return List.of();
        }
        List<Repository> repos = repositoryMapper.selectList(
                new LambdaQueryWrapper<Repository>().in(Repository::getFullName, unique));
        Set<String> requested = Set.copyOf(unique);
        return repos.stream()
                .filter(repo -> requested.contains(repo.getFullName()))
                .sorted((left, right) -> Integer.compare(
                        unique.indexOf(left.getFullName()), unique.indexOf(right.getFullName())))
                .map(assembler::toResponse)
                .toList();
    }
}
