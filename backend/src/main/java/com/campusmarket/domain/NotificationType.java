package com.campusmarket.domain;

public enum NotificationType {
    MESSAGE,
    ORDER,
    SYSTEM,
    MODERATION,
    REVIEW,
    PRICE_DROP,
    /**
     * Something changed about a listing the user saved, other than its price -
     * it sold, came back up for sale, or was restocked.
     *
     * <p>Shares the {@code priceDrops} preference with {@link #PRICE_DROP}
     * rather than adding a switch of its own. Both answer the same question,
     * "do you want to hear about the things you saved?", and splitting them
     * would ask people to reason about a distinction they did not make when
     * they tapped the bookmark.
     */
    SAVED_UPDATE
}
