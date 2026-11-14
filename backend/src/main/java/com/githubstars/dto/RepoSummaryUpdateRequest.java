package com.githubstars.dto;

/**
 * 索引 worker 回写仓库档案摘要（rerank 文档使用）。
 */
public record RepoSummaryUpdateRequest(String summary) {
}
