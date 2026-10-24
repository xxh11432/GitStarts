package com.githubstars.dto;

import com.fasterxml.jackson.databind.JsonNode;

/** 创建想法：rawText 必填；structured 由 AI 生成后回写（也允许用户直接提交）。 */
public record IdeaCreateRequest(Long userId, String title, String rawText, JsonNode structured) {
}
