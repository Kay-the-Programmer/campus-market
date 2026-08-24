package com.campusmarket.security;

import com.campusmarket.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Per-IP request throttling, in front of everything else.
 *
 * <p>{@link com.campusmarket.service.AuthService} already locks an individual
 * account after {@code max-failed-logins} bad attempts, but that is scoped to
 * one account: it does nothing about signup floods, address enumeration across
 * many accounts, or reset-email spam. This is the other half - a ceiling on how
 * often one source can reach the sensitive endpoints at all.
 *
 * <p>Ordered ahead of {@link SessionAuthFilter} because rejecting here costs a
 * map lookup, whereas letting the request through costs a session query and a
 * listings query first. There is no point authenticating a caller that is about
 * to be turned away.
 *
 * <p>State is per-instance and in memory. That is the right trade for a single
 * container - no Redis to run, no network hop per request - and the thing to
 * revisit if the API is ever scaled to more than one replica, since each would
 * then enforce its own share of the limit.
 */
@Component
@Order(0)
@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {

    /**
     * Endpoints where abuse is cheap and consequences are real: each of these
     * either sends mail, creates an account, or grants a session.
     */
    private static final String AUTH_PREFIX = "/api/auth/";

    /** Beyond which the sweep runs, to keep a flood from growing the map without bound. */
    private static final int SWEEP_THRESHOLD = 10_000;

    private final AppProperties properties;
    private final ObjectMapper objectMapper;

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        if (!properties.isRateLimitEnabled()) {
            chain.doFilter(request, response);
            return;
        }

        String path = request.getRequestURI();
        boolean auth = path.startsWith(AUTH_PREFIX);

        // Reads are left alone. They are the overwhelming majority of traffic,
        // they cost little, and throttling them is how a legitimate person
        // scrolling a busy feed gets told to slow down.
        if (!auth && "GET".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        int limit = auth ? properties.getRateLimitAuthPerMinute() : properties.getRateLimitWritePerMinute();
        String key = (auth ? "a:" : "w:") + clientIp(request);

        if (!tryConsume(key, limit)) {
            writeThrottledResponse(response);
            return;
        }

        chain.doFilter(request, response);
    }

    /**
     * Fixed one-minute window rather than a rolling one: a rolling window needs
     * a timestamp list per key, and the burst a fixed window permits at a
     * boundary - up to twice the limit across two adjacent windows - does not
     * matter at these thresholds.
     */
    private boolean tryConsume(String key, int limit) {
        if (windows.size() > SWEEP_THRESHOLD) {
            sweep();
        }

        Instant now = Instant.now();
        Window window = windows.compute(key, (k, existing) ->
                existing == null || existing.isExpired(now) ? new Window(now) : existing);

        return window.count.incrementAndGet() <= limit;
    }

    /** Drops windows that have rolled over. Cheap, and only on a map that has grown. */
    private void sweep() {
        Instant now = Instant.now();
        windows.entrySet().removeIf(entry -> entry.getValue().isExpired(now));
    }

    /**
     * The proxy's word for who the caller is.
     *
     * <p>Trusting a client-settable header would normally be a way to bypass the
     * limiter by forging a new IP per request. It is safe here because the
     * production compose file publishes no port for the API: the only route to
     * it is through Caddy, which overwrites {@code X-Real-IP} with the actual
     * peer address. Publishing the API port directly would invalidate that
     * assumption and this method with it.
     */
    private String clientIp(HttpServletRequest request) {
        String real = request.getHeader("X-Real-IP");
        if (real != null && !real.isBlank()) {
            return real.trim();
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return (comma > 0 ? forwarded.substring(0, comma) : forwarded).trim();
        }
        return request.getRemoteAddr();
    }

    private void writeThrottledResponse(HttpServletResponse response) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "Too many requests. Wait a minute and try again.");
        body.put("code", "RATE_LIMITED");

        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setHeader("Retry-After", "60");
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }

    private static final class Window {
        private static final Duration LENGTH = Duration.ofMinutes(1);

        private final Instant startedAt;
        private final AtomicInteger count = new AtomicInteger();

        private Window(Instant startedAt) {
            this.startedAt = startedAt;
        }

        private boolean isExpired(Instant now) {
            return startedAt.plus(LENGTH).isBefore(now);
        }
    }
}
