package com.campusmarket.domain;

/**
 * The colour treatment behind a promo slot.
 *
 * <p>A fixed palette rather than free-text CSS on purpose: an admin editing the
 * home page should pick "Green", not type
 * {@code from-[#007d55] via-[#00996b] to-[#00b894]}. It also keeps the home page
 * inside the design system - arbitrary colour input is how a marketplace ends up
 * with an unreadable banner nobody can undo without a deploy.
 *
 * <p>The actual gradients live in the frontend theme map; the backend only
 * stores which one was chosen.
 */
public enum PromoTheme {
    BLUE,
    GREEN,
    PURPLE,
    DARK,
    AMBER
}
