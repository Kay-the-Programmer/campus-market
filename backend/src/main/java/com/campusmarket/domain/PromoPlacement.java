package com.campusmarket.domain;

/** Where a {@link PromoSlot} renders. */
public enum PromoPlacement {
    /** The full-width hero carousel at the top of the home page. */
    CAROUSEL,
    /** The "Special offers" tile grid below it. */
    BENTO,
    /**
     * A wide call-to-action banner on the browse pages - promoting a discount,
     * inviting sellers to join, whatever the campaign is - drawn between rows
     * of results rather than above them.
     *
     * <p>Unlike the other two, these are not all rendered: the browse pages
     * place at most two, and never next to each other. See CtaBanner on the
     * client for that rule.
     */
    CTA_BANNER
}
