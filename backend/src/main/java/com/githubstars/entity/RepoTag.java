package com.githubstars.entity;

import com.baomidou.mybatisplus.annotation.TableName;

@TableName("repo_tags")
public class RepoTag {

    private Long repoId;
    private Long tagId;

    public RepoTag() {
    }

    public RepoTag(Long repoId, Long tagId) {
        this.repoId = repoId;
        this.tagId = tagId;
    }

    public Long getRepoId() {
        return repoId;
    }

    public void setRepoId(Long repoId) {
        this.repoId = repoId;
    }

    public Long getTagId() {
        return tagId;
    }

    public void setTagId(Long tagId) {
        this.tagId = tagId;
    }
}
