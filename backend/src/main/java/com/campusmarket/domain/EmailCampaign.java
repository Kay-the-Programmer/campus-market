package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * One admin-composed email sent to a segment of users.
 *
 * <p>A record of what was sent to whom and how it went, kept because "did the
 * announcement go out?" is otherwise unanswerable, and because sending the
 * same campaign twice is the kind of mistake that is only obvious afterwards.
 */
@Entity
@Table(name = "email_campaigns")
@Getter
@Setter
@NoArgsConstructor
public class EmailCampaign {

    /**
     * Who to send to. Deliberately coarse: these are the segments that
     * correspond to something a user actually is, so the recipient query stays
     * a readable WHERE clause rather than a stored filter language.
     *
     * <p>Marketing consent is applied on top of every one of these, so no
     * value here can reach someone who opted out.
     */
    public enum Audience {
        /** Every account that can receive marketing mail. */
        ALL,
        /** Accounts that chose to buy only. */
        BUYERS,
        /** Accounts set up to sell, whatever their approval state. */
        SELLERS,
        /** Sellers cleared to list - the segment worth telling about seller features. */
        APPROVED_SELLERS
    }

    public enum Status {
        DRAFT,
        /**
         * Handed to the executor. Also the state a crashed send is left in -
         * see the note in V10 about there being no resume.
         */
        SENDING,
        SENT,
        /** The send could not start at all, e.g. no SMTP configured. */
        FAILED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // columnDefinition matches the migration's TEXT rather than letting the
    // default varchar(255) stand: ddl-auto is `validate`, so a type the
    // validator disagrees with is a failure to start, not a warning.
    @Column(nullable = false, columnDefinition = "text")
    private String subject;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Audience audience = Audience.ALL;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status = Status.DRAFT;

    /** Addresses resolved at send time, before any delivery was attempted. */
    @Column(name = "recipient_count", nullable = false)
    private int recipientCount = 0;

    @Column(name = "sent_count", nullable = false)
    private int sentCount = 0;

    @Column(name = "failed_count", nullable = false)
    private int failedCount = 0;

    /** Why a FAILED campaign failed, shown back to the admin who sent it. */
    @Column(columnDefinition = "text")
    private String error;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "sent_at")
    private Instant sentAt;
}
