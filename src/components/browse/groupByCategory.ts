import { Listing } from '../../types';

/**
 * The results grid, arranged under category headings.
 *
 * <p>On a wide screen a single run of two dozen mixed cards is hard to read:
 * there is no way to skim past the food to reach the textbooks without reading
 * every card on the way. Blocked under headings, the page can be scanned by
 * section. Phones keep the flat ranked run and put the category on each card
 * instead - there is no room for a heading row that costs a whole line.
 *
 * <h2>Grouping does not re-rank</h2>
 *
 * <p>Categories appear in the order their best listing did, and listings keep
 * their order inside each one. So the ranking the server computed still
 * decides what leads the page and what leads each block; grouping only decides
 * where the breaks go. A category that arrives purely by alphabet would be a
 * different feed, and not the one that was ranked.
 */

/** Fewer than this under a heading of its own and it is a stray, not a section. */
const MIN_PER_GROUP = 2;

/** Where the strays end up, so nothing is dropped from the grid. */
export const MIXED_HEADING = 'More on campus';

export interface GroupedFeed {
  /** Every listing passed in, reordered when grouping is on. */
  ordered: Listing[];
  /** Card index to the heading that belongs immediately above it. */
  headingAt: Map<number, string>;
}

const nameOf = (item: Listing) => item.categoryName || item.category || MIXED_HEADING;

export function groupByCategory(results: Listing[], enabled: boolean): GroupedFeed {
  if (!enabled || results.length === 0) {
    return { ordered: results, headingAt: new Map() };
  }

  /* Insertion-ordered, so the first category to appear in the ranked results
     is the first block on the page. */
  const buckets = new Map<string, Listing[]>();
  results.forEach((item) => {
    const key = nameOf(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  });

  const ordered: Listing[] = [];
  const headingAt = new Map<number, string>();
  const strays: Listing[] = [];

  buckets.forEach((items, name) => {
    if (items.length < MIN_PER_GROUP) {
      strays.push(...items);
      return;
    }
    headingAt.set(ordered.length, name);
    ordered.push(...items);
  });

  /*
   * The leftovers, kept in their ranked order and kept on the page. Dropping a
   * listing because its category happened to have one result would hide it
   * from a feed that had already decided to show it.
   */
  if (strays.length > 0) {
    // Nothing else made a block, so there is nothing for these to be "more"
    // than - they are the whole grid, and it needs no heading at all.
    if (headingAt.size > 0) headingAt.set(ordered.length, MIXED_HEADING);
    ordered.push(...strays);
  }

  return { ordered, headingAt };
}
