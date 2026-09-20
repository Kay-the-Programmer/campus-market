package com.campusmarket.service;

import com.campusmarket.config.AppProperties;
import com.campusmarket.domain.*;
import com.campusmarket.repository.*;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.UserDtos.SessionDto;
import com.campusmarket.web.error.ApiException;
import com.campusmarket.web.request.AuthRequests.*;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Workflows 1-5: signup, email verification, login, password reset, logout. */
@Service
@RequiredArgsConstructor
public class AuthService {

    private static final List<ListingStatus> SELLER_STATUSES =
            List.of(ListingStatus.ACTIVE, ListingStatus.RESERVED);

    /** Orders still needing the seller to act - what the nav badge counts. */
    private static final List<OrderStatus> OPEN_ORDER_STATUSES =
            List.of(OrderStatus.PENDING, OrderStatus.ACCEPTED);

    private final UserRepository userRepository;
    private final UserSessionRepository sessionRepository;
    private final AuthTokenRepository authTokenRepository;
    private final ListingRepository listingRepository;
    private final NotificationRepository notificationRepository;
    private final MessageRepository messageRepository;
    private final CartItemRepository cartItemRepository;
    private final OrderRepository orderRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final EmailService emailService;
    private final AppProperties properties;
    /** Null-safe optional bean - Google sign-in has no configured credentials
     *  unless {@link com.campusmarket.config.FirebaseConfig} finds them. */
    private final ObjectProvider<FirebaseAuth> firebaseAuthProvider;

    private final SecureRandom random = new SecureRandom();

    // ------------------------------------------------------------ workflow 1
    @Transactional
    public Map<String, Object> signup(SignupRequest request) {
        String email = normalizeEmail(request.email());
        passwordPolicy.validate(request.password());

        if (userRepository.existsByEmail(email)) {
            // Signup is an explicit "is this address taken" surface, so naming the
            // conflict here is the right call - it lets the UI offer "Log in instead".
            throw ApiException.badRequest("EMAIL_EXISTS",
                    "An account with this email already exists.");
        }

        User user = new User();
        user.setName(request.name().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(Role.CUSTOMER);
        AccountType accountType = parseAccountType(request.accountType());
        user.setAccountType(accountType);
        user.setCampusZone(parseCampusZone(request.campusZone()));
        // Registering as a seller only files the application - an admin still
        // has to approve it before anything can be listed.
        if (accountType == AccountType.SELLER) {
            user.setSellerApprovalStatus(SellerApprovalStatus.PENDING);
            user.setSellerRequestedAt(Instant.now());
        }
        user.setEmailVerified(false);
        user.setPhone(blankToNull(request.phone()));
        user.setDepartment(blankToNull(request.department()));
        user.setYear(blankToNull(request.year()));
        userRepository.save(user);

        AuthToken token = issueToken(user, AuthTokenType.EMAIL_VERIFICATION,
                properties.getVerificationTokenTtlMinutes());
        emailService.sendVerificationEmail(user, token.getToken());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", accountType == AccountType.SELLER
                ? "Account created. Verify your email, then an admin will review your seller application."
                : "Account created. Check your email to verify your address.");
        body.put("email", user.getEmail());
        body.put("emailVerified", false);
        body.put("sellerApprovalStatus", user.getSellerApprovalStatus().name());
        addDevToken(body, token.getToken());
        return body;
    }

    @Transactional
    public Map<String, Object> resendVerification(String rawEmail) {
        String email = normalizeEmail(rawEmail);
        Optional<User> found = userRepository.findByEmail(email);

        // Same response whether or not the address exists, and whether or not it
        // is already verified - resend must not become an account oracle.
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", "If that account exists and needs verification, a new link is on its way.");

        if (found.isEmpty() || found.get().isEmailVerified()) {
            return body;
        }
        User user = found.get();

        authTokenRepository
                .findFirstByUserIdAndTypeOrderByCreatedAtDesc(user.getId(), AuthTokenType.EMAIL_VERIFICATION)
                .ifPresent(last -> {
                    Instant nextAllowed = last.getCreatedAt()
                            .plusSeconds(properties.getResendCooldownSeconds());
                    if (nextAllowed.isAfter(Instant.now())) {
                        long wait = Math.max(1, Instant.now().until(nextAllowed, ChronoUnit.SECONDS));
                        throw ApiException.tooManyRequests(
                                "Please wait " + wait + " seconds before requesting another email.",
                                Map.of("retryAfterSeconds", wait));
                    }
                });

        AuthToken token = issueToken(user, AuthTokenType.EMAIL_VERIFICATION,
                properties.getVerificationTokenTtlMinutes());
        emailService.sendVerificationEmail(user, token.getToken());
        addDevToken(body, token.getToken());
        return body;
    }

