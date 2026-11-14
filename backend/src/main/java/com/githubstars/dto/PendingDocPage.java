package com.githubstars.dto;

import java.util.List;

public record PendingDocPage(List<PendingDocItem> items, Long nextCursor) {
}
