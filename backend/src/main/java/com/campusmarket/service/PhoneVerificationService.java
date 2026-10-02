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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Phone verification, inbound.
 *
 * <p>A number on a profile is a promise that someone can be reached at it, and
 * an unverified one is worse than a blank field: a buyer waiting at the library
 * for a seller whose number was mistyped has been failed by the platform, not
 * by the seller.
 *
 * <h2>Why the student sends the message, not us</h2>
 *
 * <p>The ordinary design is to text a secret code to the number and ask for it
 * back. That needs an SMS provider, and every provider bills per message. This
 * does it the other way round: the app shows a code, the student texts it to a
 * number we own, and a handset acting as a gateway posts what it received to
 * {@link #receiveInbound}. Nothing is sent by us, so nothing is billed to us.
 *
 * <h2>What actually proves the number, and what follows from it</h2>
 *
 * <p>The proof is the sender's caller ID, not the secrecy of the code. The code
 * is shown on screen and travels in cleartext; its only job is to say which
 * pending verification an incoming message belongs to. An attacker cannot send
 * from a number they do not hold, which is the whole guarantee.
 *
 * <p>That inverts one thing completely, and it is worth being blunt about it:
 * <b>there is no "type the code in" path, and there must not be.</b> The
 * student already knows the code - it is on their screen - so accepting it back
 * through the API would verify any number for anyone who asked, which is no
 * verification at all. The only thing that counts here is a message arriving
 * from the number itself. If an outbound provider is ever added, a typed code
 * becomes meaningful again and can come back with it.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PhoneVerificationService {

    /** Long enough to be safe with the attempt cap, short enough to type. */
    private static final int CODE_DIGITS = 6;
    private static final Duration CODE_TTL = Duration.ofMinutes(10);
    /** Non-matching messages from the number before the code is thrown away. */
    private static final int MAX_ATTEMPTS = 5;
    /** Gap between issuing codes, so the endpoint cannot be used to churn them. */
    private static final Duration RESEND_INTERVAL = Duration.ofSeconds(60);

    /** What the student is asked to send. The word is for the human reading
     *  their own sent box later; the digits are what we match on. */
    private static final String MESSAGE_PREFIX = "CampusMarket";
    private static final Pattern CODE_IN_BODY = Pattern.compile("(\\d{" + CODE_DIGITS + "})");

    private final UserRepository userRepository;
    private final AccessGuard accessGuard;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom random = new SecureRandom();

    /** The number students text. Blank disables verification rather than
     *  offering a flow that cannot complete. */
    @Value("${campusmarket.sms.gateway-number:}")
    private String gatewayNumber;

    /**
     * Shared secret the gateway presents on every inbound post.
     *
     * <p>This endpoint cannot be behind a session - a handset has no login - so
     * the secret is the only thing standing between it and anyone who can reach
     * the API. Blank fails every call closed: an open version of this verifies
     * any number on demand.
     */
    @Value("${campusmarket.sms.inbound-secret:}")
    private String inboundSecret;

    /**
     * Stage a number and hand back what has to be texted.
     *
     * @param rawPhone the number to confirm; held as pending until a message
     *                 arrives from it, so a typo cannot wipe a verified number.
     */
    @Transactional
    public Map<String, Object> begin(Principal principal, String rawPhone) {
        accessGuard.requireAuthenticated(principal);
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.notFound("Account not found."));

        if (blank(gatewayNumber)) {
            throw ApiException.badRequest("VERIFICATION_UNAVAILABLE",
                    "Phone verification is not set up on this site yet.");
        }

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

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("phone", phone);
        /* Returned on purpose, which is the opposite of the outbound case: the
           student cannot send a code they have not been shown. */
        body.put("code", code);
        body.put("gatewayNumber", gatewayNumber);
        body.put("messageBody", MESSAGE_PREFIX + " " + code);
        body.put("expiresInSeconds", CODE_TTL.getSeconds());
        return body;
    }

    /** Where the verification stands, for a client waiting on a text to land. */
    @Transactional(readOnly = true)
    public Map<String, Object> status(Principal principal) {
        accessGuard.requireAuthenticated(principal);
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.notFound("Account not found."));

        Instant expiresAt = user.getPhoneOtpExpiresAt();
        boolean waiting = user.getPhonePending() != null
                && expiresAt != null
                && expiresAt.isAfter(Instant.now());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("phone", user.getPhone());
        body.put("phoneVerified", user.isPhoneVerified());
        body.put("waiting", waiting);
        body.put("expiresInSeconds",
                waiting ? Math.max(0, Duration.between(Instant.now(), expiresAt).getSeconds()) : 0);
        return body;
    }

    /**
     * A message the gateway received. Matches it to a pending verification and,
     * if the code is right, promotes the pending number to the real one.
     *
     * <p>Answers quietly whatever happens - the caller is a handset, not a
     * person, and telling it which numbers are mid-verification would turn this
     * into a way to probe for them.
     *
     * @return true when a number was verified, for the log line only.
     */
    @Transactional
    public boolean receiveInbound(String presentedSecret, String from, String body) {
        if (blank(inboundSecret) || !secretMatches(presentedSecret)) {
            // Includes the unconfigured case: an inbound endpoint with no
            // secret set must reject everything, not accept everything.
            throw ApiException.unauthorized("Not authorised.");
        }

        String phone = normalise(from);
        if (phone == null) {
            return false;
        }

        /*
         * Everyone mid-verification, matched in memory rather than by an exact
         * query on the stored string.
         *
         * A query would be the obvious thing and would quietly never match. The
         * student types "0971234567" and the network reports the sender as
         * "+260971234567" - the same phone, two different strings, no row
         * found, and a verification that simply never completes with nothing
         * in the log to say why. sameNumber() is what reconciles the two forms.
         *
         * The scan is bounded by the ten-minute window: this is only the people
         * who have asked to verify and not yet finished, which at campus scale
         * is a handful. If that ever stops being true, the fix is a stored
         * national-format key to query on, not an index on this column.
         */
        List<User> waiting = userRepository.findByPhonePendingIsNotNull().stream()
                .filter(candidate -> sameNumber(candidate.getPhonePending(), phone))
                .toList();
        if (waiting.isEmpty()) {
            return false;
        }

        String code = extractCode(body);
        Instant now = Instant.now();

        for (User user : waiting) {
            if (user.getPhoneOtpHash() == null
                    || user.getPhoneOtpExpiresAt() == null
                    || user.getPhoneOtpExpiresAt().isBefore(now)) {
                clearOtp(user);
                userRepository.save(user);
                continue;
            }
            if (user.getPhoneOtpAttempts() >= MAX_ATTEMPTS) {
                clearOtp(user);
                userRepository.save(user);
                continue;
            }
            if (code != null && passwordEncoder.matches(code, user.getPhoneOtpHash())) {
                user.setPhone(user.getPhonePending());
                user.setPhoneVerified(true);
                clearOtp(user);
                userRepository.save(user);
                log.info("Phone verified by inbound message from {}", phone);
                return true;
            }
            /* A message from the right number carrying the wrong code. Counted,
               so a stream of junk texts cannot be used to grind at a code. */
            user.setPhoneOtpAttempts(user.getPhoneOtpAttempts() + 1);
            userRepository.save(user);
        }
        return false;
    }

    /** Constant-time, so the secret cannot be recovered a character at a time. */
    private boolean secretMatches(String presented) {
        if (presented == null) {
            return false;
        }
        return MessageDigest.isEqual(
                presented.getBytes(StandardCharsets.UTF_8),
                inboundSecret.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * The code out of a received message.
     *
     * <p>Lenient about everything except the digits: handsets and gateways add
     * their own wrapping, people retype the message by hand, and some keyboards
     * capitalise or autocorrect the word in front. The digits are the content.
     */
    static String extractCode(String body) {
        if (body == null) {
            return null;
        }
        Matcher matcher = CODE_IN_BODY.matcher(body);
        return matcher.find() ? matcher.group(1) : null;
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

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    /**
     * Keeps digits and a leading +, so "+260 97 123 4567" and "097-123-4567"
     * both survive. Deliberately not validated against a country's format:
     * students arrive with numbers from everywhere, and rejecting an unusual
     * but real number is a worse failure than storing an odd-looking one.
     *
     * <p>Both sides of the match go through this, which is what lets a number
     * stored as "+260971234567" be matched by a gateway that reports the sender
     * as "0971234567" - see {@link #sameNumber}.
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

    /**
     * Do two numbers refer to the same line?
     *
     * <p>Compares the last nine digits. A student types "0971234567" and the
     * network reports the sender as "+260971234567": the same phone, and a
     * string comparison says no. Nine digits is a national number without its
     * trunk zero, which is the part both forms always share.
     */
    static boolean sameNumber(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        String left = a.replaceAll("\\D", "");
        String right = b.replaceAll("\\D", "");
        if (left.length() < 9 || right.length() < 9) {
            return left.equals(right);
        }
        return left.substring(left.length() - 9).equals(right.substring(right.length() - 9));
    }
}
