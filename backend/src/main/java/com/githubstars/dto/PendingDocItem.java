package com.githubstars.dto;

import java.time.LocalDateTime;

/**
 * 待语言检测 / 待重试翻译的 README：ingest-worker 回填存量数据时使用。
 */
public record PendingDocItem(
        Long repoId,
        String fullName,
        String sourceUrl,
        String sha,
        String etag,
        String content,
        Integer tokenCount,
        Integer lang,
        LocalDateTime pushedAt,
        String language,
        String category,
        String license,
        String platform,
        Integer stars) {
}
