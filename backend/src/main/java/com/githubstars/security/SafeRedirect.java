package com.githubstars.security;

/**
 * 登录回跳地址校验，只允许站内相对路径，避免开放重定向。
 */
public final class SafeRedirect {

    private SafeRedirect() {
    }

    public static String normalize(String next) {
        if (next == null) {
            return "/";
        }
        String value = next.trim();
        if (value.isEmpty() || value.length() > 512) {
            return "/";
        }
        if (!value.startsWith("/") || value.startsWith("//") || value.contains("\\")
                || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
            return "/";
        }
        return value;
    }
}
