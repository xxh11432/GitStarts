package com.githubstars.service;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 根据 topics / 描述 / 语言关键词推导运行平台。
 * topics 与描述命中权重更高；只有语言信号不足以判定平台。
 * 多个平台得分相同视为跨平台项目，归入 other。
 */
@Component
public class PlatformResolver {

    public static final String OTHER = "other";

    private static final Map<String, List<Pattern>> PLATFORM_RULES = new LinkedHashMap<>();
    private static final Map<String, String> LANGUAGE_RULES = new LinkedHashMap<>();

    static {
        rule("windows", "windows", "win32", "wpf", "winforms", "uwp", "windows-app");
        rule("mac", "macos", "mac-os", "osx", "mac-app", "appkit", "cocoa", "mac");
        rule("linux", "linux", "linux-app", "gnome", "kde", "ubuntu", "debian", "fedora");
        rule("android", "android", "android-app", "androidx", "安卓");
        rule("ios", "ios", "iphone", "ipad", "swiftui", "uikit", "ios-app");
        rule("harmony", "harmonyos", "harmony-os", "openharmony", "arkts", "hmos", "鸿蒙");
        rule("extension", "browser-extension", "chrome-extension", "firefox-extension", "firefox-addon",
                "vscode-extension", "vscode-plugin", "chrome-plugin", "obsidian-plugin", "jetbrains-plugin");

        LANGUAGE_RULES.put("swift", "ios");
        LANGUAGE_RULES.put("objective-c", "ios");
        LANGUAGE_RULES.put("kotlin", "android");
        LANGUAGE_RULES.put("c#", "windows");
        LANGUAGE_RULES.put("shell", "linux");
        LANGUAGE_RULES.put("powershell", "windows");
        LANGUAGE_RULES.put("arkts", "harmony");
    }

    private static void rule(String platform, String... keywords) {
        PLATFORM_RULES.put(platform, List.of(keywords).stream().map(PlatformResolver::wordPattern).toList());
    }

    private static Pattern wordPattern(String keyword) {
        return Pattern.compile("(?<![a-z0-9])" + Pattern.quote(keyword) + "(?![a-z0-9])");
    }

    public String resolve(String description, String topicsJson, String language) {
        String topics = normalize(topicsJson == null ? null : topicsJson.replaceAll("[\"\\[\\],]", " "));
        String text = normalize(description);
        String languagePlatform = language == null ? null
                : LANGUAGE_RULES.get(language.trim().toLowerCase(Locale.ROOT));

        String best = OTHER;
        int bestScore = 0;
        boolean tied = false;

        for (Map.Entry<String, List<Pattern>> entry : PLATFORM_RULES.entrySet()) {
            int score = matches(topics, entry.getValue()) * 2 + matches(text, entry.getValue()) * 2;
            if (entry.getKey().equals(languagePlatform)) {
                score++;
            }
            if (score > bestScore) {
                bestScore = score;
                best = entry.getKey();
                tied = false;
            } else if (score == bestScore && score > 0) {
                tied = true;
            }
        }

        if (bestScore < 2 || tied) {
            return OTHER;
        }
        return best;
    }

    private int matches(String text, List<Pattern> patterns) {
        if (text.isEmpty()) {
            return 0;
        }
        int count = 0;
        for (Pattern pattern : patterns) {
            if (pattern.matcher(text).find()) {
                count++;
            }
        }
        return count;
    }

    private String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}
