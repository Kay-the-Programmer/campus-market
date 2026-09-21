package com.campusmarket.web;

import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.AdminService;
import com.campusmarket.service.OrderService;
import com.campusmarket.service.SellerApplicationChatService;
import com.campusmarket.web.dto.CommerceDtos.OrderDto;
import com.campusmarket.web.dto.CommerceDtos.FulfilledOrderDto;
import com.campusmarket.web.dto.ListingDtos.ListingDto;
import com.campusmarket.web.dto.ModerationDtos.AdminStatsDto;
import com.campusmarket.web.dto.ModerationDtos.AuditLogDto;
import com.campusmarket.web.dto.ModerationDtos.ReportDto;
import com.campusmarket.web.dto.UserDtos.AdminUserDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The moderation console (workflows 19, 20 and 21).
 *
 * <p>Every handler delegates straight to {@link AdminService}, which re-checks the
 * admin role server-side. Nothing here is gated by the URL prefix alone.
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private static final ResolveReportRequest EMPTY_RESOLVE = new ResolveReportRequest(null, null);
    private static final SuspendRequest EMPTY_SUSPEND = new SuspendRequest(null, null);
    private static final ReasonRequest EMPTY_REASON = new ReasonRequest(null);

    private final AdminService adminService;
    /** Held-order review is an admin surface, so its endpoints live here. */
    private final OrderService orderService;
    private final SellerApplicationChatService applicationChat;

    public record ResolveReportRequest(String action, String reason) {}

    public record SuspendRequest(String reason, Integer durationDays) {}

    public record ReasonRequest(String reason) {}

    // ------------------------------------------------------------------ reports

    @GetMapping("/reports")
    public List<ReportDto> reports(@AuthPrincipal Principal principal,
                                   @RequestParam(required = false) String status) {
        return adminService.listReports(principal, status);
    }

    @PostMapping("/reports/{id}/resolve")
    public ReportDto resolveReport(@AuthPrincipal Principal principal,
                                   @PathVariable UUID id,
                                   @RequestBody(required = false) ResolveReportRequest request) {
        ResolveReportRequest body = request == null ? EMPTY_RESOLVE : request;
        return adminService.resolveReport(principal, id, body.action(), body.reason());
    }

    // ------------------------------------------------------------------ members

    @PostMapping("/users/{id}/suspend")
    public AdminUserDto suspend(@AuthPrincipal Principal principal,
                                @PathVariable UUID id,
                                @RequestBody(required = false) SuspendRequest request) {
        SuspendRequest body = request == null ? EMPTY_SUSPEND : request;
        return adminService.suspend(principal, id, body.reason(), body.durationDays());
    }

    @PostMapping("/users/{id}/ban")
    public AdminUserDto ban(@AuthPrincipal Principal principal,
                            @PathVariable UUID id,
                            @RequestBody(required = false) ReasonRequest request) {
        ReasonRequest body = request == null ? EMPTY_REASON : request;
        return adminService.ban(principal, id, body.reason());
    }

    @PostMapping("/users/{id}/reinstate")
    public AdminUserDto reinstate(@AuthPrincipal Principal principal,
                                  @PathVariable UUID id,
                                  @RequestBody(required = false) ReasonRequest request) {
        ReasonRequest body = request == null ? EMPTY_REASON : request;
        return adminService.reinstate(principal, id, body.reason());
    }

    @PostMapping("/users/{id}/verify")
    public AdminUserDto verify(@AuthPrincipal Principal principal,
                               @PathVariable UUID id,
                               @RequestBody(required = false) ReasonRequest request) {
        ReasonRequest body = request == null ? EMPTY_REASON : request;
        return adminService.setVerified(principal, id, true, body.reason());
    }

    @PostMapping("/users/{id}/unverify")
    public AdminUserDto unverify(@AuthPrincipal Principal principal,
                                 @PathVariable UUID id,
                                 @RequestBody(required = false) ReasonRequest request) {
        ReasonRequest body = request == null ? EMPTY_REASON : request;
        return adminService.setVerified(principal, id, false, body.reason());
    }

    // -------------------------------------------------------------- catalogue
    /**
     * The whole catalogue, including drafts, sold items and (optionally) rows
     * that have been removed - a moderator has to be able to find a listing
     * whatever state it is in.
     */
    @GetMapping("/listings")
    public Map<String, Object> listings(@AuthPrincipal Principal principal,
                                        @RequestParam(required = false) String search,
                                        @RequestParam(defaultValue = "false") boolean includeRemoved) {
        return Map.of("listings", adminService.allListings(principal, search, includeRemoved));
    }

    // -------------------------------------------------------- special offers
    /**
     * @param compareAtPrice the usual price for the struck-through comparison;
     *   omit it for an offer with nothing honest to compare against.
     */
    public record SpecialOfferRequest(Boolean featured, BigDecimal compareAtPrice) {}

    @GetMapping("/special-offers")
    public Map<String, Object> specialOffers(@AuthPrincipal Principal principal) {
        return Map.of("listings", adminService.specialOffers(principal));
    }

    @PostMapping("/listings/{id}/special-offer")
    public ListingDto setSpecialOffer(@AuthPrincipal Principal principal,
                                      @PathVariable UUID id,
                                      @RequestBody(required = false) SpecialOfferRequest request) {
        SpecialOfferRequest body = request == null
                ? new SpecialOfferRequest(Boolean.TRUE, null)
                : request;
        // Absent "featured" means promote - the only reason to POST here
        // without saying so is to add something.
        boolean featured = body.featured() == null || body.featured();
        return adminService.setSpecialOffer(principal, id, featured, body.compareAtPrice());
    }

    // ------------------------------------------------------- seller approval
    /** Accounts asking to sell. Approval is the gate on creating any listing. */
    @GetMapping("/sellers/pending")
    public Map<String, Object> pendingSellers(@AuthPrincipal Principal principal) {
        // Unread replies ride along as a side map rather than a field on the
        // row: AdminUserDto is shared with the Users tab, where the count has
        // no meaning, and this keeps the queue to one request.
        return Map.of(
                "sellers", adminService.pendingSellers(principal),
                "unreadMessages", applicationChat.unreadFromApplicants(principal));
    }

    public record ApplicationMessageRequest(String body) {}

    /**
     * The conversation with an applicant, before a decision is made. Opening
     * it marks their messages read.
     */
    @GetMapping("/sellers/{id}/messages")
    public Map<String, Object> applicationThread(@AuthPrincipal Principal principal,
                                                 @PathVariable UUID id) {
        return Map.of("messages", applicationChat.thread(principal, id));
    }

    @PostMapping("/sellers/{id}/messages")
    public Map<String, Object> messageApplicant(@AuthPrincipal Principal principal,
                                                @PathVariable UUID id,
                                                @RequestBody ApplicationMessageRequest request) {
        return Map.of("success", true,
                "message", applicationChat.post(principal, id, request == null ? null : request.body()));
    }

    /** One applicant in full, for the review step before a decision. */
    @GetMapping("/sellers/{id}")
    public Map<String, Object> sellerApplicant(@AuthPrincipal Principal principal,
                                               @PathVariable UUID id) {
        return Map.of("applicant", adminService.sellerApplicant(principal, id));
    }

    /**
     * The same record, reached from user management rather than the seller
     * queue. Verifying, suspending or banning somebody needs exactly what
     * approving them to sell needs - their contact details, their trading
     * history and any complaints - so it reads the one method rather than
     * growing a second, near-identical view of a member.
     */
    @GetMapping("/users/{id}")
    public Map<String, Object> member(@AuthPrincipal Principal principal,
                                      @PathVariable UUID id) {
        return Map.of("member", adminService.sellerApplicant(principal, id));
    }

    @PostMapping("/sellers/{id}/approve")
    public AdminUserDto approveSeller(@AuthPrincipal Principal principal,
                                      @PathVariable UUID id,
                                      @RequestBody(required = false) ReasonRequest request) {
        ReasonRequest body = request == null ? EMPTY_REASON : request;
        return adminService.approveSeller(principal, id, body.reason());
    }

    @PostMapping("/sellers/{id}/reject")
    public AdminUserDto rejectSeller(@AuthPrincipal Principal principal,
                                     @PathVariable UUID id,
                                     @RequestBody(required = false) ReasonRequest request) {
        ReasonRequest body = request == null ? EMPTY_REASON : request;
        return adminService.rejectSeller(principal, id, body.reason());
    }

    // ------------------------------------------------ held-order middleman
    /** Orders withheld from unverified sellers, awaiting a decision. */
    @GetMapping("/orders/held")
    public Map<String, Object> heldOrders(@AuthPrincipal Principal principal) {
        return Map.of("orders", orderService.heldForReview(principal));
    }

    /** Hand the order on to its seller. */
    @PostMapping("/orders/{id}/release")
    public OrderDto releaseOrder(@AuthPrincipal Principal principal,
                                 @PathVariable UUID id,
                                 @RequestBody(required = false) ReasonRequest request) {
        ReasonRequest body = request == null ? EMPTY_REASON : request;
        return orderService.release(principal, id, body.reason());
    }

    /** Supply the goods directly instead of routing to an unverified seller. */
    @PostMapping("/orders/{id}/fulfil")
    public FulfilledOrderDto fulfilOrder(@AuthPrincipal Principal principal,
                                         @PathVariable UUID id,
                                         @RequestBody(required = false) ReasonRequest request) {
        ReasonRequest body = request == null ? EMPTY_REASON : request;
        return orderService.fulfil(principal, id, body.reason());
    }

    @GetMapping("/users")
    public List<AdminUserDto> users(@AuthPrincipal Principal principal) {
        return adminService.listUsers(principal);
    }

    // ------------------------------------------------------------------ dashboard

    @GetMapping("/stats")
    public AdminStatsDto stats(@AuthPrincipal Principal principal) {
        return adminService.stats(principal);
    }

    @GetMapping("/audit-logs")
    public List<AuditLogDto> auditLogs(@AuthPrincipal Principal principal) {
        return adminService.auditLogs(principal);
    }
}
