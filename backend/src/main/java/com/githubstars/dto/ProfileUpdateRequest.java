package com.githubstars.dto;

import java.util.List;

public record ProfileUpdateRequest(List<String> skills, List<String> interests, List<String> preferences) {
}
