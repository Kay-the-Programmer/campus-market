package com.campusmarket.service;

import com.campusmarket.domain.Listing;
import com.campusmarket.domain.Report;
import com.campusmarket.domain.ReportEnums;
import com.campusmarket.domain.User;
import com.campusmarket.repository.ListingRepository;
import com.campusmarket.repository.ReportRepository;
import com.campusmarket.repository.UserRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.dto.ModerationDtos.ReportDto;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.UUID;

/**
 * Workflow 17 - reporting a listing or another member.
 *
 * <p>Any signed-in account may file a report, admins included: the queue is
 * fed by the community, and moderation of what lands in it happens in
 * {@link AdminService} (workflow 19).
 */
@Service
@RequiredArgsConstructor
public class ReportService {

    private final ReportRepository reportRepository;
    private final ListingRepository listingRepository;
    private final UserRepository userRepository;
    private final AccessGuard accessGuard;
    private final DtoMapper mapper;

    /**
     * Submission response: the stored report plus the confirmation copy the UI
     * shows. Defined here rather than in the shared DTO file because only this
     * workflow needs it.
     */
    public record ReportReceiptDto(ReportDto report, String message) {}

    @Transactional
    public ReportReceiptDto create(Principal principal,
                                   String targetTypeRaw,
                                   UUID targetId,
                                   String reasonRaw,
                                   String details) {
        accessGuard.requireAuthenticated(principal);

        if (targetId == null) {
            throw ApiException.badRequest("Tell us what you are reporting.");
        }
        ReportEnums.TargetType targetType = parseTargetType(targetTypeRaw);
        ReportEnums.Reason reason = parseReason(reasonRaw);

        // The reporter is always the session owner - a reporterId in the body is ignored.
        User reporter = principal.user();

        Report report = new Report();
        report.setReporter(reporter);
        report.setTargetType(targetType);
        report.setReason(reason);
        report.setDetails(trimToNull(details));
        report.setStatus(ReportEnums.Status.PENDING);

        boolean duplicate;
        if (targetType == ReportEnums.TargetType.LISTING) {
            Listing listing = listingRepository.findByIdAndDeletedFalse(targetId)
                    .orElseThrow(() -> ApiException.notFound("That listing is no longer available."));
            if (principal.owns(listing.getSeller().getId())) {
                throw ApiException.badRequest("You cannot report your own listing. Edit or remove it instead.");
            }
            report.setTargetListing(listing);
            duplicate = reportRepository.existsByReporterIdAndTargetListingIdAndStatus(
                    reporter.getId(), listing.getId(), ReportEnums.Status.PENDING);
        } else {
            User target = userRepository.findById(targetId)
                    .orElseThrow(() -> ApiException.notFound("That member no longer exists."));
            if (principal.owns(target.getId())) {
                throw ApiException.badRequest("You cannot report your own account.");
            }
            report.setTargetUser(target);
            duplicate = reportRepository.existsByReporterIdAndTargetUserIdAndStatus(
                    reporter.getId(), target.getId(), ReportEnums.Status.PENDING);
        }

        // A resubmission is never blocked - the reporter may be adding evidence to an
        // open case. It is only flagged so moderators can collapse the queue.
        report.setDuplicate(duplicate);

        Report saved = reportRepository.save(report);

        String message = duplicate
                ? "Thanks. You already have an open report about this, so we have added these details to it."
                : "Thanks for the report. A moderator will review it shortly.";
        return new ReportReceiptDto(toDto(saved, principal), message);
    }

    /**
     * Shared with {@link AdminService} so the moderation queue and the reporter's
     * own confirmation render identically. Must be called inside a transaction -
     * the listing reference resolves lazily loaded images.
     */
    public ReportDto toDto(Report report, Principal viewer) {
        Listing listing = report.getTargetListing();
        User targetUser = report.getTargetUser();

        // The raw title is used rather than the mapper's "Listing removed" placeholder,
        // so a moderator can still see what was reported after the listing is pulled.
        String targetLabel = report.getTargetType() == ReportEnums.TargetType.LISTING
                ? (listing == null ? "Listing no longer available" : listing.getTitle())
                : (targetUser == null ? "Member no longer available" : targetUser.getName());

        return new ReportDto(
                report.getId(),
                mapper.user(report.getReporter(), viewer),
                report.getTargetType().name(),
                report.targetId(),
                targetLabel,
                listing == null ? null : mapper.listingRef(listing),
                mapper.user(targetUser, viewer),
                report.getReason().name(),
                report.getDetails(),
                report.getStatus().name(),
                report.getResolution() == null ? null : report.getResolution().name(),
                report.getResolvedByAdmin() == null ? null : report.getResolvedByAdmin().getName(),
                report.getResolvedAt(),
                report.isDuplicate(),
                report.getCreatedAt());
    }

    private ReportEnums.TargetType parseTargetType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ApiException.badRequest("Tell us what you are reporting.");
        }
        try {
            return ReportEnums.TargetType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw ApiException.badRequest("Reports can only target a listing or a member.");
        }
    }

    private ReportEnums.Reason parseReason(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ApiException.badRequest("Choose a reason for the report.");
        }
        try {
            return ReportEnums.Reason.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw ApiException.badRequest("Choose one of the listed reasons for the report.");
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
