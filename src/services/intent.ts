/**
 * What a visitor said they came for.
 *
 * <p>The onboarding tour explains how trading here works - useful, and
 * completely silent on the question the person actually has, which is whether
 * this site has the thing they want. So the feed opened the same way for
 * everyone: everything, newest first, and a newcomer had to work out both what
 * is here and how to narrow it before seeing anything relevant.
 *
 * <p>One question fixes most of that, and it is worth asking only because the
 * answer is cheap to act on: it seeds the feed's type filter. It is not a
 * profile, it is not sent anywhere, and it is not used for anything else.
 *
 * <p>Device-local and per user id, like {@link ./recentlyViewed} and
 * {@link ./guestSaves} - a shared campus machine must not open with the last
 * person's answer, and a guest gets their own bucket rather than being
 * excluded.
 */

import { readStored, writeStored, removeStored } from '../utils/storage';

/** The answers, which are the feed's own core types plus an opt-out. */
export type Intent = 'Product' | 'Service' | 'Food' | 'browsing';

function keyFor(userId: string) {
  return `cm_intent:${userId || 'guest'}`;
}

const VALID: Intent[] = ['Product', 'Service', 'Food', 'browsing'];

/**
 * Their answer, or null if they have not been asked yet.
 *
 * <p>"browsing" is a real answer meaning "do not narrow anything" - distinct
 * from null, which means the question is still outstanding. Collapsing the two
 * would re-ask someone who has already declined, which is the fastest way to
 * make a helpful prompt feel like nagging.
 */
export function getIntent(userId: string): Intent | null {
  const raw = readStored(keyFor(userId));
  return VALID.includes(raw as Intent) ? (raw as Intent) : null;
}

export function setIntent(userId: string, intent: Intent): void {
  writeStored(keyFor(userId), intent);
}

export function clearIntent(userId: string): void {
  removeStored(keyFor(userId));
}

/**
 * Carries a guest's answer onto the account they just made.
 *
 * <p>Without it, signing up re-asks a question they answered two minutes ago.
 * The account's own answer wins if it has one - it is the more deliberate of
 * the two - and the guest bucket is cleared either way so the next person on a
 * shared machine is asked fresh.
 */
export function mergeGuestIntent(userId: string): void {
  if (!userId || userId === 'guest') return;
  const guest = getIntent('guest');
  if (guest && !getIntent(userId)) {
    setIntent(userId, guest);
  }
  clearIntent('guest');
}
