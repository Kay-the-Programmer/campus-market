package com.campusmarket.domain;

/**
 * How a buyer actually gets a service.
 *
 * <p>The distinction exists because "request a booking" is wrong for a large
 * share of campus services. A tutor needs a slot agreed in advance; someone
 * printing lecture notes just needs you to come by while they are at their
 * desk. Asking the second one to pick a date produces a time nobody honours.
 */
public enum ServiceMode {

    /** A time is agreed before anything happens - tutoring, repairs, haircuts. */
    BOOKING,

    /** Come by while they are around - printing, photocopying, binding. */
    WALK_IN;

    /** Anything unrecognised falls back to booking, the stricter of the two:
     *  asking for a time that was not needed is a smaller failure than
     *  sending someone to a door that was never open. */
    public static ServiceMode parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return BOOKING;
        }
        try {
            return valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return BOOKING;
        }
    }
}
