package com.githubstars.dto;

import com.fasterxml.jackson.databind.JsonNode;

/** 条件编辑：只允许改标题与结构化条件，rawText 保持不变。 */
public record IdeaUpdateRequest(String title, JsonNode structured) {
}
