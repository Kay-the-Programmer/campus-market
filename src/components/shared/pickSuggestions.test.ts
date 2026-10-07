import { describe, expect, it } from 'vitest';
import { MAX_SUGGESTIONS, MIN_SUGGESTIONS, pickSuggestions } from './pickSuggestions';
import { Listing } from '../../types';

/**
 * Three rows now sit under a listing, drawing from overlapping pools. What
 * makes them read as three answers rather than one list printed three times is
 * this rule, so these are the ways it can fail: the same listing in two rows,
 * the listing somebody is reading recommended back to them, and a heading that
 * claims to know something over a single card.
 */
const listing = (id: string) => ({ id, title: id }) as Listing;
const listings = (...ids: string[]) => ids.map(listing);

describe('choosing what a suggestion row shows', () => {
  it('keeps the pool’s order - the ranking is the product', () => {
    const picks = pickSuggestions(listings('a', 'b', 'c'), { currentId: 'self' });
    expect(picks.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('never suggests the listing being read', () => {
    const picks = pickSuggestions(listings('a', 'self', 'b'), { currentId: 'self' });
    expect(picks.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('skips anything a row above already used', () => {
    const picks = pickSuggestions(listings('a', 'b', 'c', 'd'), {
      currentId: 'self',
      exclude: [listings('a'), listings('c')],
    });
    expect(picks.map((l) => l.id)).toEqual(['b', 'd']);
  });

  /* The ranked feed and the co-visitation query are separate reads of a
     catalogue that moves between them, so a pool can repeat itself. */
  it('does not show the same listing twice from one pool', () => {
    const picks = pickSuggestions(listings('a', 'b', 'a', 'c'), { currentId: 'self' });
    expect(picks.map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('caps the row rather than turning it into a second feed', () => {
    const picks = pickSuggestions(listings('a', 'b', 'c', 'd', 'e', 'f', 'g'), {
      currentId: 'self',
    });
    expect(picks).toHaveLength(MAX_SUGGESTIONS);
  });

  /*
   * The row is withheld whole. Every caller renders nothing for an empty
   * result, so the floor is what stops a heading appearing over one card.
   */
  it('withholds the row rather than showing a single card', () => {
    expect(pickSuggestions(listings('a'), { currentId: 'self' })).toEqual([]);
    expect(pickSuggestions(listings('a', 'self'), { currentId: 'self' })).toEqual([]);
    expect(pickSuggestions([], { currentId: 'self' })).toEqual([]);
  });

  it('shows the row at exactly the floor', () => {
    expect(pickSuggestions(listings('a', 'b'), { currentId: 'self' }))
      .toHaveLength(MIN_SUGGESTIONS);
  });

  it('survives a malformed row rather than rendering a blank card', () => {
    const pool = [listing('a'), { title: 'no id' } as Listing, listing('b')];
    expect(pickSuggestions(pool, { currentId: 'self' }).map((l) => l.id)).toEqual(['a', 'b']);
  });

  /* The case the three-row page actually hits: everything worth showing has
     already been shown above, so the last row stands down. */
  it('stands down when the rows above have taken everything', () => {
    const picks = pickSuggestions(listings('a', 'b'), {
      currentId: 'self',
      exclude: [listings('a'), listings('b')],
    });
    expect(picks).toEqual([]);
  });
});
