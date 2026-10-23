package com.githubstars.exception;

public class RepoNotFoundException extends RuntimeException {

    public RepoNotFoundException(String fullName) {
        super("仓库不存在：" + fullName);
    }
}