    // ------------------------------------------------------- workflow 1 (Google)
    /**
     * "Continue with Google": the client already completed the Google OAuth
     * popup via Firebase and hands us the resulting ID token. We verify it
     * ourselves rather than trusting anything the client claims about who
     * signed in - the token is the only thing that proves identity here.
     */
    @Transactional
    public Map<String, Object> googleSignIn(GoogleSignInRequest request) {
        FirebaseAuth firebaseAuth = firebaseAuthProvider.getIfAvailable();
        if (firebaseAuth == null) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GOOGLE_SIGNIN_DISABLED",
                    "Google sign-in is not available right now.", Map.of());
        }

        FirebaseToken decoded;
        try {
            decoded = firebaseAuth.verifyIdToken(request.idToken());
        } catch (FirebaseAuthException e) {
            throw ApiException.unauthorized("INVALID_GOOGLE_TOKEN",
                    "That Google sign-in could not be verified. Please try again.", Map.of());
        }

        String email = normalizeEmail(decoded.getEmail());
        if (email.isBlank() || !Boolean.TRUE.equals(decoded.isEmailVerified())) {
            // Google verifies its own accounts' emails as a matter of course; if
            // this one somehow isn't, treat it the same as any unverified signup.
            throw ApiException.forbidden("EMAIL_NOT_VERIFIED",
                    "Your Google account's email address is not verified.", Map.of());
        }

        User user = userRepository.findByGoogleUid(decoded.getUid())
                .or(() -> userRepository.findByEmail(email))
                .orElse(null);

        boolean isNewUser = user == null;
        if (isNewUser) {
            user = new User();
            user.setEmail(email);
            user.setRole(Role.CUSTOMER);
            user.setAuthProvider(AuthProvider.GOOGLE);
            user.setGoogleUid(decoded.getUid());
            user.setName(blankToNull(decoded.getName()) != null ? decoded.getName() : email);
            user.setAvatarUrl(decoded.getPicture());
            user.setEmailVerified(true);
            user.setPhone(blankToNull(request.phone()));
            /*
             * Google gives us an identity but not an intent. The popup has to
             * run before we can ask which kind of account they want, so a first
             * sign-in without answers lands as a BUYER with no zone and the
             * response flags needsProfile; the client then collects the answers
             * and posts the same token again to fill them in. Defaulting to
             * BUYER is the safe direction - it grants nothing.
             */
            AccountType googleType =
                    parseAccountTypeOrDefault(request.accountType(), AccountType.BUYER);
            user.setAccountType(googleType);
            user.setCampusZone(parseCampusZone(request.campusZone()));
            if (googleType == AccountType.SELLER) {
                user.setSellerApprovalStatus(SellerApprovalStatus.PENDING);
                user.setSellerRequestedAt(Instant.now());
            }
            userRepository.save(user);
        } else if (user.getGoogleUid() == null) {
            // An existing LOCAL account shares this address. Google has already
            // proven the signer owns it, so linking is safe - it isn't taking
            // the client's word for anything, only Google's verified claim.
            user.setGoogleUid(decoded.getUid());
            if (!user.isEmailVerified()) {
                user.setEmailVerified(true);
            }
        }

        if (user.getStatus() == UserStatus.BANNED) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("status", "BANNED");
            if (user.getStatusReason() != null) {
                extra.put("reason", user.getStatusReason());
            }
            throw ApiException.forbidden("ACCOUNT_BANNED",
                    "This account has been permanently banned.", extra);
        }
        if (user.isCurrentlyRestricted()) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("status", "SUSPENDED");
            if (user.getSuspendedUntil() != null) {
                extra.put("suspendedUntil", user.getSuspendedUntil().toString());
            }
            if (user.getStatusReason() != null) {
                extra.put("reason", user.getStatusReason());
            }
            throw ApiException.forbidden("ACCOUNT_SUSPENDED",
                    "This account is suspended.", extra);
        }

        /*
         * Second phase of the flow above: the client has now collected the
         * answers and re-posted. Only ever fills gaps - an established account
         * cannot have its type rewritten by replaying a token, which would
         * otherwise be a free upgrade to seller.
         */
        if (!isNewUser && user.getCampusZone() == null) {
            CampusZone zone = parseCampusZone(request.campusZone());
            if (zone != null) {
                user.setCampusZone(zone);
                AccountType chosen = parseAccountTypeOrDefault(request.accountType(), null);
                if (chosen != null) {
                    user.setAccountType(chosen);
                    if (chosen == AccountType.SELLER
                            && user.getSellerApprovalStatus() == SellerApprovalStatus.NOT_REQUESTED) {
                        user.setSellerApprovalStatus(SellerApprovalStatus.PENDING);
                        user.setSellerRequestedAt(Instant.now());
                    }
                }
            }
        }

        /*
         * The number, under the same gap-filling rule.
         *
         * The profile step is the only point at which a Google signup can offer
         * one, and it was landing nowhere: the field above is set only on the
         * isNewUser branch, which is the FIRST leg - the one that runs before
         * anybody has been asked. So a number typed on the second leg was
         * accepted by the request record and then quietly dropped.
         *
         * Never overwrites an existing number, for the same reason the account
         * type is not rewritable here: replaying a token must not be able to
         * change settled facts about an account. It lands unverified, exactly
         * as one given at email signup does.
         */
        if (!isNewUser && blankToNull(user.getPhone()) == null) {
            String offeredPhone = blankToNull(request.phone());
            if (offeredPhone != null) {
                user.setPhone(offeredPhone);
            }
        }

        Map<String, Object> body = sessionPayload(user, createSession(user));
        body.put("isNewUser", isNewUser);
        /*
         * Tells the client to show the "finish setting up" step rather than
         * dropping someone into the app with no zone set.
         *
         * Never for an administrator. The step asks "buy or sell?" and "which
         * part of campus?", and an admin is blocked from every flow those
         * answers govern - so the seeded admin, which has no zone on purpose,
         * would otherwise be met on first sign-in by a questionnaire whose
         * answers change nothing. They go straight to the console.
         */
        body.put("needsProfile", user.getRole() != Role.ADMIN && user.getCampusZone() == null);
        return body;
    }

    // -------------------------------------------------- buyer -> seller upgrade
    /**
     * Files a seller application against an existing BUYER account.
     *
     * <p>Upgrading in place rather than making them register again: a second
     * account would split their reviews, saved items and chat history across two
     * identities for no benefit.
     *
     * <p>This no longer grants selling immediately - it moves the account to
     * PENDING and an admin decides. Re-applying after a rejection is allowed;
     * a refusal is a decision about one application, not a permanent mark.
     */
    @Transactional
    public Map<String, Object> becomeSeller(Principal principal, BecomeSellerRequest request) {
        if (principal.isGuest()) {
            throw ApiException.unauthorized("Please log in to continue.");
        }
        User user = principal.user();

        if (user.getRole() == Role.ADMIN) {
            // Admins can already list; there is no application to file.
            throw ApiException.badRequest("ALREADY_ALLOWED",
                    "Admin accounts can already post listings.");
        }
        if (!user.isEmailVerified()) {
            throw ApiException.forbidden("EMAIL_NOT_VERIFIED",
                    "Verify your campus email before you start selling.",
                    Map.of("emailVerified", false));
        }
        if (user.isCurrentlyRestricted()) {
            throw ApiException.forbidden("ACCOUNT_RESTRICTED",
                    "This account is restricted and cannot start selling.", Map.of());
        }

        CampusZone zone = parseCampusZone(request == null ? null : request.campusZone());
        if (zone != null) {
            user.setCampusZone(zone);
        }
        if (user.getCampusZone() == null) {
            throw ApiException.badRequest("ZONE_REQUIRED",
                    "Choose your campus location so buyers know where to meet you.");
        }

        boolean alreadyApproved =
                user.getSellerApprovalStatus() == SellerApprovalStatus.APPROVED;
        boolean alreadyPending =
                user.getSellerApprovalStatus() == SellerApprovalStatus.PENDING;

        user.setAccountType(AccountType.SELLER);
        if (!alreadyApproved && !alreadyPending) {
            // Covers first-time applicants and anyone reapplying after a refusal.
            user.setSellerApprovalStatus(SellerApprovalStatus.PENDING);
            user.setSellerRequestedAt(Instant.now());
            user.setSellerApprovalReason(null);
            user.setSellerReviewedAt(null);
        }
        // The principal's User is detached - it was loaded by the auth filter in
        // a different persistence context - so dirty checking never fires and
        // the application has to be written explicitly. Without this the call
        // answers "Application submitted" and nothing reaches the database,
        // leaving the admin approvals queue permanently empty.
        userRepository.save(user);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("alreadySeller", alreadyApproved);
        body.put("sellerApprovalStatus", user.getSellerApprovalStatus().name());
        body.put("message", alreadyApproved
                ? "You're already set up to sell."
                : alreadyPending
                    ? "Your application is already with our team."
                    : "Application submitted. An admin will review it shortly.");
        body.put("user", buildSessionDto(user, principal.hasActiveListings()));
        return body;
    }

    // ------------------------------------------------------------ workflow 2
    @Transactional
    public Map<String, Object> verifyEmail(String rawToken) {
        AuthToken token = authTokenRepository.findByToken(rawToken.trim())
                .filter(t -> t.getType() == AuthTokenType.EMAIL_VERIFICATION)
                .orElseThrow(() -> ApiException.badRequest("INVALID_TOKEN",
                        "That verification link is not valid. Request a new one."));

        User user = token.getUser();

        // Re-clicking a link that already did its job is a no-op success, not an
        // error - the user simply lands on Home.
        if (user.isEmailVerified()) {
            Map<String, Object> body = sessionPayload(user, createSession(user));
            body.put("alreadyVerified", true);
            body.put("message", "Your email is already verified.");
            return body;
        }

        if (!token.isUsable()) {
            throw ApiException.badRequest("TOKEN_EXPIRED",
                    "That verification link has expired. Request a new one.");
        }

        token.setUsedAt(Instant.now());
        user.setEmailVerified(true);

        Map<String, Object> body = sessionPayload(user, createSession(user));
        body.put("alreadyVerified", false);
        body.put("message", "Email verified. Welcome to CampusMarket!");
        return body;
    }

    // ------------------------------------------------------------ workflow 3
    @Transactional
    public Map<String, Object> login(LoginRequest request) {
        String email = normalizeEmail(request.email());
        Optional<User> found = userRepository.findByEmail(email);

        // Deliberately identical for "no such account" and "wrong password" so the
        // endpoint cannot be used to enumerate registered addresses.
        ApiException invalid = ApiException.unauthorized("INVALID_CREDENTIALS",
                "Invalid email or password.", Map.of());

        if (found.isEmpty()) {
            throw invalid;
        }
        User user = found.get();

        if (user.isLoginLocked()) {
            long wait = Math.max(1, Instant.now().until(user.getLockedUntil(), ChronoUnit.MINUTES) + 1);
            throw ApiException.tooManyRequests(
                    "Too many failed attempts. Try again in " + wait + " minute(s).",
                    Map.of("retryAfterMinutes", wait));
        }

        // A Google-only account has no password hash to check against - treat
        // that exactly like a wrong password rather than a special case, so
        // the response gives no hint that the account exists via Google.
        if (user.getPasswordHash() == null
                || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            registerFailedLogin(user);
            throw invalid;
        }

        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);

        // A suspension whose window has passed lapses on the next login attempt.
        if (user.getStatus() == UserStatus.SUSPENDED
                && user.getSuspendedUntil() != null
                && !user.getSuspendedUntil().isAfter(Instant.now())) {
            user.setStatus(UserStatus.ACTIVE);
            user.setSuspendedUntil(null);
            user.setStatusReason(null);
        }

        if (!user.isEmailVerified()) {
            throw ApiException.forbidden("EMAIL_NOT_VERIFIED",
                    "Verify your email address before logging in.",
                    Map.of("email", user.getEmail()));
        }

        if (user.getStatus() == UserStatus.BANNED) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("status", "BANNED");
            if (user.getStatusReason() != null) {
                extra.put("reason", user.getStatusReason());
            }
            throw ApiException.forbidden("ACCOUNT_BANNED",
                    "This account has been permanently banned.", extra);
        }

        if (user.isCurrentlyRestricted()) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("status", "SUSPENDED");
            if (user.getSuspendedUntil() != null) {
                extra.put("suspendedUntil", user.getSuspendedUntil().toString());
            }
            if (user.getStatusReason() != null) {
                extra.put("reason", user.getStatusReason());
            }
            throw ApiException.forbidden("ACCOUNT_SUSPENDED",
                    "This account is suspended.", extra);
        }

        return sessionPayload(user, createSession(user));
    }

    // ------------------------------------------------------------ workflow 4
    @Transactional
    public Map<String, Object> forgotPassword(String rawEmail) {
        String email = normalizeEmail(rawEmail);

        // Identical response either way - never reveal which addresses exist.
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", "If an account exists for that email, a reset link is on its way.");

        userRepository.findByEmail(email).ifPresent(user -> {
            AuthToken token = issueToken(user, AuthTokenType.PASSWORD_RESET,
                    properties.getResetTokenTtlMinutes());
            emailService.sendPasswordResetEmail(user, token.getToken());
            addDevToken(body, token.getToken());
        });

        return body;
    }

    /**
     * Change your own password while signed in.
     *
     * <p>The current password is required even though the session already
     * proves identity: a borrowed unlocked laptop is the ordinary case this
     * defends against, and it costs the real owner one field.
     *
     * <p>The session doing the changing survives - being logged out of the tab
     * you just used to change your password reads as a failure. Every other
     * session is revoked, which is the half that was missing: knowing the old
     * password does not mean nobody else has it, and a phished or shared
     * password is exactly what someone is trying to undo here. Changing it and
     * leaving the other party signed in achieves nothing.
     */
    @Transactional
    public Map<String, Object> changePassword(Principal principal,
                                              String currentSessionToken,
                                              String currentPassword,
                                              String newPassword,
                                              String confirmPassword) {
        if (principal.isGuest()) {
            throw ApiException.unauthorized("Please log in to change your password.");
        }
        User user = userRepository.findById(principal.id())
                .orElseThrow(() -> ApiException.notFound("Account not found."));

        if (currentPassword == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw ApiException.badRequest("CURRENT_PASSWORD_WRONG",
                    "That is not your current password.");
        }
        if (newPassword == null || !newPassword.equals(confirmPassword)) {
            throw ApiException.badRequest("PASSWORD_MISMATCH", "The new passwords do not match.");
        }
        if (newPassword.equals(currentPassword)) {
            throw ApiException.badRequest("PASSWORD_UNCHANGED",
                    "That is already your password. Choose a different one.");
        }
        passwordPolicy.validate(newPassword);

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        userRepository.save(user);

        /*
         * Every other device is signed out. Without a token to keep - which
         * would mean the caller authenticated some other way - all of them go,
         * rather than leaving the sessions this was meant to end.
         */
        Instant now = Instant.now();
        int revoked = currentSessionToken == null || currentSessionToken.isBlank()
                ? sessionRepository.revokeAllForUser(user.getId(), now)
                : sessionRepository.revokeAllForUserExcept(user.getId(), currentSessionToken, now);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", revoked > 0
                ? "Password changed. You've been signed out on your other devices."
                : "Password changed.");
        return body;
    }

    @Transactional
    public Map<String, Object> resetPassword(ResetPasswordRequest request) {
        if (!request.password().equals(request.confirmPassword())) {
            throw ApiException.badRequest("PASSWORD_MISMATCH", "Passwords do not match.");
        }
        passwordPolicy.validate(request.password());

        AuthToken token = authTokenRepository.findByToken(request.token().trim())
                .filter(t -> t.getType() == AuthTokenType.PASSWORD_RESET)
                .orElseThrow(() -> ApiException.badRequest("INVALID_TOKEN",
                        "That reset link is not valid. Request a new one."));

        if (!token.isUsable()) {
            throw ApiException.badRequest("TOKEN_EXPIRED",
                    "That reset link has expired. Request a new one.");
        }

        User user = token.getUser();
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        token.setUsedAt(Instant.now());

        // Anyone who was riding an old session is logged out - if the reset was
        // triggered because the account was compromised, this is what ends it.
        sessionRepository.revokeAllForUser(user.getId(), Instant.now());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", "Password updated. Please log in with your new password.");
        return body;
    }

    // ------------------------------------------------------------ workflow 5
    @Transactional
    public Map<String, Object> logout(String bearerToken) {
        if (bearerToken != null && !bearerToken.isBlank()) {
            sessionRepository.findByToken(bearerToken)
                    .ifPresent(session -> session.setRevokedAt(Instant.now()));
        }
        // Always reports success: if the token was already dead the caller is
        // logged out either way, which is what the client needs to know.
        return Map.of("success", true, "message", "Signed out.");
    }

    // ------------------------------------------------------------ session read
    @Transactional(readOnly = true)
    public SessionDto currentSession(Principal principal) {
        if (principal.isGuest()) {
            return SessionDto.guest();
        }
        return buildSessionDto(principal.user(), principal.hasActiveListings());
    }

    // ------------------------------------------------------------ helpers
    private void registerFailedLogin(User user) {
        int attempts = user.getFailedLoginAttempts() + 1;
        user.setFailedLoginAttempts(attempts);
        if (attempts >= properties.getMaxFailedLogins()) {
            user.setLockedUntil(Instant.now().plus(properties.getLoginLockoutMinutes(), ChronoUnit.MINUTES));
            user.setFailedLoginAttempts(0);
        }
    }

    private AuthToken issueToken(User user, AuthTokenType type, int ttlMinutes) {
        AuthToken token = new AuthToken();
        token.setUser(user);
        token.setType(type);
        token.setToken(randomToken());
        token.setExpiresAt(Instant.now().plus(ttlMinutes, ChronoUnit.MINUTES));
        return authTokenRepository.save(token);
    }

    private String createSession(User user) {
        UserSession session = new UserSession();
        session.setUser(user);
        session.setToken(randomToken());
        session.setExpiresAt(Instant.now().plus(properties.getSessionTtlDays(), ChronoUnit.DAYS));
        sessionRepository.save(session);
        return session.getToken();
    }

    private Map<String, Object> sessionPayload(User user, String token) {
        boolean hasActiveListings = user.getRole() == Role.CUSTOMER
                && listingRepository.existsBySellerIdAndDeletedFalseAndStatusIn(user.getId(), SELLER_STATUSES);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("token", token);
        body.put("user", buildSessionDto(user, hasActiveListings));
        return body;
    }

    private SessionDto buildSessionDto(User user, boolean hasActiveListings) {
        return new SessionDto(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getAvatarUrl(),
                user.getRole() == Role.ADMIN ? "admin" : "customer",
                user.getAccountType().name(),
                user.getSellerApprovalStatus().name(),
                user.getSellerApprovalReason(),
                user.canCreateListings(),
                user.getCampusZone() == null ? null : user.getCampusZone().name(),
                hasActiveListings,
                user.isEmailVerified(),
                user.isPhoneVerified(),
                user.getPhone(),
                user.isVerified(),
                user.getStatus().name(),
                user.getSuspendedUntil(),
                user.getStatusReason(),
                user.getDepartment(),
                user.getYear(),
                notificationRepository.countByUserIdAndReadFalse(user.getId()),
                messageRepository.countUnreadForUser(user.getId()),
                user.getRole() == Role.ADMIN ? 0 : cartItemRepository.countByUserId(user.getId()),
                user.getRole() == Role.ADMIN ? 0
                        : listingRepository.countBySellerIdAndDeletedFalseAndStatusIn(user.getId(), SELLER_STATUSES),
                user.getRole() == Role.ADMIN ? 0
                        : orderRepository.countBySellerIdAndStatusIn(user.getId(), OPEN_ORDER_STATUSES));
    }

    private String randomToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** Dev-only echo so the email flows are testable without a mail provider. */
    private void addDevToken(Map<String, Object> body, String token) {
        if (properties.isExposeDevTokens()) {
            body.put("devToken", token);
        }
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }

    /** Signup: the choice is mandatory, so a bad or missing value is an error. */
    private AccountType parseAccountType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ApiException.badRequest("ACCOUNT_TYPE_REQUIRED",
                    "Choose whether you're here to buy or sell.");
        }
        try {
            return AccountType.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_ACCOUNT_TYPE",
                    "Choose either a buyer or a seller account.");
        }
    }

    /** Google: absence is expected on the first leg, so it falls back instead. */
    private AccountType parseAccountTypeOrDefault(String raw, AccountType fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return AccountType.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    private CampusZone parseCampusZone(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return CampusZone.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_ZONE",
                    "Choose Downschool, Upschool or Across.");
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
