package com.githubstars.service;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 从 README Markdown 提取可直接展示的纯文本摘要。
 */
@Component
public class ReadmeSummarizer {

    private static final Pattern CODE_FENCE = Pattern.compile("```[\\s\\S]*?```");
    private static final Pattern HTML_COMMENT = Pattern.compile("<!--[\\s\\S]*?-->");
    private static final Pattern HTML_TAG = Pattern.compile("<[^>]+>");
    private static final Pattern IMAGE = Pattern.compile("!\\[[^\\]]*]\\([^)]*\\)");
    private static final Pattern LINK = Pattern.compile("\\[([^\\]]+)]\\([^)]*\\)");
    private static final Pattern REFERENCE_LINK = Pattern.compile("\\[([^\\]]+)]\\[[^\\]]*]");
    private static final Pattern INLINE_CODE = Pattern.compile("`([^`]*)`");
    private static final Pattern ALERT = Pattern.compile("\\[![A-Z]+]");
    private static final Pattern BOLD = Pattern.compile("(\\*\\*|__)(.+?)\\1");
    private static final Pattern EMPTY_PARENS = Pattern.compile("\\(\\s*\\)");
    private static final Pattern HEADING = Pattern.compile("^#{1,6}\\s+.*$", Pattern.MULTILINE);
    private static final Pattern HR = Pattern.compile("^(?:---+|\\*\\*\\*+|___+)$", Pattern.MULTILINE);
    private static final int MIN_PARAGRAPH_LENGTH = 24;

    public String summarize(String markdown, int maxChars) {
        if (markdown == null || markdown.isBlank() || maxChars <= 0) {
            return null;
        }
        String text = markdown.replace("\r\n", "\n").replace('\r', '\n');
        text = CODE_FENCE.matcher(text).replaceAll("\n\n");
        text = HTML_COMMENT.matcher(text).replaceAll(" ");
        text = IMAGE.matcher(text).replaceAll(" ");
        text = LINK.matcher(text).replaceAll("$1");
        text = REFERENCE_LINK.matcher(text).replaceAll("$1");
        text = INLINE_CODE.matcher(text).replaceAll("$1");
        text = ALERT.matcher(text).replaceAll(" ");
        text = HTML_TAG.matcher(text).replaceAll(" ");
        text = EMPTY_PARENS.matcher(text).replaceAll(" ");
        text = HEADING.matcher(text).replaceAll("\n\n");
        text = HR.matcher(text).replaceAll("\n\n");

        List<String> paragraphs = new ArrayList<>();
        for (String block : text.split("\n\\s*\n")) {
            String paragraph = cleanParagraph(block);
            if (paragraph.length() >= MIN_PARAGRAPH_LENGTH) {
                paragraphs.add(paragraph);
            }
        }
        if (paragraphs.isEmpty()) {
            for (String block : text.split("\n\\s*\n")) {
                String paragraph = cleanParagraph(block);
                if (paragraph.length() >= 8) {
                    paragraphs.add(paragraph);
                }
            }
        }
        if (paragraphs.isEmpty()) {
            return null;
        }

        StringBuilder summary = new StringBuilder();
        for (String paragraph : paragraphs) {
            if (summary.length() > 0) {
                summary.append(' ');
            }
            summary.append(paragraph);
            if (summary.length() >= maxChars) {
                break;
            }
        }
        if (summary.length() > maxChars) {
            return summary.substring(0, maxChars).trim() + "…";
        }
        return summary.toString();
    }

    private String cleanParagraph(String block) {
        StringBuilder paragraph = new StringBuilder();
        for (String rawLine : block.split("\n")) {
            String line = rawLine.trim();
            if (line.isEmpty() || isDecoration(line)) {
                continue;
            }
            line = line.replaceAll("^[>\\-+*]\\s*", "").replaceAll("^\\d+[.)]\\s*", "");
            if (paragraph.length() > 0) {
                paragraph.append(' ');
            }
            paragraph.append(line);
        }
        return BOLD.matcher(paragraph.toString().replaceAll("\\s{2,}", " ").trim())
                .replaceAll("$2");
    }

    private boolean isDecoration(String line) {
        if (line.chars().filter(ch -> ch == '|').count() >= 2) {
            return true;
        }
        String lower = line.toLowerCase(Locale.ROOT);
        return lower.startsWith("table of contents") || lower.startsWith("目录")
                || lower.startsWith("badge") || lower.startsWith("license:") && line.length() < 30;
    }
}
