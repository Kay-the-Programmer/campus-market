package com.campusmarket.web;

import com.campusmarket.domain.EmailCampaign;
import com.campusmarket.security.AuthPrincipal;
import com.campusmarket.security.Principal;
import com.campusmarket.service.EmailCampaignService;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Admin-only: compose a campaign, see what previous ones did.
 *
 * <p>Under {@code /api/admin} so it sits with the rest of the console and
 * inherits nothing surprising about auth - every method's first act, inside
 * the service, is {@code requireAdmin}.
 */
@RestController
@RequestMapping("/api/admin/campaigns")
@RequiredArgsConstructor
public class EmailCampaignController {

    private final EmailCampaignService campaignService;

    public record CreateCampaignRequest(String subject, String body, String audience) {}

    /** What one campaign looks like to the console. */
    public record CampaignDto(
            UUID id,
            String subject,
            String body,
            String audience,
            String status,
            int recipientCount,
            int sentCount,
            int failedCount,
            String error,
            Instant createdAt,
            Instant sentAt
    ) {}

    /**
     * Size of an audience without sending anything.
     *
     * <p>A GET with no side effects, so the composer can show the number
     * before the admin commits to it.
     */
    @GetMapping("/audience")
    public Map<String, Object> audienceSize(@AuthPrincipal Principal principal,
                                            @RequestParam(defaultValue = "ALL") String audience) {
        EmailCampaign.Audience parsed = parseAudience(audience);
        return Map.of(
                "audience", parsed.name(),
                "recipientCount", campaignService.countRecipients(principal, parsed));
    }

    @GetMapping
    public Map<String, Object> list(@AuthPrincipal Principal principal) {
        List<CampaignDto> campaigns = campaignService.recent(principal).stream()
                .map(EmailCampaignController::toDto)
                .toList();
        return Map.of("campaigns", campaigns);
    }

    /**
     * Records the campaign and starts sending.
     *
     * <p>Answers as soon as the row is committed, with the campaign in
     * SENDING - the mail is still going out when this returns. The console
     * re-reads the list for the counts rather than waiting here, because an
     * audience paced at a batch a second outlasts any sensible request
     * timeout.
     */
    @PostMapping
    public Map<String, Object> send(@AuthPrincipal Principal principal,
                                    @RequestBody CreateCampaignRequest request) {
        EmailCampaign campaign = campaignService.createAndSend(
                principal, request.subject(), request.body(), parseAudience(request.audience()));
        return Map.of("success", true, "campaign", toDto(campaign));
    }

    /**
     * Rejects an unknown segment rather than silently sending to ALL, which is
     * the one wrong answer here: a typo in the audience must not become a mail
     * to everybody.
     */
    private EmailCampaign.Audience parseAudience(String raw) {
        if (raw == null || raw.isBlank()) {
            return EmailCampaign.Audience.ALL;
        }
        try {
            return EmailCampaign.Audience.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("UNKNOWN_AUDIENCE",
                    "Unknown audience. Use one of: ALL, BUYERS, SELLERS, APPROVED_SELLERS.");
        }
    }

    private static CampaignDto toDto(EmailCampaign c) {
        return new CampaignDto(
                c.getId(),
                c.getSubject(),
                c.getBody(),
                c.getAudience().name(),
                c.getStatus().name(),
                c.getRecipientCount(),
                c.getSentCount(),
                c.getFailedCount(),
                c.getError(),
                c.getCreatedAt(),
                c.getSentAt());
    }
}
