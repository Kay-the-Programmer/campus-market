package com.campusmarket.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One person opening one listing, once on a given day.
 *
 * <p>Separate from {@code Listing.viewsCount}, which is the lifetime total the
 * seller sees. A counter cannot answer "what is the campus looking at this
 * week" - it has no memory of when it was incremented - so trending needs the
 * timestamps kept. See V14__listing_views.sql for why that is a table of
 * events rather than a second counter.
 *
 * <p>Deliberately not a JPA association on either side. Listings are read in
 * pages of two dozen and none of those reads wants a collection of view rows
 * attached; the only query that touches this table is a grouped count over a
 * date window, which the repository issues directly.
 */
@Entity
@Table(name = "listing_views")
@Getter
@Setter
@NoArgsConstructor
public class ListingView {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    /**
     * Null for a guest, who is most of the traffic on a public catalogue.
     *
     * <p>Used only to de-duplicate repeat views by the same person on the same
     * day - never read back, never shown, and never joined to a user for any
     * other purpose.
     */
    @Column(name = "viewer_id")
    private UUID viewerId;

    /** The de-duplication bucket: one view per viewer per listing per day. */
    @Column(name = "viewed_on", nullable = false)
    private LocalDate viewedOn = LocalDate.now();

    @Column(name = "viewed_at", nullable = false)
    private Instant viewedAt = Instant.now();

    public ListingView(UUID listingId, UUID viewerId) {
        this.listingId = listingId;
        this.viewerId = viewerId;
    }
}
