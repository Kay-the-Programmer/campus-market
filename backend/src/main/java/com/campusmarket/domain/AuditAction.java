package com.campusmarket.domain;

/** Every admin action that mutates another user's data (RBAC rule 4). */
public enum AuditAction {
    REMOVE_LISTING,
    SUSPEND_USER,
    BAN_USER,
    REINSTATE_USER,
    DISMISS_REPORT,
    RESOLVE_REPORT,
    VERIFY_USER,
    UNVERIFY_USER,
    APPROVE_SELLER,
    REJECT_SELLER,
    /** Handed a withheld order on to its seller. */
    RELEASE_ORDER,
    /** Supplied a withheld order's goods directly instead of routing it on. */
    FULFIL_ORDER,
    CREATE_PROMO,
    UPDATE_PROMO,
    DELETE_PROMO,
    REORDER_PROMO,
    /** Edited a listing belonging to someone else. */
    EDIT_LISTING,
    /** Put a listing on, or took it off, the Special Offers shelf. */
    SET_SPECIAL_OFFER,
    CREATE_CATEGORY,
    UPDATE_CATEGORY,
    DELETE_CATEGORY,
    REASSIGN_CATEGORY
}
