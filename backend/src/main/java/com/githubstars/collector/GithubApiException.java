package com.githubstars.collector;

public class GithubApiException extends RuntimeException {

    public GithubApiException(String message) {
        super(message);
    }

    public GithubApiException(String message, Throwable cause) {
        super(message, cause);
    }
}
