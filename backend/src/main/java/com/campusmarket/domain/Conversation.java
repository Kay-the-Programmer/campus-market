package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Pinned to a listing; unique per (listing, buyer, seller) - workflow 15. */
@Entity
@Table(name = "conversations")
@Getter
@Setter
@NoArgsConstructor
public class Conversation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "listing_id", nullable = false)
    private Listing listing;

    @ManyToOne(optional = false)
    @JoinColumn(name = "buyer_id", nullable = false)
    private User buyer;

    @ManyToOne(optional = false)
    @JoinColumn(name = "seller_id", nullable = false)
    private User seller;

    /**
     * The admin who brokered this thread by fulfilling a held order, if any.
     *
     * <p>Null for every ordinary conversation. Where it is set, the admin is a
     * genuine participant - they handled the goods - and so can read and write
     * here despite not being the buyer or the seller.
     */
    @ManyToOne
    @JoinColumn(name = "mediator_admin_id")
    private User mediatorAdmin;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "last_message_at", nullable = false)
    private Instant lastMessageAt = Instant.now();

    public boolean isMediated() {
        return mediatorAdmin != null;
    }

    /**
     * Participation, which is what read and write access is checked against.
     *
     * <p>The mediating admin counts. They are not a bystander with a master
     * key - they supplied the goods for this order, and the buyer needs to
     * arrange collection with the person actually holding them.
     */
    public boolean involves(UUID userId) {
        return buyer.getId().equals(userId)
                || seller.getId().equals(userId)
                || (mediatorAdmin != null && mediatorAdmin.getId().equals(userId));
    }

    /**
     * Who the other person is, from one participant's point of view.
     *
     * <p>Only meaningful for the two trading parties. A mediating admin has two
     * counterparties, not one, so this answers with the buyer for them - the
     * side they are actually arranging handover with.
     */
    public User counterpartyOf(UUID userId) {
        if (mediatorAdmin != null && mediatorAdmin.getId().equals(userId)) {
            return buyer;
        }
        return buyer.getId().equals(userId) ? seller : buyer;
    }
}
