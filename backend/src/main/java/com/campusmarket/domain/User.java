package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    /** Always stored lower-cased so the UNIQUE constraint is case-insensitive. */
    @Column(nullable = false, unique = true)
    private String email;

    /** Null for Google-only accounts - there is nothing to hash. */
    @Column(name = "password_hash")
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_provider", nullable = false)
    private AuthProvider authProvider = AuthProvider.LOCAL;

    /** Firebase's stable per-account id. Set only for {@link AuthProvider#GOOGLE}. */
    @Column(name = "google_uid", unique = true)
    private String googleUid;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role = Role.CUSTOMER;

    /**
     * Chosen at registration; gates listing creation. Upgradable in place via
     * {@code POST /api/auth/become-seller}, so a buyer never has to make a
     * second account. Admins keep the BUYER default and are blocked from
     * customer flows by role instead.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "account_type", nullable = false)
    private AccountType accountType = AccountType.BUYER;

    /** Which part of campus this user is based in. */
    @Enumerated(EnumType.STRING)
    @Column(name = "campus_zone")
    private CampusZone campusZone;

    /**
     * Admin review state for selling. {@link AccountType#SELLER} alone is only
     * an intent; this is what actually unlocks listing creation.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "seller_approval_status", nullable = false)
    private SellerApprovalStatus sellerApprovalStatus = SellerApprovalStatus.NOT_REQUESTED;

    /** Why an application was rejected, shown back to the applicant. */
    @Column(name = "seller_approval_reason")
    private String sellerApprovalReason;

    /** When they applied - lets the admin queue show oldest-waiting first. */
    @Column(name = "seller_requested_at")
    private Instant sellerRequestedAt;

    @Column(name = "seller_reviewed_at")
    private Instant sellerReviewedAt;

    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified = false;

    /** Admin-granted trust badge (workflow 21) - distinct from emailVerified. */
    @Column(nullable = false)
    private boolean verified = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status = UserStatus.ACTIVE;

    @Column(name = "suspended_until")
    private Instant suspendedUntil;

    @Column(name = "status_reason")
    private String statusReason;

    private String department;

    private String year;

    @Column(name = "avatar_url")
    private String avatarUrl;

    private String bio;

    /** Sensitive - never serialised to non-owners (RBAC rule 8). */
    private String phone;

    /** True once a code sent to {@link #phone} was entered back correctly. */
    @Column(name = "phone_verified", nullable = false)
    private boolean phoneVerified = false;

    /**
     * The number a pending code was sent to.
     *
     * <p>Held apart from {@link #phone} so an edit cannot replace a confirmed
     * number until the new one is confirmed too - otherwise typing a wrong
     * number would silently discard a working one.
     */
    @Column(name = "phone_pending", length = 32)
    private String phonePending;

    /** Hashed, like a password: a database leak must not yield live codes. */
    @Column(name = "phone_otp_hash")
    private String phoneOtpHash;

    @Column(name = "phone_otp_expires_at")
    private Instant phoneOtpExpiresAt;

    @Column(name = "phone_otp_attempts", nullable = false)
    private int phoneOtpAttempts = 0;

    @Column(name = "phone_otp_sent_at")
    private Instant phoneOtpSentAt;

    /** Sensitive - never serialised to non-owners (RBAC rule 8). */
    @Column(name = "private_address")
    private String privateAddress;

    @Column(name = "rating_avg", nullable = false)
    private BigDecimal ratingAvg = BigDecimal.ZERO;

    @Column(name = "reviews_count", nullable = false)
    private int reviewsCount = 0;

    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts = 0;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    /**
     * A suspension lapses on its own once {@code suspendedUntil} passes; callers
     * should treat that as active again. Bans never lapse.
     */
    public boolean isCurrentlyRestricted() {
        if (status == UserStatus.BANNED) {
            return true;
        }
        if (status == UserStatus.SUSPENDED) {
            return suspendedUntil == null || suspendedUntil.isAfter(Instant.now());
        }
        return false;
    }

    public boolean isLoginLocked() {
        return lockedUntil != null && lockedUntil.isAfter(Instant.now());
    }

    public boolean isAdmin() {
        return role == Role.ADMIN;
    }

    /**
     * May this account create listings right now?
     *
     * <p>Admins are trusted by definition and skip the review entirely - asking
     * an admin to approve themselves would be a check that checks nothing.
     */
    public boolean canCreateListings() {
        if (isAdmin()) {
            return true;
        }
        return accountType == AccountType.SELLER && sellerApprovalStatus.canList();
    }

    /**
     * Do this seller's incoming orders need an admin to look at them first?
     *
     * <p>The verified badge is what lifts the hold. Admins are never held for
     * the same reason they skip approval: they would be reviewing themselves.
     */
    public boolean ordersNeedReview() {
        return !isAdmin() && !verified;
    }
}
