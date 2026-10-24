package com.githubstars.dto;

import java.util.List;

public record RecommendationResponse(RepoResponse repo, List<String> reasons) {
}
