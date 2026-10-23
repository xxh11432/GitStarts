package com.githubstars.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.githubstars.entity.RepoTag;
import com.githubstars.entity.Repository;
import com.githubstars.entity.Tag;
import com.githubstars.mapper.RepoTagMapper;
import com.githubstars.mapper.TagMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class TagService {

    private final TagMapper tagMapper;
    private final RepoTagMapper repoTagMapper;
    private final Categorizer categorizer;
    private final ObjectMapper objectMapper;

    public TagService(TagMapper tagMapper, RepoTagMapper repoTagMapper, Categorizer categorizer, ObjectMapper objectMapper) {
        this.tagMapper = tagMapper;
        this.repoTagMapper = repoTagMapper;
        this.categorizer = categorizer;
        this.objectMapper = objectMapper;
    }

    public void syncTags(Repository repo) {
        if (repo.getLanguage() != null && !repo.getLanguage().isBlank()) {
            linkTag(repo, repo.getLanguage(), "language");
        }
        if (repo.getCategory() != null && !repo.getCategory().isBlank()) {
            linkTag(repo, repo.getCategory(), "category");
        }
        for (String topic : parseTopics(repo.getTopics())) {
            linkTag(repo, topic, "topic");
        }
    }

    private List<String> parseTopics(String topicsJson) {
        if (topicsJson == null || topicsJson.isBlank()) {
            return List.of();
        }
        try {
            JsonNode node = objectMapper.readTree(topicsJson);
            List<String> result = new ArrayList<>();
            if (node.isArray()) {
                for (JsonNode topic : node) {
                    result.add(topic.asText());
                }
            }
            return result;
        } catch (Exception e) {
            return List.of();
        }
    }

    private void linkTag(Repository repo, String name, String type) {
        String slug = categorizer.slugify(name);
        Tag tag = tagMapper.selectOne(new LambdaQueryWrapper<Tag>().eq(Tag::getSlug, slug));
        if (tag == null) {
            tag = new Tag();
            tag.setName(name);
            tag.setSlug(slug);
            tag.setType(type);
            tagMapper.insert(tag);
        }
        Long count = repoTagMapper.selectCount(new LambdaQueryWrapper<RepoTag>()
                .eq(RepoTag::getRepoId, repo.getId())
                .eq(RepoTag::getTagId, tag.getId()));
        if (count == null || count == 0) {
            repoTagMapper.insert(new RepoTag(repo.getId(), tag.getId()));
        }
    }
}
