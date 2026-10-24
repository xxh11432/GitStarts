package com.githubstars.dto;

import java.util.List;

public record ConversationDetail(ConversationSummary conversation, List<MessageView> messages) {
}
