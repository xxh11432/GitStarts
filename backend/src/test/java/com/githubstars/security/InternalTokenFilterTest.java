package com.githubstars.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class InternalTokenFilterTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void failsClosedWhenTokenIsNotConfigured() throws Exception {
        InternalTokenFilter filter = new InternalTokenFilter("", objectMapper);
        MockHttpServletRequest request = request("/internal/quota/reserve");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals(503, response.getStatus());
    }

    @Test
    void rejectsWrongToken() throws Exception {
        InternalTokenFilter filter = new InternalTokenFilter("expected-token", objectMapper);
        MockHttpServletRequest request = request("/internal/quota/reserve");
        request.addHeader(InternalTokenFilter.HEADER, "wrong-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals(401, response.getStatus());
    }

    @Test
    void passesWithMatchingToken() throws Exception {
        InternalTokenFilter filter = new InternalTokenFilter("expected-token", objectMapper);
        MockHttpServletRequest request = request("/internal/quota/reserve");
        request.addHeader(InternalTokenFilter.HEADER, "expected-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertNotNull(chain.getRequest());
    }

    @Test
    void sessionProbeOnlyNeedsSessionCookie() throws Exception {
        InternalTokenFilter filter = new InternalTokenFilter("expected-token", objectMapper);
        MockHttpServletRequest request = request("/internal/auth/session");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertNotNull(chain.getRequest());
    }

    private MockHttpServletRequest request(String servletPath) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api" + servletPath);
        request.setContextPath("/api");
        request.setServletPath(servletPath);
        return request;
    }
}
