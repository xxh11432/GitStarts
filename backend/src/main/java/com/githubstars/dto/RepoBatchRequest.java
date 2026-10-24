package com.githubstars.dto;

import java.util.List;

public record RepoBatchRequest(List<String> fullNames) {
}
