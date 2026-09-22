package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A search someone wants to be told about, rather than re-run by hand.
 *
 * <p>Stores the QUERY, not its results. The whole point is the listing that
 * does not exist yet: an empty result set today is precisely the case worth
 * remembering, because the campus will have one of those next week.
 *
 * <p>The filter fields deliberately mirror the ones browse already accepts, so
 * deciding whether a new listing matches reuses the same rules rather than
 * inventing a second and subtly different reading of "under K200".
 */
@Entity
@Table(name = "saved_searches")
@Getter
@Setter
@NoArgsConstructor
public class SavedSearch {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** Free text, or null for a filters-only search. */
    @Column(name = "query")
    private String query;

    /** PRODUCT | SERVICE | FOOD, or null for any. */
    @Column(name = "type")
    private String type;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @Column(name = "campus_zone")
    private String campusZone;

    @Column(name = "min_price")
    private BigDecimal minPrice;

    @Column(name = "max_price")
    private BigDecimal maxPrice;

    /** What to call it in their list. Derived from the filters when unnamed. */
    @Column(name = "label", nullable = false)
    private String label;

    /**
     * Whether new matches should notify.
     *
     * <p>Switched off rather than deleted, so turning alerts off keeps the
     * search in their list to re-run by hand - which is a different thing from
     * no longer wanting it at all.
     */
    @Column(name = "notify", nullable = false)
    private boolean notify = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    /**
     * When a match last fired.
     *
     * <p>Rate-limits alerts per search. Five notifications in a minute is how
     * someone turns notifications off entirely - which costs them every future
     * alert, not just the noisy ones.
     */
    @Column(name = "last_notified_at")
    private Instant lastNotifiedAt;
}
