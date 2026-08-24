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
        return switch (type) {
            case MESSAGE -> messages;
            case ORDER -> orders;
            case REVIEW -> reviews;
            case PRICE_DROP -> priceDrops;
            case SYSTEM -> systemUpdates;
            case MODERATION -> true;
        };
    }
}
