/**
 * Local record of what this user has searched for, shown in the suggestions
 * dropdown before they have typed anything.
 *
 * Client-side and literal, exactly like recentlyViewed: a list of terms in the
 * order they were used. Nothing is sent to the server - a search history is a
 * more revealing thing to store than a browsing one, and none of this needs to
 * leave the device to be useful.
 *
 * Scoped per user id so a shared campus machine doesn't show one student's
 * searches to the next person who signs in. Guests keep their own bucket
 * rather than being excluded, since an unsigned-in browse session still
 * benefits from "that thing I looked for a minute ago".
 */

const MAX_ENTRIES = 8;
/** Long enough to be a real query; stops stray single keystrokes being stored. */
const MIN_LENGTH = 2;

function keyFor(userId: string) {
  return `cm_recent_searches:${userId || 'guest'}`;
}

export function getRecentSearches(userId: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function recordSearch(userId: string, rawTerm: string) {
  const term = rawTerm.trim();
  if (term.length < MIN_LENGTH) return;
  try {
    // Case-insensitive de-dupe, but the newest spelling is what gets kept -
    // people re-type the same query with different capitalisation constantly.
    const existing = getRecentSearches(userId)
      .filter((t) => t.toLowerCase() !== term.toLowerCase());
    localStorage.setItem(
      keyFor(userId),
      JSON.stringify([term, ...existing].slice(0, MAX_ENTRIES)),
    );
  } catch {
    // A full or disabled localStorage must never break searching.
  }
}

export function removeRecentSearch(userId: string, term: string) {
  try {
    const next = getRecentSearches(userId).filter((t) => t !== term);
    localStorage.setItem(keyFor(userId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearRecentSearches(userId: string) {
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}
