package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * A buyer's request to purchase one seller's items.
 *
 * <p>Checkout splits a cart by seller and writes one Order per seller, because
 * each seller has to accept their own half independently - there is no
 * centralised fulfilment that could span them.
 *
 * <p>Distinct from {@link Deal}: an Order is the buyer-initiated request and
 * carries a lifecycle, whereas a Deal is the immutable record written once the
 * handover actually happened. Completing an Order creates the Deal.
 */
@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Short human-facing reference shown in chat and notifications. */
    @Column(name = "reference", nullable = false, unique = true)
    private String reference;

    @ManyToOne(optional = false)
    @JoinColumn(name = "buyer_id", nullable = false)
    private User buyer;

    @ManyToOne(optional = false)
    @JoinColumn(name = "seller_id", nullable = false)
    private User seller;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus status = OrderStatus.PENDING;

    /**
     * Sum of the line totals, snapshotted at placement. Stored rather than
     * recomputed so a later price edit by the seller cannot silently change
     * what the buyer agreed to.
     */
    @Column(nullable = false)
    private BigDecimal total = BigDecimal.ZERO;

    /** Where the buyer wants to meet - defaults to their profile zone. */
    @Enumerated(EnumType.STRING)
    @Column(name = "meetup_zone")
    private CampusZone meetupZone;

    @Column(name = "buyer_note")
    private String buyerNote;

    /** Reason the seller gave when declining, surfaced to the buyer. */
    @Column(name = "seller_note")
    private String sellerNote;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<OrderItem> items = new ArrayList<>();

    /**
     * The admin who supplied the goods directly instead of routing the order on
     * to an unverified seller. Null on every normally-fulfilled order.
     */
    @ManyToOne
    @JoinColumn(name = "fulfilled_by_admin_id")
    private User fulfilledByAdmin;

    /** Admin's note when releasing or fulfilling a held order. */
    @Column(name = "admin_note")
    private String adminNote;

    /** When an admin took a held order off the review queue. */
    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    /** Set when the order first leaves PENDING, for "responded in X" reporting. */
    @Column(name = "responded_at")
    private Instant respondedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public void addItem(OrderItem item) {
        item.setOrder(this);
        items.add(item);
    }

    /** Recomputes {@link #total} from the current lines. Call after adding items. */
    public void recalculateTotal() {
        this.total = items.stream()
                .map(OrderItem::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public boolean involves(UUID userId) {
        return buyer.getId().equals(userId) || seller.getId().equals(userId);
    }

    /**
     * A held order is invisible to its seller, so every seller-facing query and
     * guard has to consult this rather than only checking ownership.
     */
    public boolean isVisibleToSeller() {
        return status != OrderStatus.HELD;
    }
}
