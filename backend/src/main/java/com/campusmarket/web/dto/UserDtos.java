package com.campusmarket.web.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** User-facing projections. Grouped so the contact-detail rules stay together. */
public final class UserDtos {
    private UserDtos() {}

    /**
     * The session payload the frontend renders navigation from. {@code role} and
     * {@code hasActiveListings} are authoritative and always server-computed
     * (RBAC rules 3 and 4).
     */
    public record SessionDto(
            UUID id,
            String name,
            String email,
            String avatarUrl,
            String role,
            /** BUYER or SELLER - the account's intent, not yet permission. */
            String accountType,
            /** NOT_REQUESTED | PENDING | APPROVED | REJECTED - the admin gate. */
            String sellerApprovalStatus,
            /** Why an application was refused, so the UI can say more than "no". */
            String sellerApprovalReason,
            /** True when this account may actually create a listing right now. */
            boolean canSell,
            /** DOWNSCHOOL | UPSCHOOL | ACROSS, or null if never chosen. */
            String campusZone,
            boolean hasActiveListings,
            boolean emailVerified,
            /** True once a code sent to the phone number was entered back. */
            boolean phoneVerified,
            /** The member's own number, so the profile can prefill it. */
            String phone,
            boolean verified,
            String status,
            Instant suspendedUntil,
            String statusReason,
            String department,
            String year,
            long unreadNotifications,
            long unreadMessages,
            long cartCount,
            /** Live listing count, so the seller menu can state a real number. */
            long activeListings,
            /** Pending + accepted orders awaiting this seller - drives the nav badge. */
            long openOrders
    ) {
        public static SessionDto guest() {
            return new SessionDto(null, "Guest Visitor", null, null, "guest",
                    "BUYER", "NOT_REQUESTED", null, false, null,
                    // hasActiveListings, emailVerified, phoneVerified, phone, verified
                    false, false, false, null, false,
                    "ACTIVE", null, null, null, null,
                    0, 0, 0, 0, 0);
        }
    }

    /**
     * Public profile. Contact details are absent from this record entirely - they
     * are only ever emitted through {@link PrivateContactDto}, which the mapper
     * attaches for the account owner and admins alone (RBAC rule 8).
     */
    public record PublicUserDto(
            UUID id,
            String name,
            String avatarUrl,
            boolean verified,
            String department,
            String year,
            BigDecimal ratingAvg,
            int reviewsCount,
            Instant joinedDate,
            String bio,
            String status,
            PrivateContactDto contact
    ) {}

    /** Only populated for the owner of the account or an admin. */
    public record PrivateContactDto(
            String email,
            String phone,
            String privateAddress
    ) {}

    /** Extra block shown on a seller's own profile. */
    public record SellerStatsDto(
            long activeListings,
            long soldListings,
            long completedDeals,
            BigDecimal ratingAvg,
            int reviewsCount
    ) {}

    /** Admin user-management row. */
    public record AdminUserDto(
            UUID id,
            String name,
            String email,
            String role,
            String status,
            boolean emailVerified,
            boolean verified,
            String accountType,
            String sellerApprovalStatus,
            String sellerApprovalReason,
            /** When they applied - the queue orders by this. */
            Instant sellerRequestedAt,
            String campusZone,
            Instant suspendedUntil,
            String statusReason,
            String department,
            long activeListings,
            Instant createdAt
    ) {}
}
