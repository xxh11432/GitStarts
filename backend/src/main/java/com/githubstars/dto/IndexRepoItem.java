package com.githubstars.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 索引 worker 的仓库游标分页：只返回索引需要的字段，避免传输 README。
 */
public record IndexRepoItem(
        Long repoId,
        String fullName,
        String defaultBranch,
        LocalDateTime pushedAt,
        String readmeSha,
        String readmeEtag,
        LocalDateTime docsIndexedAt,
        String language,
        String category,
        String license,
        String platform,
        Integer stars) {
}
