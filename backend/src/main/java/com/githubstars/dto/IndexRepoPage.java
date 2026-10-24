package com.githubstars.dto;

import java.util.List;

public record IndexRepoPage(List<IndexRepoItem> items, Long nextCursor) {
}
