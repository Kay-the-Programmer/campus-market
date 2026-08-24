package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "messages")
@Getter
@Setter
@NoArgsConstructor
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "conversation_id", nullable = false)
    private Conversation conversation;

    @ManyToOne(optional = false)
    @JoinColumn(name = "sender_id", nullable = false)
    private User sender;

    @Column(nullable = false)
    private String body;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "read_at")
    private Instant readAt;

    /**
     * Set when the recipient has blocked the sender. The message is still stored
     * and delivered to admins, but not surfaced to the recipient - this avoids
     * signalling to a bad actor that they have been blocked (workflow 15).
     */
    @Column(nullable = false)
    private boolean flagged = false;

    @Column(name = "flag_reason")
    private String flagReason;

    /**
     * Order details written into a mediated thread while the seller was still
     * unverified. Invisible to the seller until they are verified; always
     * visible to the buyer and to the mediating admin.
     *
     * <p>Separate from {@link #flagged} on purpose. That one hides a message
     * from its recipient because they blocked the sender; this hides one from
     * the seller because they are not yet trusted with it. Different people,
     * different reasons, lifted by different events.
     */
    @Column(name = "withheld_from_seller", nullable = false)
    private boolean withheldFromSeller = false;
}
