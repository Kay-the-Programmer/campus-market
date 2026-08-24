package com.campusmarket.domain;

/**
 * What a customer signed up to do. Distinct from {@link Role}, which separates
 * customers from admins: every account here is still {@code Role.CUSTOMER}.
 *
 * <p>This is the stored intent chosen at registration. It gates listing
 * creation - a {@link #BUYER} is refused by
 * {@link com.campusmarket.security.AccessGuard#requireSeller} - but it is not
 * a permanent classification: {@code POST /api/auth/become-seller} upgrades a
 * BUYER in place, so nobody has to create a second account to start selling.
 *
 * <p>Note this is deliberately NOT the same as the "seller state" the
 * navigation keys off. That remains derived (SELLER + hasActiveListings), so
 * the nav still reflects whether someone is actively selling right now, while
 * this field records whether they are allowed to at all.
 */
public enum AccountType {
    BUYER,
    SELLER;

    public boolean canSell() {
        return this == SELLER;
    }
}
