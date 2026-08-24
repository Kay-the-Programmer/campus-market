package com.campusmarket.web.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ModerationDtos {
    private ModerationDtos() {}

    public record NotificationDto(
            UUID id,
            String type,
            String title,
            String body,
            String link,
            boolean read,
            /** False when the linked listing/user no longer exists (workflow 18). */
            boolean linkValid,
            Instant createdAt
    ) {}

    /**
     * Push settings for the calling user. {@code deviceCount} and
     * {@code pushConfigured} are context rather than settings: the UI uses them
     * to say "on for 2 devices" and to hide the whole section when the server
     * has no FCM credentials to send with.
     */
    public record NotificationPreferencesDto(
            boolean pushEnabled,
            boolean messages,
            boolean orders,
            boolean reviews,
            boolean priceDrops,
            boolean systemUpdates,
            int deviceCount,
            boolean pushConfigured
    ) {}

    public record ReportDto(
            UUID id,
            UserDtos.PublicUserDto reporter,
            String targetType,
            UUID targetId,
            String targetLabel,
            ListingDtos.ListingRefDto targetListing,
            UserDtos.PublicUserDto targetUser,
            String reason,
            String details,
            String status,
            String resolution,
            String resolvedByAdminName,
            Instant resolvedAt,
            boolean duplicate,
            Instant createdAt
    ) {}

    public record AuditLogDto(
            UUID id,
            UUID adminId,
            String adminName,
            String action,
            String targetType,
            UUID targetId,
            String reason,
            String details,
            Instant createdAt
    ) {}

    /**
     * Everything an admin should see before letting someone sell.
     *
     * <p>The queue row answers "who applied". This answers "should they" - which
     * needs the things a name and an email cannot tell you: whether they can
     * actually be contacted, how long they have been here, whether anyone has
     * complained about them, whether they have traded before, and whether this
     * account has been refused or disciplined already.
     */
    public record SellerApplicantDto(
            UUID id,
            String name,
            String email,
            String avatarUrl,
            boolean emailVerified,
            /** Present for admins only, via DtoMapper's contact rules. */
            String phone,
            boolean phoneVerified,
            String campusZone,
            String department,
            String year,
            String bio,
            /** Account age is the cheapest proxy for "is this a real student". */
            Instant memberSince,

            String status,
            String statusReason,
            Instant suspendedUntil,
            /** True if this account has ever been suspended or banned. */
            boolean previouslyDisciplined,

            String sellerApprovalStatus,
            Instant sellerRequestedAt,
            /** The reason recorded last time, when this is a re-application. */
            String previousDecisionReason,

            /** Trading history as a buyer - somebody who has completed handovers
             *  has already been trusted by other students. */
            long completedDeals,
            long ordersPlaced,
            /** Drafts they have prepared but cannot publish until approved. */
            long draftListings,
            double ratingAverage,
            long reviewCount,

            long reportsAgainst,
            List<ApplicantReportDto> recentReports
    ) {}

    /** A complaint against the applicant, trimmed to what a decision needs. */
    public record ApplicantReportDto(
            UUID id,
            String reason,
            String details,
            String status,
            String resolution,
            Instant createdAt
    ) {}

    public record AdminStatsDto(
            long totalUsers,
            long activeListings,
            long completedDeals,
            long pendingReports,
            long suspendedUsers,
            long bannedUsers,
            /** Seller applications waiting on a decision. */
            long pendingSellers,
            /** Orders withheld from unverified sellers, waiting on review. */
            long heldOrders,
            List<AuditLogDto> recentAuditLogs
    ) {}
}
