package com.githubstars.dto;

/** 索引 worker 上报 README 文档（M4 一期只支持 readme）。 */
public record RepoDocumentUpsertRequest(
        Long repoId,
        String kind,
        String sourceUrl,
        String sha,
        String etag,
        String content,
        Integer tokenCount,
        /** README 语言状态：0=英文原文，1=已翻译，2=翻译失败；null 表示本次不更新。 */
        Integer lang) {
}
