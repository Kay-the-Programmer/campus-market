package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One listing within an {@link Order}.
 *
 * <p>Title and unit price are copied in rather than read through the listing
 * relation: the listing can later be edited, renamed or soft-deleted, and an
 * order has to keep showing what was actually agreed at the time. The listing
 * reference is kept alongside so the row can still link through when it exists.
 */
@Entity
@Table(name = "order_items")
@Getter
@Setter
@NoArgsConstructor
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    /** Nullable: a seller may hard-remove a listing after the order was placed. */
    @ManyToOne
    @JoinColumn(name = "listing_id")
    private Listing listing;

    /** Snapshot - survives the listing being renamed or removed. */
    @Column(name = "title_snapshot", nullable = false)
    private String titleSnapshot;

    @Column(name = "image_snapshot")
    private String imageSnapshot;

    @Column(name = "unit_price", nullable = false)
    private BigDecimal unitPrice = BigDecimal.ZERO;

    @Column(nullable = false)
    private int quantity = 1;

    public BigDecimal lineTotal() {
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
}
