/**
 * Saves made before signing in.
 *
 * <p>Hearting a listing used to open the login modal, which asks someone to
 * commit to an account at the exact moment they were trying to decide whether
 * anything here is worth having. The shortlist they would have built - the
 * whole reason to come back - was never allowed to exist, so leaving and
 * returning meant starting over.
 *
 * <p>So a guest's saves are kept on the device, exactly like
 * {@link ./recentlyViewed} and {@link ./recentSearches}: a list of listing ids
 * in the order they were hearted. Nothing is sent to the server, because
 * nothing needs to be - there is no account to attach them to yet.
 *
 * <p>The moment there IS one, {@link takeGuestSaves} hands the list over and
 * clears it. That is a one-way door on purpose: once the saves are the
 * account's, the device copy is a stale second answer to "what have I saved",
 * and the two would drift the first time anything was unsaved elsewhere.
 */

import { readStored, writeStored, removeStored } from '../utils/storage';

/**
 * Not scoped per user, unlike recentSearches.
 *
 * <p>There is exactly one guest on a device at a time and they have no id to
 * scope by. The list is cleared on hand-over, so the next person to use a
 * shared campus machine cannot inherit the last one's shortlist.
 */
const KEY = 'cm_guest_saves';

/**
 * Enough to be a real shortlist, few enough that the sign-up hand-over is one
 * quick burst of requests rather than a hundred.
 */
const MAX_ENTRIES = 50;

/**
 * The parsed list, and the raw text it was parsed from.
 *
 * <p>{@link isGuestSaved} is called once per listing as results are mapped, so
 * a page of twenty-four cards would otherwise parse the same JSON twenty-four
 * times. Keyed on the raw string rather than invalidated by hand, so a write
 * from another tab is picked up for free and there is no cache to forget to
 * clear.
 */
let cache: { raw: string; ids: Set<string> } | null = null;

function readSet(): Set<string> {
  const raw = readStored(KEY) || '[]';
  if (cache && cache.raw === raw) return cache.ids;
  let ids: Set<string>;
  try {
    const parsed = JSON.parse(raw);
    ids = new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    // A corrupted value is no worse than an empty one, and must never stop
    // the feed rendering.
    ids = new Set();
  }
  cache = { raw, ids };
  return ids;
}

export function getGuestSaves(): string[] {
  return [...readSet()];
}

export function isGuestSaved(listingId: string): boolean {
  return readSet().has(listingId);
}

/**
 * Hearts or un-hearts a listing, and reports which it did.
 *
 * <p>Returns the new state rather than nothing, so the caller can drive the
 * icon from the stored answer instead of assuming its optimistic flip was
 * right - which matters when storage is unavailable and the write silently
 * did nothing.
 */
export function toggleGuestSave(listingId: string): boolean {
  const current = getGuestSaves();
  const saved = current.includes(listingId);
  const next = saved
    ? current.filter((id) => id !== listingId)
    : [listingId, ...current].slice(0, MAX_ENTRIES);
  writeStored(KEY, JSON.stringify(next));
  return !saved;
}

/**
 * Reads the guest's saves and clears them in the same breath.
 *
 * <p>Called once, when a session appears. Taking rather than reading means a
 * failed hand-over cannot be retried from here - which is the right trade:
 * leaving the list in place would re-save, on every subsequent sign-in, items
 * the person may have deliberately removed from their account since.
 */
export function takeGuestSaves(): string[] {
  const saves = getGuestSaves();
  removeStored(KEY);
  return saves;
}

export function clearGuestSaves(): void {
  removeStored(KEY);
}
