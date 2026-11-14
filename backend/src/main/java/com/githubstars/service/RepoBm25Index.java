package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.githubstars.entity.Repository;
import com.githubstars.mapper.RepositoryMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;

/**
 * 关键词 BM25 召回：对仓库 name / description / topics 建轻量索引，
 * 替代原先按整串短语 LIKE 的匹配方式。
 */
@Component
public class RepoBm25Index {

    private static final Logger log = LoggerFactory.getLogger(RepoBm25Index.class);

    private static final double K1 = 1.2;
    private static final double B = 0.75;
    private static final int NAME_WEIGHT = 3;
    private static final int TOPIC_WEIGHT = 2;
    private static final long TTL_MILLIS = Duration.ofMinutes(5).toMillis();
    private static final Set<String> STOP_WORDS = Set.of(
            "the", "a", "an", "and", "or", "of", "for", "with", "to", "in", "on", "by",
            "is", "are", "be", "can", "that", "this", "from", "your", "you", "not", "all",
            "tool", "tools", "platform", "software", "application", "app", "system",
            "的", "了", "和", "与", "及", "或", "是", "在", "有", "我", "你", "他", "它",
            "支持", "一个", "一款", "一套", "可以", "需要", "最好", "能够", "以及"
    );

    private final RepositoryMapper repositoryMapper;
    private volatile Snapshot snapshot;

    public RepoBm25Index(RepositoryMapper repositoryMapper) {
        this.repositoryMapper = repositoryMapper;
    }

    /**
     * 返回按 BM25 分数倒序的仓库 id；无命中返回空列表。
     */
    public List<Long> search(String q, String language, String category, String license,
                             String platform, Integer minStars, int limit) {
        if (q == null || q.isBlank()) {
            return List.of();
        }
        Snapshot snap = snapshot();
        if (snap.docs().isEmpty()) {
            return List.of();
        }
        Set<String> terms = new LinkedHashSet<>(tokenize(q));
        terms.removeIf(STOP_WORDS::contains);
        if (terms.isEmpty()) {
            return List.of();
        }

        String raw = q.trim().toLowerCase(Locale.ROOT);
        int docCount = snap.docs().size();
        int effectiveLimit = Math.min(Math.max(limit, 1), 60);
        Comparator<ScoredRepo> order = Comparator
                .comparingDouble(ScoredRepo::score)
                .thenComparingInt(scored -> scored.doc().stars());
        PriorityQueue<ScoredRepo> heap = new PriorityQueue<>(order);

        for (Doc doc : snap.docs()) {
            if (!matches(doc, language, category, license, platform, minStars)) {
                continue;
            }
            double score = 0.0;
            for (String term : terms) {
                Integer tf = doc.tf().get(term);
                if (tf == null) {
                    continue;
                }
                int df = snap.df().getOrDefault(term, 0);
                double idf = Math.log(1.0 + (docCount - df + 0.5) / (df + 0.5));
                double denominator = tf + K1 * (1 - B + B * doc.length() / snap.avgLength());
                score += idf * (tf * (K1 + 1)) / denominator;
            }
            if (score <= 0.0) {
                continue;
            }
            score += exactBoost(doc, raw);
            heap.offer(new ScoredRepo(doc, score));
            if (heap.size() > effectiveLimit) {
                heap.poll();
            }
        }

        List<ScoredRepo> ranked = new ArrayList<>(heap);
        ranked.sort(order.reversed());
        return ranked.stream().map(scored -> scored.doc().id()).toList();
    }

    private Snapshot snapshot() {
        Snapshot current = snapshot;
        long now = System.currentTimeMillis();
        if (current != null && now - current.builtAt() < TTL_MILLIS) {
            return current;
        }
        synchronized (this) {
            current = snapshot;
            if (current != null && now - current.builtAt() < TTL_MILLIS) {
                return current;
            }
            try {
                Snapshot rebuilt = build();
                snapshot = rebuilt;
                return rebuilt;
            } catch (Exception exc) {
                log.warn("构建 BM25 索引失败：{}", exc.getMessage());
                return current == null ? Snapshot.empty() : current;
            }
        }
    }

