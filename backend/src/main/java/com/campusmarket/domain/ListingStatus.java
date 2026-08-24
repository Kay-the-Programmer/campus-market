package com.campusmarket.domain;

public enum ListingStatus {
    DRAFT,
    ACTIVE,
    RESERVED,
    SOLD;

    /** Listings that count toward derived seller state (RBAC spec section 1). */
    public boolean countsAsActiveForSellerState() {
        return this == ACTIVE || this == RESERVED;
    }

    /** Listings that appear in public browse/search results (workflow 10). */
    public boolean isPubliclyVisible() {
        return this == ACTIVE || this == RESERVED;
    }
}
