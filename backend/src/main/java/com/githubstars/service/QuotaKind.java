package com.githubstars.service;

import java.util.Arrays;

public enum QuotaKind {

    CHAT("chat"),
    COMPARE("compare");

    private final String value;

    QuotaKind(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static QuotaKind from(String value) {
        return Arrays.stream(values())
                .filter(kind -> kind.value.equals(value))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("未知配额类型：" + value));
    }
}
