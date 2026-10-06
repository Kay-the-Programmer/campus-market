package com.campusmarket.service.recommend;

import com.campusmarket.domain.CampusZone;
import com.campusmarket.domain.ListingType;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * One thing somebody did to one listing, and how much it says about them.
 *
 * <p>Everything the recommender knows about a person arrives as a list of
 * these. Opening a listing, saving it, putting it in a basket and buying it are
 * the same shape of fact about the same listing - they differ only in weight -
 * so collapsing them here means the profile below has one kind of input to
 * reason about rather than four.
 *
 * <p>Deliberately a flat copy of the listing's facets rather than a reference
 * to the listing. A signal is read long after the fact and is only ever asked
 * what sort of thing it was about; carrying the entity would mean a profile
 * could not be built without loading every listing a person ever opened.
 */
public record Signal(
        UUID listingId,
        UUID categoryId,
        ListingType type,
        BigDecimal price,
        CampusZone zone,
        /** How much this action counts - see {@link Strength}. */
        double weight
) {

    /**
     * What each action is worth.
     *
     * <p>The ladder is intent, not effort: a view is a glance and most of them
     * mean nothing, while an order is somebody having actually parted with
     * money for this kind of thing. Saving and carting sit between, and sit
     * close together, because on a marketplace where most trades are arranged
     * in chat the basket is used as a second shortlist as often as a checkout.
     *
     * <p>The numbers are a ratio, not a scale: only their relation to each
     * other matters, because the profile normalises by its own total.
     */
    public static final class Strength {
        /** They opened it. The weakest signal, and by far the most common. */
        public static final double VIEWED = 1;
        /** They put it on their list to come back to. */
        public static final double SAVED = 4;
        /** They moved towards buying it. */
        public static final double CARTED = 5;
        /** They bought one. The only signal that is evidence rather than interest. */
        public static final double ORDERED = 8;

        private Strength() {
        }
    }

    public static Signal viewed(UUID listingId, UUID categoryId, ListingType type,
                                BigDecimal price, CampusZone zone) {
        return new Signal(listingId, categoryId, type, price, zone, Strength.VIEWED);
    }
}
