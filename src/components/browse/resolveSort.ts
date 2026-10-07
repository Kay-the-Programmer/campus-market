/**
 * Which ordering the feed actually asks for, as opposed to the one sitting in
 * state.
 *
 * <p>Its own module because it is a decision table, not a line of code: five
 * inputs, several of which silently override the stored value, and the rule
 * underneath all of them is that an explicit choice is never overridden while
 * an untouched default follows the context. Inline in the component there was
 * nowhere to test that, and the one case nobody can check by reading is the
 * one that matters - what happens when two of these conditions are true at
 * once.
 */

export type SortValue =
  | 'best' | 'foryou' | 'relevance' | 'discount' | 'newest' | 'popular'
  | 'price_asc' | 'price_desc';

export interface SortContext {
  /** The value held in state, or read from the URL. */
  sort: string;
  /** Whether a person has chosen it, as opposed to it being the default. */
  sortTouched: boolean;
  /** Whether the feed is being searched. */
  hasQuery: boolean;
  /** Whether the deals filter is on. */
  dealsOnly: boolean;
  /** Whether there is enough history for a ranked feed to mean anything. */
  personalisable: boolean;
}

export function resolveSort(context: SortContext): SortValue {
  const { sort, sortTouched, hasQuery, dealsOnly, personalisable } = context;

  /* Turning the deals filter off strands a "Biggest saving" selection with
     nothing to rank, exactly as clearing the box strands "Best match". */
  if (!dealsOnly && sort === 'discount') return 'newest';

  /* Switching it on, having expressed no preference, means the deepest savings
     first - which is what asking for deals asks for. An explicit choice is
     never overridden, and neither is a query's relevance ranking once someone
     has chosen it. */
  if (dealsOnly && !sortTouched) return 'discount';

  if (!hasQuery) {
    // Relevance to nothing is not an ordering; it falls back to the default.
    const unsearched = sort === 'relevance' ? 'best' : sort;
    /*
     * Nobody has chosen an order, so the feed picks one.
     *
     * "For you" where there is a history to rank by, and the blended default
     * otherwise - demand, completeness and freshness together, which is what
     * stopped this being a list by date. Neither overrides a real choice:
     * an explicit "Newest" is a person saying they want the new things, and
     * they get them.
     */
    if (!sortTouched && unsearched === 'best') return personalisable ? 'foryou' : 'best';
    return unsearched as SortValue;
  }

  /* A search has a right answer, and ordering it by taste or by a general
     notion of "good" answers a different question - so both ranked orders
     stand down the moment there is a term, chosen or not. This is the one case
     where an explicit choice IS overridden, because the alternative is a
     search that quietly ignores what was typed. The server takes the same
     view: neither ranking is applied to a query. */
  if (sort === 'foryou' || sort === 'best') return 'relevance';

  if (!sortTouched && sort === 'newest') return 'relevance';
  return sort as SortValue;
}
