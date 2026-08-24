package com.campusmarket.security;

import com.campusmarket.domain.Role;
import com.campusmarket.domain.User;

import java.util.UUID;

/**
 * The authenticated caller for one request.
 *
 * <p>{@code hasActiveListings} is recomputed per request rather than stored, so
 * publishing or removing a listing flips a user between the customer and seller
 * navigation immediately (RBAC rules 3 and 7).
 */
public record Principal(User user, boolean hasActiveListings) {

    public static final Principal GUEST = new Principal(null, false);

    public boolean isGuest() {
        return user == null;
    }

    public boolean isAuthenticated() {
        return user != null;
    }

    public boolean isAdmin() {
        return user != null && user.getRole() == Role.ADMIN;
    }

    public boolean isCustomer() {
        return user != null && user.getRole() == Role.CUSTOMER;
    }

    /** Derived state, never a stored role (RBAC spec section 1). */
    public boolean isSeller() {
        return isCustomer() && hasActiveListings;
    }

    public UUID id() {
        return user == null ? null : user.getId();
    }

    public boolean owns(UUID ownerId) {
        return user != null && ownerId != null && ownerId.equals(user.getId());
    }

    /** The role string the frontend renders navigation from. */
    public String roleName() {
        if (user == null) {
            return "guest";
        }
        return user.getRole() == Role.ADMIN ? "admin" : "customer";
    }
}
