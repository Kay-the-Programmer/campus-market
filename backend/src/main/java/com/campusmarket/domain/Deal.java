package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "deals")
@Getter
@Setter
@NoArgsConstructor
public class Deal {

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

    @Column(nullable = false)
    private BigDecimal price;

    @Column(name = "meetup_location")
    private String meetupLocation;

    @Column(name = "meetup_time")
    private Instant meetupTime;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DealStatus status = DealStatus.COMPLETED;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public boolean involves(UUID userId) {
        return buyer.getId().equals(userId) || seller.getId().equals(userId);
    }

    public User counterpartyOf(UUID userId) {
        return buyer.getId().equals(userId) ? seller : buyer;
    }
}
