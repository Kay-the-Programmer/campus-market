package com.campusmarket.service;

import com.campusmarket.domain.Listing;

/**
 * Small facts about a listing that more than one service needs to agree on.
 */
final class Listings {

    private Listings() {
    }

    /**
     * How many of this can be bought at once, or null when the question does
     * not apply - which for products is always.
     *
     * <p>Only food declares a count, because servings are the one quantity a
     * seller is actually asked for. Products used to default to one on the
     * theory that second-hand goods are one-of-one, but nothing in the sell
     * form ever sets a product's quantity, so that "one" was invented here
     * rather than stated by anyone. It turned every product into a listing
     * that refused its second order - and refused it as "there's only one of
     * these", a fact the seller had never claimed.
     *
     * <p>A product now keeps taking orders until its seller marks it sold,
     * which is the only signal that actually means the thing is gone.
     * Services never reach a cart at all.
     */
    static Integer availableStock(Listing listing) {
        if (listing == null) {
            return null;
        }
        return switch (listing.getType()) {
            case FOOD -> listing.getQuantity();
            default -> null;
        };
    }
}
