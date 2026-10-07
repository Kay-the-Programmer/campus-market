import { describe, expect, it } from 'vitest';
import { resolveSort, type SortContext } from './resolveSort';

/**
 * The rule underneath all of these: a choice someone made is honoured, and a
 * default follows the context. The tests are grouped by which of those is
 * being asserted, because the bugs here are all of the form "the context
 * overrode a choice" or "the default stayed put when the context moved".
 */
const context = (over: Partial<SortContext> = {}): SortContext => ({
  sort: 'best',
  sortTouched: false,
  hasQuery: false,
  dealsOnly: false,
  personalisable: false,
  ...over,
});

describe('the default order of an unsearched feed', () => {
  it('is the blended order for somebody we know nothing about', () => {
    expect(resolveSort(context())).toBe('best');
  });

  it('is ranked once there is enough history to rank by', () => {
    expect(resolveSort(context({ personalisable: true }))).toBe('foryou');
  });

  /* The whole reason personalisation is gated: a ranked feed built on two
     glances is newest-first wearing a different label, and claiming otherwise
     in the sort control is the lie. */
  it('is not personalised on too little history', () => {
    expect(resolveSort(context({ personalisable: false }))).toBe('best');
  });

  it('leaves an explicit "Newest" alone, however much history there is', () => {
    expect(resolveSort(context({ sort: 'newest', sortTouched: true, personalisable: true })))
      .toBe('newest');
  });

  it.each(['popular', 'price_asc', 'price_desc'] as const)(
    'leaves an explicit %s alone', (sort) => {
      expect(resolveSort(context({ sort, sortTouched: true, personalisable: true }))).toBe(sort);
    });

  it('falls back from relevance when the search box is empty', () => {
    expect(resolveSort(context({ sort: 'relevance' }))).toBe('best');
  });
});

describe('searching', () => {
  it('ranks by relevance once there is a term, if nobody chose otherwise', () => {
    expect(resolveSort(context({ hasQuery: true }))).toBe('relevance');
  });

  /*
   * The one case where an explicit choice IS overridden. Somebody who typed
   * "textbook" asked a question with a right answer; serving it in taste order
   * answers a different question, and does it silently.
   */
  it('stands "For you" down the moment there is a term, even if chosen', () => {
    expect(resolveSort(context({ sort: 'foryou', sortTouched: true, hasQuery: true })))
      .toBe('relevance');
    expect(resolveSort(context({ sort: 'foryou', hasQuery: true, personalisable: true })))
      .toBe('relevance');
  });

  it('keeps a chosen price order while searching', () => {
    expect(resolveSort(context({ sort: 'price_asc', sortTouched: true, hasQuery: true })))
      .toBe('price_asc');
  });

  /* Clearing the box returns an untouched sort to whatever the unsearched
     default is - which is the ranked feed when there is history, and newest
     when there is not. Relevance never survives the term that created it. */
  it('hands an untouched relevance back to the unsearched default', () => {
    expect(resolveSort(context({ sort: 'relevance', hasQuery: false, personalisable: true })))
      .toBe('foryou');
    expect(resolveSort(context({ sort: 'relevance', hasQuery: false, personalisable: false })))
      .toBe('best');
  });
});

describe('the deals filter', () => {
  it('leads with the deepest savings when nobody has chosen an order', () => {
    expect(resolveSort(context({ dealsOnly: true, personalisable: true }))).toBe('discount');
  });

  /* Deals beats personalisation for the untouched case: asking for deals is
     itself a statement about what you want ordered first. */
  it('beats a ranked feed, which is also only a default', () => {
    expect(resolveSort(context({ dealsOnly: true, personalisable: true })))
      .not.toBe('foryou');
  });

  it('leaves an explicit choice alone', () => {
    expect(resolveSort(context({ sort: 'price_asc', sortTouched: true, dealsOnly: true })))
      .toBe('price_asc');
  });

  it('strands "Biggest saving" back to newest when the filter goes off', () => {
    expect(resolveSort(context({ sort: 'discount', sortTouched: true, dealsOnly: false })))
      .toBe('newest');
  });
});

describe('two conditions at once', () => {
  it('searching inside the deals filter still ranks by relevance', () => {
    expect(resolveSort(context({ hasQuery: true, dealsOnly: true, sortTouched: true,
      sort: 'relevance' }))).toBe('relevance');
  });

  it('a ranked default inside the deals filter becomes discount, not foryou', () => {
    expect(resolveSort(context({ sort: 'foryou', dealsOnly: true, personalisable: true })))
      .toBe('discount');
  });

  it('a chosen "For you" survives the deals filter but not a search', () => {
    expect(resolveSort(context({ sort: 'foryou', sortTouched: true, dealsOnly: true })))
      .toBe('foryou');
    expect(resolveSort(context({ sort: 'foryou', sortTouched: true, dealsOnly: true,
      hasQuery: true }))).toBe('relevance');
  });
});
