package com.campusmarket.service;

import com.campusmarket.config.AppProperties;
import com.campusmarket.domain.AuditAction;
import com.campusmarket.domain.EmailCampaign;
import com.campusmarket.repository.EmailCampaignRepository;
import com.campusmarket.security.AccessGuard;
import com.campusmarket.security.Principal;
import com.campusmarket.web.error.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.UUID;

/**
 * Records an admin-composed campaign and hands it off to be sent.
 *
 * <p>The sending itself lives in {@link EmailCampaignSender}, a separate bean
 * rather than a method here. That split is not organisational tidiness: Spring's
 * {@code @Async} works through a proxy, so a call from one method of this class
 * to an {@code @Async} method of the same class would quietly bypass it and run
 * the whole campaign on the request thread - a send that should return in
 * milliseconds would instead hold the HTTP connection open for minutes. Calling
 * across beans keeps the proxy in the path.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailCampaignService {

    private final EmailCampaignRepository campaignRepository;
    private final EmailCampaignSender sender;
    private final Mailer mailer;
    private final AppProperties properties;
    private final AccessGuard accessGuard;
    private final AuditService auditService;

    /**
     * How many addresses a campaign would reach right now.
     *
     * <p>Exposed so the admin console can say "this goes to 214 people" before
     * anything is sent. Nobody should have to send a campaign to find out how
     * large it was.
     */
    @Transactional(readOnly = true)
    public int countRecipients(Principal principal, EmailCampaign.Audience audience) {
        accessGuard.requireAdmin(principal);
        return sender.recipients(audience).size();
    }

    /**
     * Validates, records, and queues the campaign.
     *
     * <p>Returns as soon as the row is committed rather than when the mail is
     * delivered: an audience paced at a batch a second takes longer than any
     * HTTP request should be held open. The caller gets a campaign back and
     * polls {@link #recent()} for the counts.
     */
    @Transactional
    public EmailCampaign createAndSend(Principal principal, String subject, String body,
                                       EmailCampaign.Audience audience) {
        accessGuard.requireAdmin(principal);

        if (subject == null || subject.isBlank()) {
            throw ApiException.badRequest("SUBJECT_REQUIRED", "A campaign needs a subject.");
        }
        if (body == null || body.isBlank()) {
            throw ApiException.badRequest("BODY_REQUIRED", "A campaign needs a message.");
        }

        EmailCampaign campaign = new EmailCampaign();
        campaign.setSubject(subject.trim());
        campaign.setBody(body.trim());
        campaign.setAudience(audience == null ? EmailCampaign.Audience.ALL : audience);
        campaign.setCreatedBy(principal.user());

        /*
         * Both refusals happen up front rather than being queued and failing
         * later. An admin who presses Send wants to know now that nothing left
         * the building - and a campaign recorded as SENT when it only reached a
         * log file is a record that lies.
         */
        String blocker = blocker();
        if (blocker != null) {
            campaign.setStatus(EmailCampaign.Status.FAILED);
            campaign.setError(blocker);
            log.warn("Campaign refused before sending: {}", blocker);
            return campaignRepository.save(campaign);
        }

        campaign.setStatus(EmailCampaign.Status.SENDING);
        EmailCampaign saved = campaignRepository.save(campaign);

        /*
         * Recorded in the same transaction as the campaign row, the way every
         * other admin action is: if the send is remembered, so is who ordered
         * it. The audience goes in the details because "sent an announcement"
         * without it answers nothing later.
         */
        auditService.record(principal.user(), AuditAction.SEND_CAMPAIGN,
                "email_campaign", saved.getId(), null,
                "%s (audience: %s)".formatted(saved.getSubject(), saved.getAudience()));

        sendAfterCommit(saved.getId());
        return saved;
    }

    /**
     * Queues the send for after this transaction commits.
     *
     * <p>Not a refinement - submitting directly would be a race. The sender
     * re-reads the campaign by id on another thread, and an executor with an
     * idle worker starts the task immediately, so the read can happen while
     * this transaction is still open. It would then find no row and log the
     * campaign as having vanished, while the admin sees a successful response
     * and no mail ever goes out.
     *
     * <p>Same reasoning and same mechanism as NotificationService uses for
     * push: nothing outside the transaction may observe a row until the
     * transaction that wrote it has committed.
     */
    private void sendAfterCommit(UUID campaignId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            sender.deliver(campaignId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                sender.deliver(campaignId);
            }
        });
    }

    /** @return why a send cannot start, or null when it can. */
    private String blocker() {
        if (!mailer.isEnabled()) {
            return "No SMTP is configured, so nothing was sent. Set SPRING_MAIL_HOST "
                    + "(plus username and password) and CAMPUSMARKET_MAIL_FROM.";
        }
        String base = properties.getAppBaseUrl();
        if (base == null || base.isBlank()) {
            // Without a base URL there is no unsubscribe link for the footer,
            // and a campaign with no way out is the one thing that must never
            // be sent - it earns spam complaints instead of unsubscribes.
            return "CAMPUSMARKET_APP_BASE_URL is not set, so no unsubscribe link could "
                    + "be built. Nothing was sent.";
        }
        return null;
    }

    @Transactional(readOnly = true)
    public List<EmailCampaign> recent(Principal principal) {
        accessGuard.requireAdmin(principal);
        return campaignRepository.findTop50ByOrderByCreatedAtDesc();
    }
}
