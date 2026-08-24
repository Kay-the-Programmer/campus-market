package com.campusmarket.domain;

/**
 * Stored roles. "seller" is deliberately NOT here - it is derived state
 * (CUSTOMER + hasActiveListings) computed server-side per RBAC spec section 1.
 */
public enum Role {
    CUSTOMER,
    ADMIN
}
