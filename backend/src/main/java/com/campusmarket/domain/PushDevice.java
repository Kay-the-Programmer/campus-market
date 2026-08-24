package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * A device that has granted notification permission and can be woken by FCM.
 *
 * <p>The token is the identity here, not the row id: FCM rotates tokens on its
 * own schedule and the client re-registers whenever it gets a new one, so
 * lookups go through {@code token} and the row is updated in place.
 */
@Entity
@Table(name = "push_devices")
@Getter
@Setter
@NoArgsConstructor
public class PushDevice {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, unique = true, length = 4096)
    private String token;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PushPlatform platform = PushPlatform.WEB;

    /** Only so a user can tell their devices apart in the settings list. */
    @Column(name = "user_agent")
    private String userAgent;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt = Instant.now();
}
