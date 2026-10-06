package com.campusmarket.service.recommend;

import com.campusmarket.domain.CampusZone;
import com.campusmarket.domain.Listing;
import com.campusmarket.domain.ListingType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * A listing as the scorer sees it: the handful of facets ranking depends on,
 * and nothing else.
 *
 * <p>Separate from the entity so the scoring is testable without a database,
 * a persistence context or a fixture of twenty unrelated columns - and so that
 * what ranking is allowed to look at is a list one can read in one screen.
 */
public record Candidate(
        UUID id,
        UUID sellerId,
        UUID categoryId,
        ListingType type,
        BigDecimal price,
        CampusZone zone,
        Instant createdAt
) {

    public static Candidate of(Listing listing) {
        return new Candidate(
                listing.getId(),
                listing.getSeller() == null ? null : listing.getSeller().getId(),
                listing.getCategory() == null ? null : listing.getCategory().getId(),
                listing.getType(),
                listing.getPrice(),
                listing.getCampusZone(),
                listing.getCreatedAt());
    }
}
