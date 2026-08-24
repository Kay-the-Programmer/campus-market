package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "listings")
@Getter
@Setter
@NoArgsConstructor
public class Listing {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "seller_id", nullable = false)
    private User seller;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ListingType type;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String description = "";

    @Column(nullable = false)
    private BigDecimal price;

    @Column(name = "price_unit")
    private String priceUnit;

    @ManyToOne
    @JoinColumn(name = "category_id")
    private Category category;

    /** Free-text meetup spot, e.g. "Hall 4 Dorms" - the precise place. */
    private String location;

    /** Coarse campus zone, used for filtering. Nullable for pre-V3 rows. */
    @Enumerated(EnumType.STRING)
    @Column(name = "campus_zone")
    private CampusZone campusZone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ListingStatus status = ListingStatus.ACTIVE;

    /** Soft delete - preserves chat/deal history references (workflow 8). */
    @Column(nullable = false)
    private boolean deleted = false;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    // --- product-specific ---
    @Enumerated(EnumType.STRING)
    @Column(name = "condition")
    private ListingCondition condition;

    private String brand;

    // --- service-specific ---
    private String availability;

    @Enumerated(EnumType.STRING)
    @Column(name = "rate_type")
    private RateType rateType;

    /** Services only: whether a time has to be booked or the buyer just calls
     *  in. Null on products, which have no such notion. */
    @Enumerated(EnumType.STRING)
    @Column(name = "service_mode", length = 16)
    private ServiceMode serviceMode;

    // --- food-specific ---
    private Integer quantity;

    @Column(name = "pickup_window")
    private String pickupWindow;

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "listing_dietary_tags", joinColumns = @JoinColumn(name = "listing_id"))
    @Column(name = "tag", nullable = false)
    private Set<String> dietaryTags = new LinkedHashSet<>();

    @OneToMany(mappedBy = "listing", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("position ASC")
    private List<ListingImage> images = new ArrayList<>();

    /**
     * On the admin-curated Special Offers shelf.
     *
     * <p>Set by an admin, never by the seller - otherwise every listing would
     * promote itself and the shelf would mean nothing.
     */
    @Column(name = "special_offer", nullable = false)
    private boolean specialOffer = false;

    /** The usual price, shown struck through. Null when there is no honest
     *  "was" figure to quote. */
    @Column(name = "compare_at_price")
    private BigDecimal compareAtPrice;

    @Column(name = "special_offer_at")
    private Instant specialOfferAt;

    @Column(name = "views_count", nullable = false)
    private int viewsCount = 0;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public void addImage(String url) {
        ListingImage image = new ListingImage();
        image.setListing(this);
        image.setUrl(url);
        image.setPosition(images.size());
        images.add(image);
    }

    /** Visible in public browse/search - not deleted, not draft, not sold. */
    public boolean isPubliclyVisible() {
        return !deleted && status.isPubliclyVisible();
    }
}
