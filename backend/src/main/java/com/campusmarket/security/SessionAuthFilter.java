package com.campusmarket.security;

import com.campusmarket.domain.ListingStatus;
import com.campusmarket.domain.User;
import com.campusmarket.domain.UserStatus;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.repository.UserSessionRepository;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Resolves the caller from an opaque bearer token on every request.
 *
 * <p>Deliberately does not reject anonymous requests - guests are legitimate on
 * public endpoints. Authorization is decided per endpoint by {@link AccessGuard}.
 *
 * <p>The user row and derived seller state are re-read on every request, so a ban
 * or a listing status change takes effect on the caller's next call with no
 * cached permission state (RBAC rules 3 and 7).
 */
@Component
@Order(1)
@RequiredArgsConstructor
public class SessionAuthFilter extends OncePerRequestFilter {

    public static final String PRINCIPAL_ATTRIBUTE = "campusmarket.principal";

    private static final Set<String> MUTATING_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
    private static final List<ListingStatus> SELLER_STATUSES =
            List.of(ListingStatus.ACTIVE, ListingStatus.RESERVED);

    private final UserSessionRepository sessionRepository;
    private final ListingRepository listingRepository;
    private final ObjectMapper objectMapper;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {

        Principal principal = resolvePrincipal(request);
        request.setAttribute(PRINCIPAL_ATTRIBUTE, principal);

        // A suspension that has not yet lapsed blocks every write, immediately.
        if (principal.isAuthenticated()
                && principal.user().isCurrentlyRestricted()
                && MUTATING_METHODS.contains(request.getMethod())
                && !request.getRequestURI().startsWith("/api/auth/")) {
            writeRestrictedResponse(response, principal.user());
            return;
        }

        chain.doFilter(request, response);
    }

    private Principal resolvePrincipal(HttpServletRequest request) {
        String token = bearerToken(request);
        if (token == null) {
            return Principal.GUEST;
        }

        Optional<com.campusmarket.domain.UserSession> found = sessionRepository.findByTokenWithUser(token);
        if (found.isEmpty() || !found.get().isUsable()) {
            return Principal.GUEST;
        }

        User user = found.get().getUser();

        // A banned account's session is dead - treat the caller as a guest so the
        // client renders a logged-out UI rather than a half-working session.
        if (user.getStatus() == UserStatus.BANNED) {
            return Principal.GUEST;
        }

        boolean hasActiveListings = user.getRole() == com.campusmarket.domain.Role.CUSTOMER
                && listingRepository.existsBySellerIdAndDeletedFalseAndStatusIn(user.getId(), SELLER_STATUSES);

        return new Principal(user, hasActiveListings);
    }

    private String bearerToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return null;
        }
        String token = header.substring(7).trim();
        return token.isEmpty() || "guest".equalsIgnoreCase(token) ? null : token;
    }

    private void writeRestrictedResponse(HttpServletResponse response, User user) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", user.getStatus() == UserStatus.BANNED
                ? "Your account has been banned and can no longer perform this action."
                : "Your account is suspended and cannot perform this action.");
        body.put("code", "ACCOUNT_RESTRICTED");
        body.put("status", user.getStatus().name());
        if (user.getSuspendedUntil() != null) {
            body.put("suspendedUntil", user.getSuspendedUntil().toString());
        }
        if (user.getStatusReason() != null) {
            body.put("reason", user.getStatusReason());
        }

        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }
}
