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
        Instant createdAt,
        /**
         * How well the seller filled the listing in, 0..1.
         *
         * <p>Ranking by it is not a judgement about the seller: a listing with
         * no photograph and one line of description cannot be bought from,
         * because nobody can tell what it is. Putting those below the complete
         * ones is what stops the feed leading with rows that waste the tap.
         */
        double completeness
) {

    /** @param photoCount how many photographs, counted for the whole pool at once */
    public static Candidate of(Listing listing, long photoCount) {
        return new Candidate(
                listing.getId(),
                listing.getSeller() == null ? null : listing.getSeller().getId(),
                listing.getCategory() == null ? null : listing.getCategory().getId(),
                listing.getType(),
                listing.getPrice(),
                listing.getCampusZone(),
                listing.getCreatedAt(),
                completenessOf(listing, photoCount));
    }

    /**
     * What a listing has to say for itself.
     *
     * <p>Four things a buyer looks for, weighted by how badly their absence
     * hurts. A photograph is half of it on its own - it is the difference
     * between a listing and a classified ad - and the rest is whether the
     * description says anything, whether the price is answerable, and whether
     * it says where on campus to collect it.
     */
    private static double completenessOf(Listing listing, long photoCount) {
        double score = 0;
        if (photoCount > 0) score += 0.5;
        // More than one angle is worth something, and worth much less than the
        // first one existing at all.
        if (photoCount > 1) score += 0.1;

        String description = listing.getDescription();
        if (description != null && description.trim().length() >= 40) score += 0.2;

        // A service priced on request is complete; a product with no price is not.
        if (listing.getPrice() != null || listing.getType() != ListingType.PRODUCT) score += 0.1;

        if (listing.getCampusZone() != null) score += 0.1;
        return Math.min(score, 1);
    }
}
