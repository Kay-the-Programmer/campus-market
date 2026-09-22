/**
 * Local record of listings the user opened, powering the Home page's
 * "Continue browsing" row.
 *
 * Deliberately kept client-side and literal - it is a list of things you
 * actually looked at, in the order you looked at them. There is no ranking or
 * recommendation logic here, and none is wanted at this scale.
 *
 * Scoped per user id so a shared device doesn't show one student's browsing
 * history to the next person who signs in.
 *
 * Guests get their own bucket rather than being excluded. They used to be:
 * this returned an empty list for anyone not signed in, so the "Continue
 * browsing" row never appeared on a first visit - which is precisely the visit
 * where someone has lost track of the thing they liked two screens ago and has
 * no account, no saved items and no history to fall back on. It is the same
 * reasoning as guestSaves, and the same storage.
 */

const MAX_ENTRIES = 12;

/** The bucket a signed-out visitor writes to. */
const GUEST_KEY = 'guest';

function keyFor(userId: string) {
  return `cm_recently_viewed:${userId || GUEST_KEY}`;
}

export function getRecentlyViewed(userId: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(userId: string, listingId: string) {
  if (!listingId) return;
  try {
    const existing = getRecentlyViewed(userId).filter((id) => id !== listingId);
    const next = [listingId, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    // A full or disabled localStorage must never break navigation.
  }
}

export function clearRecentlyViewed(userId: string) {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Carries a guest's browsing history onto the account they just created.
 *
 * <p>Without this, signing up empties the "Continue browsing" row - the person
 * is rewarded for making an account by losing the trail that brought them to
 * it. Merged newest-first with the account's own history ahead of the guest's,
 * de-duplicated, and the guest bucket is cleared so the next person on a
 * shared machine inherits nothing.
 */
export function mergeGuestHistory(userId: string) {
  if (!userId || userId === GUEST_KEY) return;
  try {
    const guest = getRecentlyViewed(GUEST_KEY);
    if (guest.length === 0) return;
    const mine = getRecentlyViewed(userId);
    const merged = [...mine, ...guest.filter((id) => !mine.includes(id))].slice(0, MAX_ENTRIES);
    localStorage.setItem(keyFor(userId), JSON.stringify(merged));
    localStorage.removeItem(keyFor(GUEST_KEY));
  } catch {
    /* A lost history is a disappointment, never an error worth surfacing. */
  }
}