    private Snapshot build() {
        List<Repository> repos = repositoryMapper.selectList(
                new LambdaQueryWrapper<Repository>()
                        .select(Repository::getId, Repository::getFullName, Repository::getName,
                                Repository::getDescription, Repository::getTopics, Repository::getLanguage,
                                Repository::getPlatform, Repository::getCategory, Repository::getLicense,
                                Repository::getStars, Repository::getArchived, Repository::getDisabled)
                        .eq(Repository::getArchived, 0)
                        .eq(Repository::getDisabled, 0));

        List<Doc> docs = new ArrayList<>(repos.size());
        Map<String, Integer> df = new HashMap<>();
        long totalLength = 0;
        for (Repository repo : repos) {
            Map<String, Integer> tf = new HashMap<>();
            int length = 0;
            length += addTokens(tf, repo.getName(), NAME_WEIGHT);
            length += addTokens(tf, repo.getTopics(), TOPIC_WEIGHT);
            length += addTokens(tf, repo.getDescription(), 1);
            if (length == 0) {
                continue;
            }
            docs.add(new Doc(
                    repo.getId(),
                    safeLower(repo.getFullName()),
                    safeLower(repo.getName()),
                    repo.getLanguage(),
                    repo.getPlatform(),
                    repo.getCategory(),
                    repo.getLicense(),
                    repo.getStars() == null ? 0 : repo.getStars(),
                    tf,
                    length
            ));
            totalLength += length;
            for (String term : tf.keySet()) {
                df.merge(term, 1, Integer::sum);
            }
        }
        double average = docs.isEmpty() ? 1.0 : Math.max(1.0, (double) totalLength / docs.size());
        log.info("BM25 索引就绪：{} 个仓库，{} 个词项，平均长度 {}", docs.size(), df.size(), average);
        return new Snapshot(List.copyOf(docs), Map.copyOf(df), average, System.currentTimeMillis());
    }

    private static int addTokens(Map<String, Integer> tf, String text, int weight) {
        List<String> tokens = tokenize(text);
        for (String token : tokens) {
            tf.merge(token, weight, Integer::sum);
        }
        return tokens.size() * weight;
    }

    private static boolean matches(Doc doc, String language, String category, String license,
                                   String platform, Integer minStars) {
        if (language != null && !language.isBlank()
                && (doc.language() == null || !doc.language().equalsIgnoreCase(language.trim()))) {
            return false;
        }
        if (category != null && !category.isBlank()
                && (doc.category() == null || !doc.category().equalsIgnoreCase(category.trim()))) {
            return false;
        }
        if (license != null && !license.isBlank()
                && (doc.license() == null || !doc.license().equalsIgnoreCase(license.trim()))) {
            return false;
        }
        if (platform != null && !platform.isBlank()
                && (doc.platform() == null || !doc.platform().equalsIgnoreCase(platform.trim()))) {
            return false;
        }
        return minStars == null || minStars <= 0 || doc.stars() >= minStars;
    }

    private static double exactBoost(Doc doc, String raw) {
        if (raw.isEmpty()) {
            return 0.0;
        }
        if (doc.name().equals(raw) || doc.fullName().equals(raw)
                || doc.fullName().endsWith("/" + raw)) {
            return 6.0;
        }
        if (doc.name().startsWith(raw) || doc.fullName().contains(raw)) {
            return 3.0;
        }
        return 0.0;
    }

    /**
     * 英文按字母数字切词（保留 c++ / c#），中文按 unigram + bigram 切词。
     */
    static List<String> tokenize(String text) {
        List<String> tokens = new ArrayList<>();
        if (text == null || text.isBlank()) {
            return tokens;
        }
        String lower = text.toLowerCase(Locale.ROOT);
        StringBuilder latin = new StringBuilder();
        StringBuilder cjk = new StringBuilder();
        for (int index = 0; index < lower.length(); index++) {
            char ch = lower.charAt(index);
            if (isCjk(ch)) {
                flushLatin(latin, tokens);
                cjk.append(ch);
            } else if (Character.isLetterOrDigit(ch) || ch == '+' || ch == '#') {
                flushCjk(cjk, tokens);
                latin.append(ch);
            } else {
                flushLatin(latin, tokens);
                flushCjk(cjk, tokens);
            }
        }
        flushLatin(latin, tokens);
        flushCjk(cjk, tokens);
        return tokens;
    }

    private static boolean isCjk(char ch) {
        return Character.UnicodeScript.of(ch) == Character.UnicodeScript.HAN;
    }

    private static void flushLatin(StringBuilder latin, List<String> tokens) {
        if (latin.length() == 0) {
            return;
        }
        String token = latin.toString();
        if (!STOP_WORDS.contains(token)) {
            tokens.add(token);
        }
        latin.setLength(0);
    }

    private static void flushCjk(StringBuilder cjk, List<String> tokens) {
        if (cjk.length() == 0) {
            return;
        }
        int length = cjk.length();
        for (int index = 0; index < length; index++) {
            tokens.add(String.valueOf(cjk.charAt(index)));
        }
        for (int index = 0; index + 1 < length; index++) {
            tokens.add(cjk.substring(index, index + 2));
        }
        cjk.setLength(0);
    }

    private static String safeLower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    private record Doc(long id, String fullName, String name, String language, String platform,
                       String category, String license, int stars, Map<String, Integer> tf, int length) {
    }

    private record ScoredRepo(Doc doc, double score) {
    }

    private record Snapshot(List<Doc> docs, Map<String, Integer> df, double avgLength, long builtAt) {
        static Snapshot empty() {
            return new Snapshot(List.of(), Map.of(), 1.0, System.currentTimeMillis());
        }
    }
}
