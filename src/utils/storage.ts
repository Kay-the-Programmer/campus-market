/**
 * localStorage that cannot throw.
 *
 * Access to `localStorage` is not guaranteed: Safari's private mode and a
 * blocked-storage setting make even a read throw a SecurityError, and a full
 * quota makes a write throw. Read straight, that turns a dismissed banner or a
 * stored token into a crash of whatever is rendering at the time.
 *
 * The per-feature stores (recentSearches, recentlyViewed) already wrapped their
 * own calls in try/catch; this is the same guarantee in one place, for
 * everywhere else that touches storage.
 */

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when the value could not be persisted, for callers that care. */
export function writeStored(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to undo - the value is already unreachable.
  }
}
