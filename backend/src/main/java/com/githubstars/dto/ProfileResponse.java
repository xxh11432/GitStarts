package com.githubstars.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ProfileResponse(
        List<String> skills,
        List<String> interests,
        List<String> preferences,
        LocalDateTime updatedAt) {
}
