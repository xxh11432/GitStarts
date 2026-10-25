package com.githubstars.exception;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void genericErrorDoesNotLeakInternalMessage() {
        var response = handler.handleGeneric(
                new IllegalStateException("SQLSyntaxErrorException: table ai_metrics not found"));

        assertEquals(500, response.getStatusCode().value());
        Map<String, Object> body = response.getBody();
        String message = String.valueOf(body.get("message"));
        assertFalse(message.contains("SQL"));
        assertFalse(message.contains("ai_metrics"));
        assertTrue(message.contains("服务内部错误"));
    }

    @Test
    void badRequestStillReturnsValidationMessage() {
        var response = handler.handleBadRequest(new IllegalArgumentException("userId 必填"));

        assertEquals(400, response.getStatusCode().value());
        assertEquals("userId 必填", response.getBody().get("message"));
    }
}
