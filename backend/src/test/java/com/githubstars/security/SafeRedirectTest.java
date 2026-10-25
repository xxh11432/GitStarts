package com.githubstars.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SafeRedirectTest {

    @Test
    void keepsInternalPath() {
        assertEquals("/me/favorites?tab=1", SafeRedirect.normalize("/me/favorites?tab=1"));
        assertEquals("/", SafeRedirect.normalize("/"));
    }

    @Test
    void rejectsExternalAndProtocolRelative() {
        assertEquals("/", SafeRedirect.normalize("https://evil.example"));
        assertEquals("/", SafeRedirect.normalize("//evil.example/path"));
        assertEquals("/", SafeRedirect.normalize("/\\evil.example"));
        assertEquals("/", SafeRedirect.normalize("javascript:alert(1)"));
    }

    @Test
    void rejectsControlCharsAndOversizedInput() {
        assertEquals("/", SafeRedirect.normalize("/ok\r\nLocation: https://evil.example"));
        assertEquals("/", SafeRedirect.normalize("/" + "a".repeat(600)));
        assertEquals("/", SafeRedirect.normalize(null));
        assertEquals("/", SafeRedirect.normalize("   "));
    }
}
