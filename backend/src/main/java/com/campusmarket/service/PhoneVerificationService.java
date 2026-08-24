package com.campusmarket.service;

import com.campusmarket.domain.User;
import com.campusmarket.repository.UserRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Phone verification by one-time code.
 *
 * <p>A number on a profile is a promise that someone can be reached at it, and
 * an unverified one is worse than a blank field: a buyer waiting at the library
 * for a seller whose number was mistyped has been failed by the platform, not
 * by the seller.
 *
 * <p>There is no SMS provider wired up. Rather than pretend, the code is logged
 * and - outside production - returned in the response so the flow is complete
 * and testable end to end. Swapping in a real gateway means changing
 * {@link #dispatch} and nothing else.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PhoneVerificationService {

    /** Long enough to be safe with the attempt cap, short enough to type. */
    private static final int CODE_DIGITS = 6;
    private static final Duration CODE_TTL = Duration.ofMinutes(10);
    /** Wrong guesses before the code is thrown away and must be re-sent. */
    private static final int MAX_ATTEMPTS = 5;
    /** Gap between sends, so the endpoint cannot be used to spam a number. */
    private static final Duration RESEND_INTERVAL = Duration.ofSeconds(60);

    private final UserRepository userRepository;
    private final AccessGuard accessGuard;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom random = new SecureRandom();

    /** Echoing the code back is a development affordance and must stay off in
     *  production, where it would hand anyone a code for any number. */
    @Value("${campusmarket.expose-dev-tokens:true}")
    private boolean exposeDevCodes;

    /**
     * Issue a code for a number.
     *
     * @param rawPhone the number to confirm; stored as pending until the code
     *                 comes back, so a typo cannot wipe a verified number.
     */
    @Transactional
    public Map<String, Object> sendCode(Principal principal, String rawPhone) {
        accessGuard.requireAuthenticated(principal);
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.notFound("Account not found."));

        String phone = normalise(rawPhone);
        if (phone == null) {
            throw ApiException.badRequest("PHONE_REQUIRED",
                    "Enter a phone number, including the country or network code.");
        }
        if (phone.equals(user.getPhone()) && user.isPhoneVerified()) {
            throw ApiException.badRequest("ALREADY_VERIFIED",
                    "That number is already verified on this account.");
        }

        Instant lastSent = user.getPhoneOtpSentAt();
        if (lastSent != null && lastSent.plus(RESEND_INTERVAL).isAfter(Instant.now())) {
            long wait = Duration.between(Instant.now(), lastSent.plus(RESEND_INTERVAL)).getSeconds();
            throw ApiException.badRequest("RESEND_TOO_SOON",
                    "Hold on " + Math.max(wait, 1) + " more second(s) before asking for another code.");
        }

        String code = generateCode();
        user.setPhonePending(phone);
        user.setPhoneOtpHash(passwordEncoder.encode(code));
        user.setPhoneOtpExpiresAt(Instant.now().plus(CODE_TTL));
        user.setPhoneOtpAttempts(0);
        user.setPhoneOtpSentAt(Instant.now());
        userRepository.save(user);

        dispatch(phone, code);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("phone", phone);
        body.put("expiresInSeconds", CODE_TTL.getSeconds());
        body.put("message", "We sent a " + CODE_DIGITS + "-digit code to " + phone + ".");
        if (exposeDevCodes) {
            body.put("devCode", code);
        }
        return body;
    }

    /**
     * Check a code and, if it matches, promote the pending number to the real
     * one. Wrong guesses are counted; the code dies after {@value #MAX_ATTEMPTS}.
     */
    @Transactional
    public Map<String, Object> verifyCode(Principal principal, String code) {
        accessGuard.requireAuthenticated(principal);
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.notFound("Account not found."));

        if (user.getPhoneOtpHash() == null || user.getPhonePending() == null) {
            throw ApiException.badRequest("NO_CODE_PENDING",
                    "Ask for a code first.");
        }
        if (user.getPhoneOtpExpiresAt() == null || user.getPhoneOtpExpiresAt().isBefore(Instant.now())) {
            clearOtp(user);
            userRepository.save(user);
            throw ApiException.badRequest("CODE_EXPIRED",
                    "That code has expired. Ask for a new one.");
        }
        if (user.getPhoneOtpAttempts() >= MAX_ATTEMPTS) {
            clearOtp(user);
            userRepository.save(user);
            throw ApiException.badRequest("TOO_MANY_ATTEMPTS",
                    "Too many wrong codes. Ask for a new one.");
        }

        String supplied = code == null ? "" : code.trim();
        if (!passwordEncoder.matches(supplied, user.getPhoneOtpHash())) {
            user.setPhoneOtpAttempts(user.getPhoneOtpAttempts() + 1);
            userRepository.save(user);
            int left = MAX_ATTEMPTS - user.getPhoneOtpAttempts();
            throw ApiException.badRequest("INVALID_CODE",
                    left > 0
                            ? "That code is not right. " + left + " attempt(s) left."
                            : "That code is not right. Ask for a new one.");
        }

        user.setPhone(user.getPhonePending());
        user.setPhoneVerified(true);
        clearOtp(user);
        userRepository.save(user);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("phone", user.getPhone());
        body.put("phoneVerified", true);
        body.put("message", "Your phone number is verified.");
        return body;
    }

    /**
     * Hand-off point for a real SMS gateway.
     *
     * <p>Logged at info rather than swallowed so the code is recoverable in
     * development without reading the database.
     */
    private void dispatch(String phone, String code) {
        log.info("Phone verification code for {}: {}", phone, code);
    }

    private void clearOtp(User user) {
        user.setPhonePending(null);
        user.setPhoneOtpHash(null);
        user.setPhoneOtpExpiresAt(null);
        user.setPhoneOtpAttempts(0);
    }

    private String generateCode() {
        StringBuilder sb = new StringBuilder(CODE_DIGITS);
        for (int i = 0; i < CODE_DIGITS; i++) {
            sb.append(random.nextInt(10));
        }
        return sb.toString();
    }

    /**
     * Keeps digits and a leading +, so "+260 97 123 4567" and "097-123-4567"
     * both survive. Deliberately not validated against a country's format:
     * students arrive with numbers from everywhere, and rejecting an unusual
     * but real number is a worse failure than storing an odd-looking one.
     */
    static String normalise(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        boolean international = trimmed.startsWith("+");
        String digits = trimmed.replaceAll("\\D", "");
        if (digits.length() < 7) {
            return null;
        }
        return international ? "+" + digits : digits;
    }
}
