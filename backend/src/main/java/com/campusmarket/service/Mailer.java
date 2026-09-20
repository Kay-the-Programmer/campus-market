package com.campusmarket.service;

import java.util.Map;

/**
 * Sends one email. The only thing in the app that talks to SMTP.
 *
 * <p>Separate from {@link EmailService}, which is the vocabulary of the auth
 * workflows ("send a verification email"). This is the transport underneath:
 * an address, a subject, two bodies and some headers. Campaigns and
 * notification mail are built on this, and a provider change is a change to
 * {@code spring.mail.*} rather than to any of them.
 */
public interface Mailer {

    /**
     * Whether mail can actually be delivered.
     *
     * <p>Callers use this to decide whether to do the work at all - resolving
     * several thousand recipients for a campaign that cannot be sent is a
     * waste, and telling an admin the campaign "sent" when it only reached a
     * log file is worse.
     */
    boolean isEnabled();

    /**
     * @param html      the rendered body
     * @param text      plain-text alternative; never null - a message with no
     *                  text part scores worse with spam filters and is
     *                  unreadable in clients that refuse HTML
     * @param headers   extra headers, e.g. List-Unsubscribe. May be empty
     * @return true if the provider accepted the message. Acceptance is not
     *         delivery: a provider can accept and later bounce, which this
     *         interface cannot observe
     */
    boolean send(String toEmail, String toName, String subject, String html, String text,
                 Map<String, String> headers);
}
