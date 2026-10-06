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
  | 'foryou' | 'relevance' | 'discount' | 'newest' | 'popular' | 'price_asc' | 'price_desc';

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
    // Relevance to nothing is newest wearing a different label.
    const unsearched = sort === 'relevance' ? 'newest' : sort;
    /*
     * The one place a ranked feed belongs: an unsearched feed nobody has given
     * an order to, once there is something to rank by. Everywhere else the
     * ordering was asked for and is left alone - including an explicit
     * "Newest", which is a person saying they want the new things.
     */
    if (!sortTouched && unsearched === 'newest' && personalisable) return 'foryou';
    return unsearched as SortValue;
  }

  /* A search has a right answer, and ranking it by taste would answer a
     different question - so "For you" stands down the moment there is a term,
     chosen or not. This is the one case where an explicit choice IS overridden,
     because the alternative is a search that quietly ignores what was typed. */
  if (sort === 'foryou') return 'relevance';

  if (!sortTouched && sort === 'newest') return 'relevance';
  return sort as SortValue;
}
