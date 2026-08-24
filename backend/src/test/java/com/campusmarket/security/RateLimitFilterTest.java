package com.campusmarket.security;

import com.campusmarket.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.ServletException;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The limiter is the only thing standing between a script and the endpoints
 * that send mail, create accounts and mint sessions, so what matters is that it
 * counts per source, lets ordinary traffic alone, and can be switched off.
 */
class RateLimitFilterTest {

    private AppProperties properties;
    private RateLimitFilter filter;

    @BeforeEach
    void setUp() {
        properties = new AppProperties();
        properties.setRateLimitEnabled(true);
        properties.setRateLimitAuthPerMinute(3);
        properties.setRateLimitWritePerMinute(5);
        filter = new RateLimitFilter(properties, new ObjectMapper());
    }

    /** A fresh chain per call: MockFilterChain refuses to be invoked twice. */
    private MockHttpServletResponse call(String method, String uri, String ip)
            throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.addHeader("X-Real-IP", ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }

    @Test
    @DisplayName("lets auth requests through up to the limit, then answers 429")
    void throttlesAuthEndpoints() throws Exception {
        for (int i = 0; i < 3; i++) {
            assertThat(call("POST", "/api/auth/login", "1.2.3.4").getStatus())
                    .as("request %d should be allowed", i + 1)
                    .isEqualTo(200);
        }

        MockHttpServletResponse blocked = call("POST", "/api/auth/login", "1.2.3.4");
        assertThat(blocked.getStatus()).isEqualTo(429);
        assertThat(blocked.getHeader("Retry-After")).isEqualTo("60");
        // Same shape GlobalExceptionHandler uses, so the frontend reads it the
        // same way it reads every other failure.
        assertThat(blocked.getContentAsString()).contains("RATE_LIMITED");
    }

    @Test
    @DisplayName("budgets are per source, so one abuser cannot lock everyone out")
    void countsPerIp() throws Exception {
        for (int i = 0; i < 4; i++) {
            call("POST", "/api/auth/login", "1.2.3.4");
        }

        assertThat(call("POST", "/api/auth/login", "5.6.7.8").getStatus())
                .as("a different address starts with a full budget")
                .isEqualTo(200);
    }

    @Test
    @DisplayName("reads are never throttled")
    void ignoresReads() throws Exception {
        for (int i = 0; i < 50; i++) {
            assertThat(call("GET", "/api/listings", "1.2.3.4").getStatus()).isEqualTo(200);
        }
    }

    @Test
    @DisplayName("auth and other writes draw on separate budgets")
    void separatesAuthFromOtherWrites() throws Exception {
        for (int i = 0; i < 4; i++) {
            call("POST", "/api/auth/login", "1.2.3.4");
        }

        assertThat(call("POST", "/api/listings", "1.2.3.4").getStatus())
                .as("exhausting the auth budget must not block ordinary writes")
                .isEqualTo(200);
    }

    @Test
    @DisplayName("does nothing at all when disabled")
    void respectsTheOffSwitch() throws Exception {
        properties.setRateLimitEnabled(false);

        for (int i = 0; i < 20; i++) {
            assertThat(call("POST", "/api/auth/login", "1.2.3.4").getStatus()).isEqualTo(200);
        }
    }

    @Test
    @DisplayName("falls back to the peer address when no proxy header is present")
    void fallsBackToRemoteAddr() throws Exception {
        for (int i = 0; i < 3; i++) {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
            request.setRemoteAddr("9.9.9.9");
            filter.doFilter(request, new MockHttpServletResponse(), new MockFilterChain());
        }

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.setRemoteAddr("9.9.9.9");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(429);
    }
}
