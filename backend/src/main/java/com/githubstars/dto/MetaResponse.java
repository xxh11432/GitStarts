package com.githubstars.dto;

import java.util.List;

public record MetaResponse(List<FacetItem> categories, List<FacetItem> languages, List<FacetItem> topics,
                           List<FacetItem> platforms) {
}
