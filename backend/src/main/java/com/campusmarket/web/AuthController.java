package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.AuthService;
import com.campusmarket.web.dto.UserDtos.SessionDto;
import com.campusmarket.web.request.AuthRequests.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * The single source of truth the frontend renders navigation from - role and
     * hasActiveListings are always computed server-side (RBAC rule 3).
     */
    @GetMapping("/me")
    public Map<String, Object> me(@AuthPrincipal Principal principal) {
        SessionDto session = authService.currentSession(principal);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("user", session);
        body.put("isAuthenticated", principal.isAuthenticated());
        return body;
    }

    @PostMapping("/signup")
    public ResponseEntity<Map<String, Object>> signup(@Valid @RequestBody SignupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.signup(request));
    }

    /**
     * Upgrades a buying-only account so it can list. Deliberately an in-place
     * switch rather than a second registration - splitting someone's reviews and
     * history across two accounts to sell a textbook would be absurd.
     */
    @PostMapping("/become-seller")
    public Map<String, Object> becomeSeller(@AuthPrincipal Principal principal,
                                            @RequestBody(required = false) BecomeSellerRequest request) {
        return authService.becomeSeller(principal, request);
    }

    @PostMapping("/verify-email")
    public Map<String, Object> verifyEmail(@Valid @RequestBody TokenRequest request) {
        return authService.verifyEmail(request.token());
    }

    @PostMapping("/resend-verification")
    public Map<String, Object> resendVerification(@Valid @RequestBody EmailOnlyRequest request) {
        return authService.resendVerification(request.email());
    }

    @PostMapping("/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    /** "Continue with Google" - finds or creates the account and signs them in. */
    @PostMapping("/google")
    public Map<String, Object> google(@Valid @RequestBody GoogleSignInRequest request) {
        return authService.googleSignIn(request);
    }

    @PostMapping("/forgot-password")
    public Map<String, Object> forgotPassword(@Valid @RequestBody EmailOnlyRequest request) {
        return authService.forgotPassword(request.email());
    }

    @PostMapping("/reset-password")
    public Map<String, Object> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        return authService.resetPassword(request);
    }

    /** Signed-in password change - distinct from the emailed reset flow. */
    public record ChangePasswordRequest(
            String currentPassword,
            String newPassword,
            String confirmPassword) {}

    @PostMapping("/change-password")
    public Map<String, Object> changePassword(@AuthPrincipal Principal principal,
                                              @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String header,
                                              @RequestBody ChangePasswordRequest request) {
        ChangePasswordRequest body =
                request == null ? new ChangePasswordRequest(null, null, null) : request;
        // The caller's own token, so the tab doing the change is the one session
        // left alive when the others are revoked.
        return authService.changePassword(principal, bearerToken(header),
                body.currentPassword(), body.newPassword(), body.confirmPassword());
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String header) {
        return authService.logout(bearerToken(header));
    }

    private static String bearerToken(String header) {
        if (header != null && header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return header.substring(7).trim();
        }
        return null;
    }
}
