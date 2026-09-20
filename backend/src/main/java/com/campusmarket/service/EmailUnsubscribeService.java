package com.campusmarket.service;

import com.campusmarket.domain.NotificationPreference;
import com.campusmarket.repository.NotificationPreferenceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Honours an unsubscribe link from a campaign email.
 *
 * <p>Deliberately the smallest thing that can work, and deliberately not
 * behind authentication. A mail client following {@code List-Unsubscribe} has
 * no session, and a person clicking the link in an email is often not signed
 * in on that device - demanding a login before honouring an opt-out is both
 * hostile and, in several jurisdictions, non-compliant. The token in the URL
 * is the authorisation, and it grants exactly one thing.
 *
 * <p>Idempotent, because unsubscribe links get clicked twice, prefetched by
 * mail clients, and followed by link scanners. A second call is a no-op that
 * still reports success - telling someone "you were already unsubscribed" in
 * an error tone invites them to press the spam button instead.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailUnsubscribeService {

    private final NotificationPreferenceRepository preferenceRepository;

    /**
     * Turns off campaign email for whoever owns this token.
     *
     * <p>Only {@code marketingEmails}. Notification email about the user's own
     * orders and messages is a separate consent and is left alone: someone who
     * asked to stop receiving announcements has not asked to stop being told
     * that the thing they bought is ready.
     *
     * @return true if the token matched a user. False means an unknown or
     *         malformed token - reported as a generic outcome to the caller,
     *         never as "no such user", since the endpoint is public and
     *         should not confirm whether a token exists.
     */
    @Transactional
    public boolean unsubscribe(String rawToken) {
        UUID token;
        try {
            token = UUID.fromString(rawToken);
        } catch (IllegalArgumentException | NullPointerException e) {
            return false;
        }

        return preferenceRepository.findByUnsubscribeToken(token)
                .map(this::turnOffMarketing)
                .orElse(false);
    }

    private boolean turnOffMarketing(NotificationPreference preferences) {
        if (preferences.isMarketingEmails()) {
            preferences.setMarketingEmails(false);
            preferences.setUpdatedAt(Instant.now());
            preferenceRepository.save(preferences);
            log.info("User {} unsubscribed from campaign email", preferences.getUserId());
        }
        return true;
    }
}
