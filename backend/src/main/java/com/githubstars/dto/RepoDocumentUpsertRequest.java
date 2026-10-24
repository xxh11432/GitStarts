package com.githubstars.dto;

/** 索引 worker 上报 README 文档（M4 一期只支持 readme）。 */
public record RepoDocumentUpsertRequest(
        Long repoId,
        String kind,
        String sourceUrl,
        String sha,
        String etag,
        String content,
        Integer tokenCount) {
}
