package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Which kinds of activity are allowed to interrupt a user.
 *
 * <p>Rows are created lazily: no row means "all defaults", which is what a
 * brand-new account wants anyway. Callers should go through
 * {@code NotificationPreferenceService.forUser} rather than the repository so
 * the missing-row case is handled in one place.
 *
 * <p>{@link NotificationType#MODERATION} has no switch on purpose - see the
 * comment in {@code V6__push_notifications.sql}.
 */
@Entity
@Table(name = "notification_preferences")
@Getter
@Setter
@NoArgsConstructor
public class NotificationPreference {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "push_enabled", nullable = false)
    private boolean pushEnabled = true;

    /** Master switch for the email channel, the counterpart of pushEnabled. */
    @Column(name = "email_enabled", nullable = false)
    private boolean emailEnabled = true;

    /**
     * Consent for admin-composed campaigns - mail nobody asked for
     * individually. Kept apart from {@link #emailEnabled} so that opting out
     * of announcements does not also stop the email about an order you just
     * placed. See V10 for why this defaults to true and when it should not.
     */
    @Column(name = "marketing_emails", nullable = false)
    private boolean marketingEmails = true;

    /**
     * Lets a mail client honour List-Unsubscribe without a session. Set by the
     * database default on insert, so it is never null for a persisted row.
     */
    @Column(name = "unsubscribe_token", nullable = false, updatable = false)
    private UUID unsubscribeToken = UUID.randomUUID();

    @Column(nullable = false)
    private boolean messages = true;

    @Column(nullable = false)
    private boolean orders = true;

    @Column(nullable = false)
    private boolean reviews = true;

    @Column(name = "price_drops", nullable = false)
    private boolean priceDrops = true;

    @Column(name = "system_updates", nullable = false)
    private boolean systemUpdates = true;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    /**
     * Whether a push may be sent for this kind of activity.
     *
     * <p>The master switch wins over everything - someone who turned push off
     * expects silence, and moderation notices still land in the in-app list.
     * Below it, moderation has no per-type opt-out: an account cannot mute the
     * notices explaining why it has been restricted.
     */
    public boolean allows(NotificationType type) {
        if (!pushEnabled) {
            return false;
        }
        return categoryAllows(type);
    }

    /**
     * Whether an email may be sent for this kind of activity.
     *
     * <p>Same category rules as push, different master switch - the two
     * channels are independently silenceable, which is the whole reason this
     * is a separate method rather than a parameter. Moderation is exempt from
     * the per-category rules here for the same reason as push, but not from
     * {@link #emailEnabled}: someone who has turned email off entirely has
     * asked for no mail, and the notice is still waiting in the app.
     */
    public boolean allowsEmail(NotificationType type) {
        if (!emailEnabled) {
            return false;
        }
        return categoryAllows(type);
    }

    private boolean categoryAllows(NotificationType type) {
        return switch (type) {
            case MESSAGE -> messages;
            case ORDER -> orders;
            case REVIEW -> reviews;
            // One switch for both, because both are "things about what I
            // saved". The column is still named price_drops - renaming it
            // would ripple through the DTO, the request record and the
            // frontend field for no gain the user ever sees.
            case PRICE_DROP, SAVED_UPDATE -> priceDrops;
            case SYSTEM -> systemUpdates;
            case MODERATION -> true;
        };
    }
}
