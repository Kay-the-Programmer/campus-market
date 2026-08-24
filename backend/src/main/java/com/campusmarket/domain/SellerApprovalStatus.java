package com.campusmarket.domain;

/**
 * Where a account stands in the "may this person list things?" review.
 *
 * <p>Deliberately separate from {@link User#isVerified()}, the trust badge.
 * They are two different gates doing two different jobs:
 *
 * <ul>
 *   <li><b>Approval</b> is the entry gate - without it you cannot create a
 *       listing at all.</li>
 *   <li><b>Verified</b> is a later trust upgrade. An approved-but-unverified
 *       seller lists freely, but their orders are held for an admin to review
 *       before the seller ever sees them.</li>
 * </ul>
 *
 * <p>Collapsing the two would make the held-order flow unreachable: an
 * unverified seller would have no listings, so nobody could order from one.
 */
public enum SellerApprovalStatus {
    /** Buying-only account - has never asked to sell. */
    NOT_REQUESTED,
    /** Asked to sell, waiting on an admin. Cannot list yet. */
    PENDING,
    APPROVED,
    /** Refused, with a reason. May be approved later; not a permanent state. */
    REJECTED;

    public boolean canList() {
        return this == APPROVED;
    }
}
