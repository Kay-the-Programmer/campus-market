import { AuthSession, ViewType } from '../../types';

/**
 * Views a guest may actually reach. Everything else opens the auth modal
 * instead of a dead link or a raw 403 (RBAC rule 6).
 */
export const GUEST_ALLOWED: ViewType[] = [
  // 'saved' belongs here now that a guest's shortlist is real and kept on the
  // device (services/guestSaves). App's own guard was updated when that
  // landed; this one was not, so the bottom bar still answered a tap on the
  // Saved tab with the login modal - hiding the list from the person it was
  // built for.
  'browse', 'search', 'detail', 'saved', 'categories', 'support', 'legal', 'notFound',
];

/**
 * "Actively selling right now" - drives the customer seller navigation (My
 * Listings in the bottom bar, green accents). Still derived from having live
 * listings: someone approved to sell who has posted nothing yet is not in
 * seller state, and the nav should not pretend otherwise.
 *
 * Customers only. An admin who sells keeps the admin shell, so this must stay
 * false for them or they would get two navigations at once.
 */
export const isSellerState = (user: AuthSession) =>
  user.role === 'customer' && user.canSell && user.hasActiveListings;

/**
 * "Allowed to list at all" - the gate on the Sell route.
 *
 * Read straight from the server rather than re-derived: it folds together
 * account type, admin approval and the admin carve-out, and duplicating that
 * logic here is how the client and server drift apart.
 */
export const canSell = (user: AuthSession) => user.canSell;

/** Has asked to sell and is waiting on an admin - neither buyer nor seller yet. */
export const isAwaitingSellerApproval = (user: AuthSession) =>
  user.role === 'customer' && user.sellerApprovalStatus === 'PENDING';

export const wasSellerRejected = (user: AuthSession) =>
  user.role === 'customer' && user.sellerApprovalStatus === 'REJECTED';

/** Sellers get an Orders tab; buyers reach their orders from the account menu. */
export const hasSellerTools = (user: AuthSession) => canSell(user);

/**
 * Full-screen flows own the whole viewport, so the bottom bar steps aside and
 * the screen's own back/close control takes over.
 */
export const HIDES_BOTTOM_NAV: ViewType[] = ['sell'];

/** Badges are hidden entirely at zero - never rendered as "0". */
export const badgeText = (count: number) => (count > 99 ? '99+' : String(count));
