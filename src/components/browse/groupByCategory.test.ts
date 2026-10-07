import { describe, expect, it } from 'vitest';
import { MIXED_HEADING, groupByCategory } from './groupByCategory';
import { Listing } from '../../types';

/**
 * Grouping decides where the breaks go, and nothing else. The failures worth
 * guarding against are the ones that would quietly undo the ranking the server
 * just computed, or drop a listing the feed had already decided to show.
 */
const item = (id: string, categoryName: string) =>
  ({ id, title: id, categoryName }) as Listing;

const ids = (listings: Listing[]) => listings.map((l) => l.id);

describe('with grouping off', () => {
  it('hands the results back untouched', () => {
    const results = [item('a', 'Food'), item('b', 'Books'), item('c', 'Food')];
    const feed = groupByCategory(results, false);

    expect(feed.ordered).toBe(results);
    expect(feed.headingAt.size).toBe(0);
  });

  it('copes with an empty feed', () => {
    expect(groupByCategory([], true).ordered).toEqual([]);
    expect(groupByCategory([], true).headingAt.size).toBe(0);
  });
});

describe('with grouping on', () => {
  const results = [
    item('food1', 'Food'),
    item('book1', 'Books'),
    item('food2', 'Food'),
    item('book2', 'Books'),
    item('food3', 'Food'),
  ];

  it('blocks each category together', () => {
    expect(ids(groupByCategory(results, true).ordered))
      .toEqual(['food1', 'food2', 'food3', 'book1', 'book2']);
  });

  /* The ranking still decides what leads the page and what leads each block.
     A category arriving by alphabet would be a different feed from the one the
     server ranked. */
  it('orders the blocks by where their best listing ranked', () => {
    const headings = [...groupByCategory(results, true).headingAt.entries()];
    expect(headings).toEqual([[0, 'Food'], [3, 'Books']]);
  });

  it('keeps each listing in its ranked order inside its block', () => {
    const feed = groupByCategory([
      item('b', 'Books'), item('a', 'Food'), item('c', 'Books'), item('d', 'Food'),
    ], true);
    expect(ids(feed.ordered)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('loses nothing', () => {
    const feed = groupByCategory(results, true);
    expect(feed.ordered).toHaveLength(results.length);
    expect(new Set(ids(feed.ordered))).toEqual(new Set(ids(results)));
  });

  /*
   * A heading over a single card is a stray, not a section - but the listing
   * still belongs on a page that had already decided to show it.
   */
  it('sweeps one-off categories into a block at the end', () => {
    const feed = groupByCategory([
      item('food1', 'Food'),
      item('odd1', 'Bikes'),
      item('food2', 'Food'),
      item('odd2', 'Tutoring'),
    ], true);

    expect(ids(feed.ordered)).toEqual(['food1', 'food2', 'odd1', 'odd2']);
    expect([...feed.headingAt.entries()]).toEqual([[0, 'Food'], [2, MIXED_HEADING]]);
  });

  /* Nothing made a block, so there is nothing for the rest to be "more" than:
     the grid is simply the grid, and a heading over all of it says nothing. */
  it('uses no heading at all when every category is a one-off', () => {
    const feed = groupByCategory([item('a', 'Food'), item('b', 'Books')], true);

    expect(ids(feed.ordered)).toEqual(['a', 'b']);
    expect(feed.headingAt.size).toBe(0);
  });

  it('falls back to the type when a listing has no category name', () => {
    const typed = [
      { id: 'a', title: 'a', category: 'Service' } as Listing,
      { id: 'b', title: 'b', category: 'Service' } as Listing,
    ];
    expect([...groupByCategory(typed, true).headingAt.values()]).toEqual(['Service']);
  });
});
