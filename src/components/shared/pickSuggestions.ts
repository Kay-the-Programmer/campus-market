import { Listing } from '../../types';

/**
 * Which listings a suggestion row under a listing actually shows.
 *
 * <p>The listing page now carries three rows - similar, what other people
 * opened, and what this person is in the market for - and all three draw from
 * overlapping pools. The same rule governs each of them, which is the only
 * reason they read as three answers rather than as one list printed three
 * times, so it lives in one place instead of being retyped per row.
 */

/** Fewer than this and the row is withheld - see below. */
export const MIN_SUGGESTIONS = 2;

/** More than this and a row becomes a second feed. */
export const MAX_SUGGESTIONS = 5;

export interface PickOptions {
  /** The listing being read. Never suggested back to its own reader. */
  currentId: string;
  /** Everything the rows above have already used. */
  exclude?: Listing[][];
}

export function pickSuggestions(pool: Listing[], options: PickOptions): Listing[] {
  const { currentId, exclude = [] } = options;

  const taken = new Set<string>([currentId]);
  exclude.forEach((row) => row.forEach((item) => taken.add(item.id)));

  const picks: Listing[] = [];
  for (const item of pool) {
    if (!item?.id || taken.has(item.id)) continue;
    /* The pool itself can repeat - the ranked feed and the co-visitation query
       are separate reads of a catalogue that moves between them. */
    taken.add(item.id);
    picks.push(item);
    if (picks.length === MAX_SUGGESTIONS) break;
  }

  /*
   * One lonely card under a heading that claims to know something - what other
   * people opened, what you have been looking at - reads as a bug rather than
   * a recommendation. Below the floor the row is dropped entirely, which is
   * why every caller renders nothing for an empty result rather than an empty
   * heading.
   */
  return picks.length >= MIN_SUGGESTIONS ? picks : [];
}
