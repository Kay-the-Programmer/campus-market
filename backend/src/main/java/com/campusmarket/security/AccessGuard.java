package com.campusmarket.security;

import com.campusmarket.domain.User;
import com.campusmarket.web.error.ApiException;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Central authorization checks. Every mutating service call routes through here
 * so permissions are enforced server-side regardless of what the UI shows
 * (RBAC rule 2).
 */
@Component
public class AccessGuard {

    /** Any logged-in user. */
    public void requireAuthenticated(Principal principal) {
        if (principal.isGuest()) {
            throw ApiException.unauthorized("Please log in to continue.");
        }
    }

    /**
     * Customer-only surfaces: sell, cart, saved, messages, deals.
     *
     * <p>Admins are refused here on purpose - RBAC rule 5 keeps the admin role out
     * of transactional customer flows entirely rather than merely hiding the UI.
     */
    public void requireCustomer(Principal principal) {
        requireAuthenticated(principal);
        if (principal.isAdmin()) {
            throw ApiException.forbidden(
                    "ADMIN_BLOCKED",
                    "Admins cannot use customer features. Use a separate customer account.",
                    java.util.Map.of("role", "admin"));
        }
    }

    /** Customer-only surfaces that additionally require a verified email. */
    public void requireVerifiedCustomer(Principal principal) {
        requireCustomer(principal);
        if (!principal.user().isEmailVerified()) {
            throw ApiException.forbidden(
                    "EMAIL_NOT_VERIFIED",
                    "Verify your campus email before posting or transacting.",
                    java.util.Map.of("emailVerified", false));
        }
    }

    /**
     * Listing creation - the one customer-shaped capability admins DO have.
     *
     * <p>Everything else transactional (cart, saved, buying, chat) still refuses
     * admins via {@link #requireCustomer}. Selling is carved out deliberately:
     * an admin listing something does not put them on the other side of a trade
     * they also moderate, whereas an admin buying would.
     *
     * <p>For everyone else there are two gates, and they fail differently on
     * purpose so the UI can respond to each:
     * <ul>
     *   <li>{@code SELLER_ACCOUNT_REQUIRED} - a buying-only account, which the
     *       one-click upgrade fixes. Not really a failure, just a step.</li>
     *   <li>{@code SELLER_APPROVAL_PENDING} / {@code SELLER_APPROVAL_REJECTED} -
     *       waiting on, or refused by, an admin. No client-side remedy.</li>
     * </ul>
     */
    public void requireSeller(Principal principal) {
        requireAuthenticated(principal);
        User user = principal.user();

        if (!user.isEmailVerified()) {
            throw ApiException.forbidden(
                    "EMAIL_NOT_VERIFIED",
                    "Verify your campus email before posting or transacting.",
                    java.util.Map.of("emailVerified", false));
        }
        if (user.isCurrentlyRestricted()) {
            throw ApiException.forbidden(
                    "ACCOUNT_RESTRICTED",
                    "This account is restricted and cannot post listings.",
                    java.util.Map.of());
        }

        // Admins are approved by definition; approving yourself checks nothing.
        if (user.isAdmin()) {
            return;
        }

        if (!user.getAccountType().canSell()) {
            throw ApiException.forbidden(
                    "SELLER_ACCOUNT_REQUIRED",
                    "Your account is set up for buying. Switch to a seller account to start listing.",
                    java.util.Map.of("accountType", user.getAccountType().name()));
        }

        switch (user.getSellerApprovalStatus()) {
            case APPROVED -> { /* through */ }
            case REJECTED -> throw ApiException.forbidden(
                    "SELLER_APPROVAL_REJECTED",
                    user.getSellerApprovalReason() == null
                            ? "Your seller application was not approved."
                            : "Your seller application was not approved: " + user.getSellerApprovalReason(),
                    java.util.Map.of("sellerApprovalStatus", "REJECTED"));
            default -> throw ApiException.forbidden(
                    "SELLER_APPROVAL_PENDING",
                    "Your seller account is awaiting admin approval. You'll be notified once it's reviewed.",
                    java.util.Map.of("sellerApprovalStatus",
                            user.getSellerApprovalStatus().name()));
        }
    }

    /**
     * Managing something you already own - your own listings, orders placed with
     * you. Ownership is the real check ({@link #requireOwner} follows), so this
     * only has to establish that somebody is signed in.
     *
     * <p>Exists so these paths stop routing through {@link #requireCustomer},
     * which would lock an admin out of inventory they are now allowed to have.
     */
    public void requireOwnerContext(Principal principal) {
        requireAuthenticated(principal);
    }

    public void requireAdmin(Principal principal) {
        if (principal.isGuest()) {
            throw ApiException.unauthorized("Please log in to continue.");
        }
        if (!principal.isAdmin()) {
            throw ApiException.forbidden("Administrator access required.");
        }
    }

    /**
     * Ownership is checked before role everywhere it applies (RBAC rule 1): a
     * customer may only touch rows they own, whatever their role.
     */
    public void requireOwner(Principal principal, UUID ownerId, String message) {
        requireAuthenticated(principal);
        if (!principal.owns(ownerId)) {
            throw ApiException.forbidden(message);
        }
    }

    /** Ownership, or admin acting in a moderation capacity. */
    public void requireOwnerOrAdmin(Principal principal, UUID ownerId, String message) {
        requireAuthenticated(principal);
        if (!principal.owns(ownerId) && !principal.isAdmin()) {
            throw ApiException.forbidden(message);
        }
    }
}
