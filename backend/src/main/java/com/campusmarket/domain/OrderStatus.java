package com.campusmarket.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * Lifecycle of a buyer-placed order.
 *
 * <p>The flow is deliberately seller-driven after placement: a buyer can only
 * create ({@link #PENDING}) or withdraw ({@link #CANCELLED}) an order, while
 * accept/decline/complete belong to the seller. That mirrors how these trades
 * actually happen - the buyer asks, the seller decides whether they still have
 * the item and want to meet.
 */
public enum OrderStatus {
    /**
     * Placed against an unverified seller and withheld from them pending admin
     * review. The seller cannot see it at all in this state - that is the whole
     * point, so a buyer is never exposed to an unvetted seller unmediated.
     *
     * <p>An admin either releases it (becomes {@link #PENDING}, seller takes
     * over) or fulfils it themselves (becomes {@link #COMPLETED}).
     */
    HELD,
    /** Visible to the seller and waiting on their response. */
    PENDING,
    /** Seller agreed to the sale; the two arrange pickup in chat. */
    ACCEPTED,
    /** Seller refused - out of stock, changed their mind, buyer unreachable. */
    DECLINED,
    /** Handover happened. Terminal, and the point at which a Deal is written. */
    COMPLETED,
    /** Withdrawn by the buyer before the seller accepted. */
    CANCELLED;

    private static final Set<OrderStatus> OPEN = EnumSet.of(PENDING, ACCEPTED);

    /**
     * Still needs the seller to act - drives the seller's badge count.
     *
     * <p>{@link #HELD} is deliberately not open: it is waiting on an admin, and
     * the seller cannot even see it, so counting it on their badge would point
     * at something they have no way to action.
     */
    public boolean isOpen() {
        return OPEN.contains(this);
    }

    public boolean isTerminal() {
        return this != HELD && !isOpen();
    }

    /** Waiting on an admin rather than on either trading party. */
    public boolean awaitsAdmin() {
        return this == HELD;
    }
}
