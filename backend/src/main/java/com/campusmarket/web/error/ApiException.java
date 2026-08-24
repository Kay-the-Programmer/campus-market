package com.campusmarket.web.error;

import lombok.Getter;
import org.springframework.http.HttpStatus;

import java.util.Map;

/** Carries the HTTP status and an optional machine-readable code to the client. */
@Getter
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Map<String, Object> extra;

    public ApiException(HttpStatus status, String code, String message, Map<String, Object> extra) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra == null ? Map.of() : extra;
    }

    public static ApiException unauthorized(String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", message, null);
    }

    public static ApiException unauthorized(String code, String message, Map<String, Object> extra) {
        return new ApiException(HttpStatus.UNAUTHORIZED, code, message, extra);
    }

    public static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", message, null);
    }

    public static ApiException forbidden(String code, String message, Map<String, Object> extra) {
        return new ApiException(HttpStatus.FORBIDDEN, code, message, extra);
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", message, null);
    }

    public static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", message, null);
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message, null);
    }

    /** Used for race conditions: already sold, report already resolved, etc. */
    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message, null);
    }

    public static ApiException tooManyRequests(String message, Map<String, Object> extra) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", message, extra);
    }
}
