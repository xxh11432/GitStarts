package com.githubstars.service;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 根据仓库 topics / description / language 通过关键字规则推导分类。
 */
@Component
public class Categorizer {

    private static final Map<String, List<String>> CATEGORY_RULES = new LinkedHashMap<>();

    static {
        CATEGORY_RULES.put("人工智能", List.of("machine-learning", "deep-learning", "neural-network", "llm", "gpt",
                "nlp", "natural-language", "computer-vision", "pytorch", "tensorflow", "openai", "ai"));
        CATEGORY_RULES.put("前端", List.of("react", "vue", "angular", "svelte", "frontend", "tailwind", "css", "nextjs"));
        CATEGORY_RULES.put("后端", List.of("backend", "rest", "microservice", "server", "graphql", "spring"));
        CATEGORY_RULES.put("数据科学", List.of("data-science", "data-analysis", "analytics", "visualization", "pandas", "spark"));
        CATEGORY_RULES.put("数据库", List.of("database", "sql", "nosql", "mysql", "postgres", "redis", "mongodb", "sqlite"));
        CATEGORY_RULES.put("DevOps", List.of("docker", "kubernetes", "k8s", "ci-cd", "devops", "ansible", "terraform", "monitoring"));
        CATEGORY_RULES.put("安全", List.of("security", "pentest", "authentication", "crypto", "vulnerability", "hacking"));
        CATEGORY_RULES.put("移动开发", List.of("android", "ios", "mobile", "flutter", "react-native", "swift"));
        CATEGORY_RULES.put("游戏", List.of("game", "gamedev", "game-engine", "unity", "unreal"));
        CATEGORY_RULES.put("开发工具", List.of("cli", "developer-tools", "devtools", "editor", "ide", "tool"));
    }

    private static final String DEFAULT_CATEGORY = "其他";

    public String categorize(String description, String topicsJson, String language) {
        StringBuilder haystack = new StringBuilder();
        if (description != null) {
            haystack.append(description).append(' ');
        }
        if (language != null) {
            haystack.append(language).append(' ');
        }
        if (topicsJson != null) {
            haystack.append(topicsJson.replaceAll("[\"\\[\\],]", " "));
        }
        String lower = haystack.toString().toLowerCase(Locale.ROOT);

        for (Map.Entry<String, List<String>> entry : CATEGORY_RULES.entrySet()) {
            for (String keyword : entry.getValue()) {
                if (lower.contains(keyword)) {
                    return entry.getKey();
                }
            }
        }
        return DEFAULT_CATEGORY;
    }

    public String slugify(String value) {
        if (value == null) {
            return null;
        }
        String slug = value.trim().toLowerCase(Locale.ROOT);
        slug = slug.replaceAll("[^a-z0-9\\u4e00-\\u9fa5]+", "-");
        slug = slug.replaceAll("(^-|-$)", "");
        return slug.isBlank() ? value : slug;
    }
}
