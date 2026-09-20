package com.campusmarket.service;

import com.campusmarket.config.AppProperties;
import com.campusmarket.config.AsyncConfig;
import com.campusmarket.domain.AccountType;
import com.campusmarket.domain.EmailCampaign;
import com.campusmarket.domain.SellerApprovalStatus;
import com.campusmarket.domain.UserStatus;
import com.campusmarket.repository.EmailCampaignRepository;
import com.campusmarket.repository.MarketingRecipient;
import com.campusmarket.repository.NotificationPreferenceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Delivers a campaign, one recipient at a time, off the request thread.
 *
 * <p>Three things this guarantees, because a campaign that gets them wrong
 * damages the sending domain for every other email the app sends - including
 * the transactional ones people actually want:
 *
 * <ul>
 *   <li><b>Consent.</b> Recipients come from a query that filters on
 *       {@code marketing_emails}. There is no path through this class that
 *       mails someone who opted out, and no parameter that overrides it.</li>
 *   <li><b>A working unsubscribe.</b> Every message carries a per-user link
 *       and the RFC 8058 headers that let a mail client offer its own button.
 *       The alternative to an easy unsubscribe is not a bigger list, it is
 *       people pressing "spam" instead - which costs deliverability for
 *       every message the domain sends afterwards.</li>
 *   <li><b>Pacing.</b> Batched with a pause, so a shared provider does not
 *       answer a burst with temporary failures that are indistinguishable
 *       from bad addresses.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailCampaignSender {

    private final EmailCampaignRepository campaignRepository;
    private final NotificationPreferenceRepository preferenceRepository;
    private final Mailer mailer;
    private final AppProperties properties;

    /**
     * Runs on the campaign executor, outside any transaction.
     *
     * <p>NOT_SUPPORTED for the same reason as notification mail, only more so:
     * this can hold its thread for minutes, and doing that while holding a
     * pooled database connection would starve request handling. The three
     * repository calls below each open and close their own short transaction -
     * Spring Data's {@code save} is transactional in its own right, so no
     * outer one is needed.
     */
    @Async(AsyncConfig.CAMPAIGN_EXECUTOR)
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void deliver(UUID campaignId) {
        EmailCampaign campaign = campaignRepository.findById(campaignId).orElse(null);
        if (campaign == null) {
            log.warn("Campaign {} vanished before it could be sent", campaignId);
            return;
        }

        List<MarketingRecipient> audience = recipients(campaign.getAudience());
        int sent = 0;
        int failed = 0;
        String error = null;

        try {
            // Written before the first send, so a campaign that dies partway
            // still records how many it set out to reach. Without it, partial
            // counts are uninterpretable.
            campaign.setRecipientCount(audience.size());
            campaignRepository.save(campaign);

            log.info("Campaign {} ({}): sending to {} recipient(s)",
                    campaignId, campaign.getAudience(), audience.size());

            int batchSize = Math.max(1, properties.getMailBatchSize());
            long pause = Math.max(0, properties.getMailBatchPauseMillis());

            for (int i = 0; i < audience.size(); i++) {
                if (sendOne(campaign, audience.get(i))) {
                    sent++;
                } else {
                    failed++;
                }

                // Pause between batches, not after the last one - no reason to
                // make the final batch wait for nothing.
                boolean endOfBatch = (i + 1) % batchSize == 0;
                if (endOfBatch && i + 1 < audience.size() && pause > 0) {
                    try {
                        Thread.sleep(pause);
                    } catch (InterruptedException e) {
                        // A shutdown mid-campaign. Stop promptly, preserve the
                        // flag, and let finally record what did go out.
                        Thread.currentThread().interrupt();
                        error = "Interrupted during send - the application was shutting down.";
                        break;
                    }
                }
            }
        } catch (RuntimeException e) {
            log.error("Campaign {} failed", campaignId, e);
            error = e.getClass().getSimpleName() + ": " + e.getMessage();
        } finally {
            finish(campaignId, sent, failed, error);
            log.info("Campaign {} finished: {} sent, {} failed", campaignId, sent, failed);
        }
    }

    private boolean sendOne(EmailCampaign campaign, MarketingRecipient recipient) {
        String base = baseUrl();
        String unsubscribeUrl = base + "/api/email/unsubscribe/" + recipient.unsubscribeToken();

        String footerHtml = """
                You are receiving this because you have an account on CampusMarket.
                <a href="%s" style="color:#2563eb;">Unsubscribe from announcements</a> -
                you will still get email about your own orders and messages.
                """.formatted(EmailContent.attr(unsubscribeUrl));
        String footerText = "Unsubscribe from announcements: " + unsubscribeUrl
                + "\nYou will still get email about your own orders and messages.";

        String html = EmailContent.page(
                campaign.getSubject(), campaign.getBody(), firstLine(campaign.getBody()),
                "Open CampusMarket", base, footerHtml);
        String text = EmailContent.text(
                campaign.getSubject(), campaign.getBody(), "Open CampusMarket", base, footerText);

        /*
         * List-Unsubscribe plus List-Unsubscribe-Post is RFC 8058 one-click.
         * Gmail and Outlook render their own unsubscribe control when both are
         * present and POST to the URL without the recipient ever loading a
         * page - which is why the endpoint accepts POST as well as GET. Since
         * 2024 the large mailbox providers expect this on bulk mail, and its
         * absence costs deliverability for everything the domain sends.
         */
        Map<String, String> headers = Map.of(
                "List-Unsubscribe", "<" + unsubscribeUrl + ">",
                "List-Unsubscribe-Post", "List-Unsubscribe=One-Click",
                // Marks the message as bulk so auto-responders stay quiet and
                // filters judge it as the promotional mail it is.
                "Precedence", "bulk");

        return mailer.send(recipient.email(), recipient.name(), campaign.getSubject(),
                html, text, headers);
    }

    /**
     * Consenting recipients, narrowed to the segment.
     *
     * <p>The segment is applied in memory rather than in SQL. The query has
     * already loaded every consenting user - a send visits all of them anyway -
     * so filtering here costs one pass over a list already in hand, and keeps
     * the segment rules readable as Java instead of four near-identical
     * queries or one with nullable enum parameters.
     */
    List<MarketingRecipient> recipients(EmailCampaign.Audience audience) {
        List<MarketingRecipient> all =
                preferenceRepository.findMarketingRecipients(UserStatus.BANNED);
        EmailCampaign.Audience segment =
                audience == null ? EmailCampaign.Audience.ALL : audience;

        return all.stream().filter(r -> switch (segment) {
            case ALL -> true;
            case BUYERS -> r.accountType() == AccountType.BUYER;
            case SELLERS -> r.accountType() == AccountType.SELLER;
            case APPROVED_SELLERS -> r.accountType() == AccountType.SELLER
                    && r.sellerApprovalStatus() == SellerApprovalStatus.APPROVED;
        }).toList();
    }

    private void finish(UUID campaignId, int sent, int failed, String error) {
        campaignRepository.findById(campaignId).ifPresent(c -> {
            c.setSentCount(sent);
            c.setFailedCount(failed);
            c.setSentAt(Instant.now());
            /*
             * SENT even when some messages failed: the campaign ran. A dead
             * mailbox in an audience of hundreds is normal and is exactly what
             * failedCount is for. FAILED is reserved for a send that never got
             * going - nothing delivered and a reason why.
             */
            c.setStatus(sent > 0 || error == null
                    ? EmailCampaign.Status.SENT
                    : EmailCampaign.Status.FAILED);
            c.setError(error);
            campaignRepository.save(c);
        });
    }

    /** Base URL without a trailing slash. Never null here - the caller in
     *  EmailCampaignService refuses to queue a campaign without one. */
    private String baseUrl() {
        String base = properties.getAppBaseUrl();
        return base == null ? "" : base.trim().replaceAll("/+$", "");
    }

    /** Inbox preview text. The first line says more than a truncated blob. */
    private String firstLine(String body) {
        if (body == null) {
            return "";
        }
        String first = body.trim().split("\\R", 2)[0];
        return first.length() > 140 ? first.substring(0, 140) : first;
    }
}
