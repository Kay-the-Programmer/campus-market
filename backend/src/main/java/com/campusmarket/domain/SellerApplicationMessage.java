package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * One message in the thread between an admin and a seller applicant.
 *
 * <p>Keyed on the applicant rather than on an application row, so there is
 * exactly one thread per person however many times they apply - see V12.
 */
@Entity
@Table(name = "seller_application_messages")
@Getter
@Setter
@NoArgsConstructor
public class SellerApplicationMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "applicant_id", nullable = false)
    private User applicant;

    /** Null once the sender's account is gone; {@link #fromAdmin} still says which side wrote it. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id")
    private User sender;

    @Column(name = "from_admin", nullable = false)
    private boolean fromAdmin;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    /** Set when the recipient side opens the thread. Null = unread by them. */
    @Column(name = "read_at")
    private Instant readAt;
}
