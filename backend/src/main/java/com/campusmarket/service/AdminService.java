package com.campusmarket.service;

import com.campusmarket.domain.AccountType;
import com.campusmarket.domain.AuditAction;
import com.campusmarket.domain.DealStatus;
import com.campusmarket.domain.Listing;
import com.campusmarket.domain.ListingStatus;
import com.campusmarket.domain.NotificationType;
import com.campusmarket.domain.OrderStatus;
import com.campusmarket.domain.Report;
import com.campusmarket.domain.ReportEnums;
import com.campusmarket.domain.Role;
import com.campusmarket.domain.SellerApprovalStatus;
import com.campusmarket.domain.User;
import com.campusmarket.domain.UserStatus;
import com.campusmarket.repository.AuditLogRepository;
import com.campusmarket.repository.DealRepository;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.repository.MessageRepository;
import com.campusmarket.repository.OrderRepository;
import com.campusmarket.repository.ReportRepository;
import com.campusmarket.repository.ReviewRepository;
import com.campusmarket.repository.UserRepository;
import com.campusmarket.repository.UserSessionRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.ListingDtos.ListingDto;
import com.campusmarket.web.dto.ModerationDtos;
import com.campusmarket.web.dto.ModerationDtos.AdminStatsDto;
import com.campusmarket.web.dto.ModerationDtos.AuditLogDto;
import com.campusmarket.web.dto.ModerationDtos.ReportDto;
import com.campusmarket.web.dto.UserDtos.AdminUserDto;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Workflows 19, 20 and 21 - the moderation console.
 *
 * <p>Every method here checks {@link AccessGuard#requireAdmin} first and writes an
 * audit entry inside the same transaction as the change it describes (RBAC rule 4),
 * so the trail can never drift from what actually happened.
 */
@Service
@RequiredArgsConstructor
public class AdminService {

    /** Listings that count as live for a seller - matches ListingStatus.countsAsActiveForSellerState. */
    private static final List<ListingStatus> ACTIVE_LISTING_STATUSES =
            List.of(ListingStatus.ACTIVE, ListingStatus.RESERVED);

    private static final int RECENT_AUDIT_LOG_COUNT = 10;

    /** Enough for a campus catalogue; the screen has search for anything beyond. */
    private static final int MAX_ADMIN_LISTINGS = 300;

    private final ReportRepository reportRepository;
    private final UserRepository userRepository;
    private final ListingRepository listingRepository;
    private final DealRepository dealRepository;
    private final AuditLogRepository auditLogRepository;
    private final OrderRepository orderRepository;
    private final UserSessionRepository userSessionRepository;
    /** Verification unseals order details withheld while a seller was unproven. */
    private final MessageRepository messageRepository;
    /** Applicant rating, shown when reviewing a seller application. */
    private final ReviewRepository reviewRepository;
    private final AccessGuard accessGuard;
    private final AuditService auditService;
    private final NotificationService notificationService;
    private final ReportService reportService;
    private final DtoMapper mapper;

    /** What an admin can do with a report (workflow 19 step 3). */
    public enum ResolutionAction { DISMISS, REMOVE_LISTING, BAN_USER }

    // ------------------------------------------------------------------ workflow 19

    /** {@code status} is "pending" (the default queue) or "all". */
    @Transactional(readOnly = true)
    public List<ReportDto> listReports(Principal principal, String status) {
        accessGuard.requireAdmin(principal);

        String filter = status == null || status.isBlank()
                ? "pending"
                : status.trim().toLowerCase(Locale.ROOT);

        List<Report> reports = switch (filter) {
            case "pending" -> reportRepository.findByStatusOrderByCreatedAtAsc(ReportEnums.Status.PENDING);
            case "all" -> reportRepository.findAllOrderedForQueue(ReportEnums.Status.PENDING);
            default -> throw ApiException.badRequest("Filter reports by 'pending' or 'all'.");
        };

        return reports.stream().map(report -> reportService.toDto(report, principal)).toList();
    }

    @Transactional
    public ReportDto resolveReport(Principal principal, UUID reportId, String actionRaw, String reason) {
        accessGuard.requireAdmin(principal);
        User admin = principal.user();

        Report report = reportRepository.findById(reportId)
                .orElseThrow(() -> ApiException.notFound("That report no longer exists."));

        // Two moderators can have the same queue open. The second one must be told
        // what happened rather than silently re-running the action.
        if (report.getStatus() == ReportEnums.Status.RESOLVED) {
            String resolver = report.getResolvedByAdmin() == null
                    ? "another administrator"
                    : report.getResolvedByAdmin().getName();
            throw ApiException.conflict(
                    "REPORT_ALREADY_RESOLVED",
                    "This report was already resolved by " + resolver + ".");
        }

        ResolutionAction action = parseAction(actionRaw);
        String note = trimToNull(reason);

        // Set when the outcome bans someone: revoking their sessions is a bulk update
        // that clears the persistence context, so it has to run after every other write.
        UUID bannedUserId = null;

        switch (action) {
            case DISMISS -> {
                report.setResolution(ReportEnums.Resolution.DISMISSED);
                auditService.record(admin, AuditAction.DISMISS_REPORT, "report", report.getId(), note,
                        "Dismissed a " + report.getReason().name() + " report against "
                                + report.getTargetType().name().toLowerCase(Locale.ROOT) + " " + report.targetId() + ".");
            }
            case REMOVE_LISTING -> {
                Listing listing = report.getTargetListing();
                if (listing == null) {
                    throw ApiException.badRequest("This report is about a member, not a listing - ban or dismiss it instead.");
                }
                // Soft delete only: chat threads and deal history keep resolving the
                // reference and render "Listing removed" (workflow 8).
                if (!listing.isDeleted()) {
                    listing.setDeleted(true);
                    listing.setDeletedAt(Instant.now());
                }
                report.setResolution(ReportEnums.Resolution.LISTING_REMOVED);

                auditService.record(admin, AuditAction.REMOVE_LISTING, "listing", listing.getId(), note,
                        "Removed \"" + listing.getTitle() + "\" after a " + report.getReason().name() + " report.");

                // Link is null on purpose - the listing is gone, so there is nowhere to send them.
                notificationService.notify(
                        listing.getSeller(),
                        NotificationType.MODERATION,
                        "Your listing was removed",
                        "\"" + listing.getTitle() + "\" was removed by a moderator"
                                + (note == null ? "." : ": " + note),
                        null);
            }
            case BAN_USER -> {
                // A listing report escalates to the seller behind it.
                User target = report.getTargetUser() != null
                        ? report.getTargetUser()
                        : (report.getTargetListing() == null ? null : report.getTargetListing().getSeller());
                if (target == null) {
                    throw ApiException.badRequest("This report has no member attached to ban.");
                }
                requireModeratable(admin, target, "ban");
                applyBan(admin, target, note == null ? "Banned following a report." : note);
                report.setResolution(ReportEnums.Resolution.USER_BANNED);
                bannedUserId = target.getId();
            }
        }

        report.setStatus(ReportEnums.Status.RESOLVED);
        report.setResolvedByAdmin(admin);
        report.setResolvedAt(Instant.now());

        auditService.record(admin, AuditAction.RESOLVE_REPORT, "report", report.getId(), note,
                "Resolved as " + report.getResolution().name() + ".");

        if (bannedUserId != null) {
            // Flushes everything above, then detaches it all - so the report is re-read
            // rather than mapped from a stale instance.
            revokeSessions(bannedUserId);
            Report refreshed = reportRepository.findById(reportId)
                    .orElseThrow(() -> ApiException.notFound("That report no longer exists."));
            return reportService.toDto(refreshed, principal);
        }
        return reportService.toDto(report, principal);
    }

    // ------------------------------------------------------------------ workflow 20

    @Transactional
    public AdminUserDto suspend(Principal principal, UUID userId, String reason, Integer durationDays) {
        accessGuard.requireAdmin(principal);
        User admin = principal.user();

        String note = trimToNull(reason);
        if (note == null) {
            throw ApiException.badRequest("Give a reason for the suspension - the member is shown it.");
        }
        if (durationDays == null || durationDays <= 0) {
            throw ApiException.badRequest("Set how many days the suspension should last.");
        }

        User target = requireModeratableTarget(admin, userId, "suspend");

        Instant until = Instant.now().plus(Duration.ofDays(durationDays));
        target.setStatus(UserStatus.SUSPENDED);
        target.setSuspendedUntil(until);
        target.setStatusReason(note);

        auditService.record(admin, AuditAction.SUSPEND_USER, "user", target.getId(), note,
                "Suspended for " + durationDays + " day(s), until " + until + ". Sessions revoked.");

        // Their listings are deliberately NOT mutated. ListingService's public browse
        // query is what excludes listings whose seller is restricted, so the rows stay
        // exactly as they were and reinstatement puts them back automatically.
        return finishRestriction(target.getId());
    }

    @Transactional
    public AdminUserDto ban(Principal principal, UUID userId, String reason) {
        accessGuard.requireAdmin(principal);
        User admin = principal.user();

        String note = trimToNull(reason);
        if (note == null) {
            throw ApiException.badRequest("Give a reason for the ban - it is kept in the audit trail.");
        }

        User target = requireModeratableTarget(admin, userId, "ban");
        applyBan(admin, target, note);

        // As with suspension, the seller's listings are left untouched and simply drop
        // out of public browse via the seller-status filter in ListingService.
        return finishRestriction(target.getId());
    }

    @Transactional
    public AdminUserDto reinstate(Principal principal, UUID userId, String reason) {
        accessGuard.requireAdmin(principal);
        User admin = principal.user();

        User target = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("That member no longer exists."));
        String note = trimToNull(reason);

        target.setStatus(UserStatus.ACTIVE);
        target.setSuspendedUntil(null);
        target.setStatusReason(null);

        auditService.record(admin, AuditAction.REINSTATE_USER, "user", target.getId(), note,
                "Account reinstated. Their listings return to public browse untouched.");

        notificationService.notify(
                target,
                NotificationType.MODERATION,
                "Your account has been reinstated",
                note == null
                        ? "Your account is active again and your listings are visible."
                        : "Your account is active again: " + note,
                null);

        // No session revocation here - the restriction already killed them, and the
        // member signs back in normally.
        return adminUser(target);
    }

    /**
     * One seller applicant, in enough detail to decide on.
     *
     * <p>Approving is a grant of standing on the marketplace, and the queue row
     * it was decided from carried a name, an email and a campus zone - nothing
     * that distinguishes a real student from an account made ten minutes ago.
     * This gathers what actually bears on the question: whether they can be
     * reached, how long they have been here, what other people have reported
     * about them, whether they have traded before, and whether this same
     * account has already been refused or disciplined.
     *
     * <p>Read-only and admin-only. It reveals a phone number and complaint
     * history, which is exactly the material {@link DtoMapper} withholds from
     * everyone but the account owner and an admin.
     */
    @Transactional(readOnly = true)
    public ModerationDtos.SellerApplicantDto sellerApplicant(Principal principal, UUID userId) {
        accessGuard.requireAdmin(principal);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("That member no longer exists."));

        List<Report> against = reportRepository.findByTargetUserIdOrderByCreatedAtDesc(userId);

        /*
         * "Has this account been in trouble before" is not a single column: a
         * lapsed suspension leaves status ACTIVE again, so the current status
         * alone would say no. A recorded reason is what survives it.
         */
        boolean disciplined = user.getStatus() != UserStatus.ACTIVE
                || user.getSuspendedUntil() != null
                || trimToNull(user.getStatusReason()) != null;

        return new ModerationDtos.SellerApplicantDto(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getAvatarUrl(),
                user.isEmailVerified(),
                user.getPhone(),
                user.isPhoneVerified(),
                user.getCampusZone() == null ? null : user.getCampusZone().name(),
                user.getDepartment(),
                user.getYear(),
                user.getBio(),
                user.getCreatedAt(),

                user.getStatus().name(),
                user.getStatusReason(),
                user.getSuspendedUntil(),
                disciplined,

                user.getSellerApprovalStatus().name(),
                user.getSellerRequestedAt(),
                // Only meaningful on a re-application; a first-time applicant
                // has no prior decision to show.
                user.getSellerApprovalStatus() == SellerApprovalStatus.REJECTED
                        ? user.getSellerApprovalReason()
                        : null,

                dealRepository.countForUserWithStatus(userId, DealStatus.COMPLETED),
                orderRepository.findForBuyer(userId).size(),
                listingRepository.countBySellerIdAndDeletedFalseAndStatusIn(
                        userId, List.of(ListingStatus.DRAFT)),
                reviewRepository.averageRatingFor(userId) == null
                        ? 0d : reviewRepository.averageRatingFor(userId),
                reviewRepository.countByRevieweeId(userId),

                against.size(),
                against.stream().limit(5).map(r -> new ModerationDtos.ApplicantReportDto(
                        r.getId(),
                        r.getReason().name(),
                        r.getDetails(),
                        r.getStatus().name(),
                        r.getResolution() == null ? null : r.getResolution().name(),
                        r.getCreatedAt())).toList());
    }

    // ------------------------------------------------------------------ workflow 21

    @Transactional
    public AdminUserDto setVerified(Principal principal, UUID userId, boolean verified, String reason) {
        accessGuard.requireAdmin(principal);
        User admin = principal.user();

        User target = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("That member no longer exists."));
        String note = trimToNull(reason);

        target.setVerified(verified);

        /*
         * Verification unseals the order details withheld from them while they
         * were unproven - the "unless/until they're verified" half of the hold.
         *
         * Only ever forwards. Removing a badge does not re-hide what they have
         * already read, because it cannot: they have seen it. Pretending
         * otherwise would leave the thread lying to whoever opened it next.
         */
        int unsealed = verified ? messageRepository.releaseWithheldForSeller(target.getId()) : 0;

        auditService.record(admin,
                verified ? AuditAction.VERIFY_USER : AuditAction.UNVERIFY_USER,
                "user", target.getId(), note,
                verified
                        ? "Granted the verified badge."
                                + (unsealed == 0 ? ""
                                        : " Released " + unsealed + " withheld order message(s).")
                        : "Removed the verified badge.");

        notificationService.notify(
                target,
                NotificationType.MODERATION,
                verified ? "You are now a verified member" : "Your verified badge was removed",
                verified
                        ? "Your account has been verified by the CampusMarket team."
                                + (unsealed == 0 ? ""
                                        : " Orders our team handled for you are now visible in "
                                                + "your messages.")
                        : "Your verified badge has been removed"
                                + (note == null ? "." : ": " + note),
                null);

        return adminUser(target);
    }

    // --------------------------------------------------------------- catalogue

    /**
     * Every listing, for the admin catalogue screen.
     *
     * <p>Unlike public browse this deliberately includes drafts, sold items and
     * soft-deleted rows: the point of the screen is to see what is actually in
     * the database, and a moderator hunting a listing someone complained about
     * needs to find it whatever state it is in.
     *
     * @param query optional title match
     * @param includeRemoved whether soft-deleted rows are included
     */
    @Transactional(readOnly = true)
    public List<ListingDto> allListings(Principal principal, String query, boolean includeRemoved) {
        accessGuard.requireAdmin(principal);

        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);

        return listingRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .filter(l -> includeRemoved || !l.isDeleted())
                .filter(l -> needle.isEmpty() || l.getTitle().toLowerCase(Locale.ROOT).contains(needle))
                .limit(MAX_ADMIN_LISTINGS)
                .map(listing -> mapper.listing(listing, principal, Set.of()))
                .toList();
    }

    // --------------------------------------------------------- special offers

    /** Everything currently on the shelf, freshest promotion first. */
    @Transactional(readOnly = true)
    public List<ListingDto> specialOffers(Principal principal) {
        accessGuard.requireAdmin(principal);
        return listingRepository.findBySpecialOfferTrueAndDeletedFalseOrderBySpecialOfferAtDesc()
                .stream()
                .map(listing -> mapper.listing(listing, principal, Set.of()))
                .toList();
    }

    /**
     * Put a listing on the Special Offers shelf, or take it off.
     *
     * <p>Admin-only by design: the shelf is the one place on the home feed that
     * promises a genuinely good price, and a seller who could promote their own
     * listing would empty that promise within a day.
     *
     * @param compareAtPrice the usual price, shown struck through. Rejected if
     *   it is not above the asking price - a "was" that is lower is not a
     *   discount, and rendering it as one would mislead every buyer who sees it.
     */
    @Transactional
    public ListingDto setSpecialOffer(Principal principal,
                                      UUID listingId,
                                      boolean featured,
                                      BigDecimal compareAtPrice) {
        accessGuard.requireAdmin(principal);

        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> ApiException.notFound("That listing no longer exists."));

        if (listing.isDeleted()) {
            throw ApiException.badRequest("LISTING_REMOVED",
                    "That listing has been removed and cannot be promoted.");
        }

        if (featured) {
            if (listing.getStatus() != ListingStatus.ACTIVE) {
                throw ApiException.badRequest("LISTING_NOT_ACTIVE",
                        "Only an active listing can go on the offers shelf.");
            }
            if (compareAtPrice != null) {
                if (compareAtPrice.signum() <= 0) {
                    throw ApiException.badRequest("INVALID_COMPARE_PRICE",
                            "The usual price must be more than zero.");
                }
                if (compareAtPrice.compareTo(listing.getPrice()) <= 0) {
                    throw ApiException.badRequest("INVALID_COMPARE_PRICE",
                            "The usual price has to be higher than the offer price.");
                }
            }
            listing.setCompareAtPrice(compareAtPrice);
            // Re-promoting an item refreshes its place at the front of the
            // shelf, which is the only way to reorder without a drag handle.
            listing.setSpecialOfferAt(Instant.now());
        } else {
            // Clearing the comparison too: a stale "was K200" left on a listing
            // that is no longer an offer is a false claim waiting to resurface.
            listing.setCompareAtPrice(null);
            listing.setSpecialOfferAt(null);
        }
        listing.setSpecialOffer(featured);
        listingRepository.save(listing);

        auditService.record(principal.user(), AuditAction.SET_SPECIAL_OFFER,
                "listing", listing.getId(), null,
                (featured ? "Added \"" : "Removed \"") + listing.getTitle()
                        + (featured ? "\" to special offers." : "\" from special offers."));

        return mapper.listing(listing, principal, Set.of());
    }

    // -------------------------------------------------------- seller approval

    /** The approval queue: accounts asking to sell, longest-waiting first. */
    @Transactional(readOnly = true)
    public List<AdminUserDto> pendingSellers(Principal principal) {
        accessGuard.requireAdmin(principal);
        return userRepository
                .findBySellerApprovalStatusOrderBySellerRequestedAtAsc(SellerApprovalStatus.PENDING)
                .stream()
                .map(this::adminUser)
                .toList();
    }

    /**
     * Lets an account start listing.
     *
     * <p>Approval is only the entry gate. It does NOT grant the verified badge,
     * so a freshly approved seller can list but their incoming orders are still
     * withheld for review - two gates, deliberately separate.
     */
    @Transactional
    public AdminUserDto approveSeller(Principal principal, UUID userId, String reason) {
        accessGuard.requireAdmin(principal);
        User admin = principal.user();

        User target = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("That member no longer exists."));
        String note = trimToNull(reason);

        if (target.getSellerApprovalStatus() == SellerApprovalStatus.APPROVED) {
            // Two moderators can hold the same queue; the second is told rather
            // than silently re-approving and writing a duplicate audit entry.
            throw ApiException.conflict("SELLER_ALREADY_REVIEWED",
                    target.getName() + " is already approved to sell.");
        }

        target.setAccountType(AccountType.SELLER);
        target.setSellerApprovalStatus(SellerApprovalStatus.APPROVED);
        target.setSellerApprovalReason(null);
        target.setSellerReviewedAt(Instant.now());

        auditService.record(admin, AuditAction.APPROVE_SELLER,
                "user", target.getId(), note, "Approved to sell.");

        notificationService.notify(target, NotificationType.MODERATION,
                "You're approved to sell",
                "Your seller account is active - you can post listings now. Orders "
                        + "are reviewed by our team until your account is verified.",
                "/sell");

        return adminUser(target);
    }

    /** Refuses an application. Not permanent - they may apply again. */
    @Transactional
    public AdminUserDto rejectSeller(Principal principal, UUID userId, String reason) {
        accessGuard.requireAdmin(principal);
        User admin = principal.user();

        User target = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("That member no longer exists."));

        // A refusal without a reason is not actionable for the applicant and
        // tells a future moderator nothing, so it is required here.
        String note = trimToNull(reason);
        if (note == null) {
            throw ApiException.badRequest("REASON_REQUIRED",
                    "Give a reason - it is shown to the applicant and recorded in the audit log.");
        }

        target.setSellerApprovalStatus(SellerApprovalStatus.REJECTED);
        target.setSellerApprovalReason(note);
        target.setSellerReviewedAt(Instant.now());

        auditService.record(admin, AuditAction.REJECT_SELLER,
                "user", target.getId(), note, "Seller application refused.");

        notificationService.notify(target, NotificationType.MODERATION,
                "Your seller application wasn't approved",
                note, null);

        return adminUser(target);
    }

    // ------------------------------------------------------------------ dashboard

    @Transactional(readOnly = true)
    public AdminStatsDto stats(Principal principal) {
        accessGuard.requireAdmin(principal);

        // UserRepository has no countByStatus, so the status split is derived from the
        // single user query rather than issuing three separate counts.
        List<User> users = userRepository.findAllByOrderByCreatedAtDesc();
        long suspended = users.stream().filter(u -> u.getStatus() == UserStatus.SUSPENDED).count();
        long banned = users.stream().filter(u -> u.getStatus() == UserStatus.BANNED).count();

        List<AuditLogDto> recent = auditLogRepository
                .findAllByOrderByCreatedAtDesc(PageRequest.of(0, RECENT_AUDIT_LOG_COUNT))
                .stream()
                .map(mapper::auditLog)
                .toList();

        return new AdminStatsDto(
                users.size(),
                listingRepository.countByDeletedFalseAndStatusIn(ACTIVE_LISTING_STATUSES),
                dealRepository.countByStatus(DealStatus.COMPLETED),
                reportRepository.countByStatus(ReportEnums.Status.PENDING),
                suspended,
                banned,
                userRepository.countBySellerApprovalStatus(SellerApprovalStatus.PENDING),
                orderRepository.countByStatus(OrderStatus.HELD),
                recent);
    }

    @Transactional(readOnly = true)
    public List<AdminUserDto> listUsers(Principal principal) {
        accessGuard.requireAdmin(principal);

        Map<UUID, Long> activeListings = activeListingCountsBySeller();
        return userRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(user -> adminUser(user, activeListings.getOrDefault(user.getId(), 0L)))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AuditLogDto> auditLogs(Principal principal) {
        accessGuard.requireAdmin(principal);
        return auditLogRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(mapper::auditLog)
                .toList();
    }

    // ------------------------------------------------------------------ internals

    /**
     * Applies the ban to the account and records it, but leaves session revocation to
     * the caller: {@link UserSessionRepository#revokeAllForUser} is a bulk update that
     * clears the persistence context, so it has to be the last write in the unit of work.
     */
    private void applyBan(User admin, User target, String reason) {
        target.setStatus(UserStatus.BANNED);
        target.setSuspendedUntil(null);
        target.setStatusReason(reason);

        auditService.record(admin, AuditAction.BAN_USER, "user", target.getId(), reason,
                "Account banned permanently. Sessions revoked; listings retained but hidden from browse.");
    }

    /**
     * Closes out a suspension or ban: kills every live session so the block takes
     * effect on the very next request (RBAC rule 7), then re-reads the account
     * because the bulk update detached everything loaded so far.
     */
    private AdminUserDto finishRestriction(UUID userId) {
        revokeSessions(userId);
        User fresh = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("That member no longer exists."));
        return adminUser(fresh);
    }

    private void revokeSessions(UUID userId) {
        userSessionRepository.revokeAllForUser(userId, Instant.now());
    }

    private User requireModeratableTarget(User admin, UUID userId, String verb) {
        if (userId == null) {
            throw ApiException.badRequest("Tell us which member to " + verb + ".");
        }
        User target = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("That member no longer exists."));
        requireModeratable(admin, target, verb);
        return target;
    }

    /**
     * An admin may not restrict themselves or a fellow admin. Locking the console
     * operators out of their own console is not a recoverable state, and demoting an
     * admin is a separate concern from moderation (workflow 20).
     */
    private void requireModeratable(User admin, User target, String verb) {
        if (target.getId().equals(admin.getId())) {
            throw ApiException.forbidden(
                    "SELF_MODERATION_BLOCKED",
                    "You cannot " + verb + " your own account.",
                    Map.of("targetId", target.getId()));
        }
        if (target.getRole() == Role.ADMIN) {
            throw ApiException.forbidden(
                    "ADMIN_TARGET_BLOCKED",
                    "Administrator accounts cannot be suspended or banned.",
                    Map.of("targetId", target.getId(), "targetRole", Role.ADMIN.name()));
        }
    }

    /**
     * One query for the whole user table instead of a count per row.
     * ListingRepository exposes no count-by-seller method, so the live listings are
     * fetched through the specification executor and grouped in memory.
     */
    private Map<UUID, Long> activeListingCountsBySeller() {
        Specification<Listing> live = (root, query, cb) -> cb.and(
                cb.equal(root.get("deleted"), false),
                root.get("status").in(ACTIVE_LISTING_STATUSES));

        return listingRepository.findAll(live).stream()
                .collect(Collectors.groupingBy(
                        listing -> listing.getSeller().getId(), Collectors.counting()));
    }

    private long activeListingCount(UUID sellerId) {
        return listingRepository.findBySellerIdAndDeletedFalseOrderByCreatedAtDesc(sellerId).stream()
                .filter(listing -> listing.getStatus().countsAsActiveForSellerState())
                .count();
    }

    private AdminUserDto adminUser(User user) {
        return adminUser(user, activeListingCount(user.getId()));
    }

    private AdminUserDto adminUser(User user, long activeListings) {
        return new AdminUserDto(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole().name(),
                user.getStatus().name(),
                user.isEmailVerified(),
                user.isVerified(),
                user.getAccountType().name(),
                user.getSellerApprovalStatus().name(),
                user.getSellerApprovalReason(),
                user.getSellerRequestedAt(),
                user.getCampusZone() == null ? null : user.getCampusZone().name(),
                user.getSuspendedUntil(),
                user.getStatusReason(),
                user.getDepartment(),
                activeListings,
                user.getCreatedAt());
    }

    private ResolutionAction parseAction(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ApiException.badRequest("Choose how to resolve this report.");
        }
        try {
            return ResolutionAction.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw ApiException.badRequest("Resolve a report by dismissing it, removing the listing, or banning the member.");
        }
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
