package com.githubstars.exception;

public class IdeaNotFoundException extends RuntimeException {

    public IdeaNotFoundException(Long id) {
        super("想法不存在：" + id);
    }
}
