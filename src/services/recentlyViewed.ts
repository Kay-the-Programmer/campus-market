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
 */

const MAX_ENTRIES = 12;

function keyFor(userId: string) {
  return `cm_recently_viewed:${userId}`;
}

export function getRecentlyViewed(userId: string): string[] {
  if (!userId || userId === 'guest') return [];
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(userId: string, listingId: string) {
  // Guests have nothing to personalise and shouldn't leave a trail on a
  // shared campus machine.
  if (!userId || userId === 'guest' || !listingId) return;
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
