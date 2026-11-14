package com.githubstars.dto;

/**
 * 索引 worker 读取已存 README 原文（摘要回填用，内容在服务端截断）。
 */
public record RepoReadmeResponse(
        Long repoId,
        String content,
        String sha,
        String etag,
        Integer lang) {
}
