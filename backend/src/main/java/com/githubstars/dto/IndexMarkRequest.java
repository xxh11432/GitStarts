package com.githubstars.dto;

import java.util.List;

public record IndexMarkRequest(List<Long> repoIds) {
}
