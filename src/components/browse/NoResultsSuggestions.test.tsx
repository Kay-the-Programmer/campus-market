import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoResultsSuggestions } from './NoResultsSuggestions';

const search = vi.fn();

vi.mock('../../services/api', () => ({
  api: { listings: { search: (...args: unknown[]) => search(...args) } },
}));

/** Answers a probe with `total` hits, so a test can say what exists where. */
const hits = (total: number) => ({ totalItems: total, aborted: false, listings: [] });

beforeEach(() => {
  search.mockReset();
  search.mockResolvedValue(hits(0));
});

/*
 * The rule this component lives or dies by: never offer a way out that leads
 * to another empty page. Every suggestion is backed by a count the server just
 * gave us, and anything that comes back empty is not shown at all.
 */
describe('NoResultsSuggestions', () => {
  it('points at the zones that actually have the thing', async () => {
    // "clothes" in Across: nothing here, seven over there.
    search.mockImplementation((params: any) => Promise.resolve(
      hits(params.campusZone === 'UPSCHOOL' ? 7 : 0),
    ));

    render(
      <NoResultsSuggestions
        query={{ search: 'clothes', campusZone: 'ACROSS' }}
        onApply={vi.fn()}
      />,
    );

    expect(await screen.findByText('Upschool')).toBeInTheDocument();
    expect(screen.getByText('7 listings')).toBeInTheDocument();
    // Downschool had none, so it is not offered.
    expect(screen.queryByText('Downschool')).not.toBeInTheDocument();
  });

  it('keeps the search term when it moves them', async () => {
    search.mockImplementation((params: any) => Promise.resolve(
      hits(params.campusZone === 'DOWNSCHOOL' ? 3 : 0),
    ));

    render(
      <NoResultsSuggestions
        query={{ search: 'clothes', campusZone: 'ACROSS' }}
        onApply={vi.fn()}
      />,
    );

    await screen.findByText('Downschool');
    // Every probe carries the term: the offer is "this thing, elsewhere".
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'clothes' }),
      expect.anything(),
    );
  });

  it('offers to widen a price band that is hiding everything', async () => {
    search.mockImplementation((params: any) => Promise.resolve(
      hits(params.minPrice === undefined && params.maxPrice === undefined ? 12 : 0),
    ));

    render(
      <NoResultsSuggestions
        query={{ search: 'desk', minPrice: '500', maxPrice: '900' }}
        onApply={vi.fn()}
      />,
    );

    expect(await screen.findByText('Any price')).toBeInTheDocument();
    expect(screen.getByText('12 listings')).toBeInTheDocument();
  });

  it('hands back only the one filter the suggestion names', async () => {
    const onApply = vi.fn();
    search.mockImplementation((params: any) => Promise.resolve(
      hits(params.campusZone === 'UPSCHOOL' ? 4 : 0),
    ));

    render(
      <NoResultsSuggestions
        query={{ search: 'bike', campusZone: 'ACROSS', categoryId: 'c1' }}
        onApply={onApply}
      />,
    );

    fireEvent.click(await screen.findByText('Upschool'));
    expect(onApply).toHaveBeenCalledWith({ campusZone: 'UPSCHOOL' });
  });

  it('says nothing at all when every way out is also empty', async () => {
    const { container } = render(
      <NoResultsSuggestions
        query={{ search: 'anvil', campusZone: 'ACROSS', minPrice: '10' }}
        onApply={vi.fn()}
      />,
    );

    await waitFor(() => expect(search).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('button')).toBeNull());
  });

  it('does not probe zones when none is set', async () => {
    render(<NoResultsSuggestions query={{ search: 'anything' }} onApply={vi.fn()} />);

    // Nothing to relax: an unzoned search already covers the whole campus, so
    // suggesting a zone would narrow it, not widen it.
    await waitFor(() => expect(search).not.toHaveBeenCalled());
  });
});

/*
 * Two more ways to come up empty, both worth catching because both look to
 * the person like "this marketplace has nothing".
 */
describe('NoResultsSuggestions fallbacks', () => {
  it('tries the words when the whole phrase matches nothing', async () => {
    // The seller wrote "winter coat"; the shopper typed three words.
    search.mockImplementation((params: any) => Promise.resolve(
      hits(params.search === 'winter' ? 3 : 0),
    ));

    render(
      <NoResultsSuggestions query={{ search: 'winter clothes bundle' }} onApply={vi.fn()} />,
    );

    expect(await screen.findByText('Search “winter” instead')).toBeInTheDocument();
    expect(screen.getByText('3 listings')).toBeInTheDocument();
  });

  it('prefers a filter it can relax over rewording the search', async () => {
    // Both would work; changing a filter keeps what they typed, so it wins.
    search.mockImplementation((params: any) => Promise.resolve(
      hits(params.campusZone === 'UPSCHOOL' || params.search === 'desk' ? 5 : 0),
    ));

    render(
      <NoResultsSuggestions
        query={{ search: 'standing desk', campusZone: 'ACROSS' }}
        onApply={vi.fn()}
      />,
    );

    expect(await screen.findByText('Upschool')).toBeInTheDocument();
    expect(screen.queryByText(/Search “desk” instead/)).not.toBeInTheDocument();
  });

  it('inline only talks about zones, and only once it has an answer', async () => {
    search.mockImplementation((params: any) => Promise.resolve(
      hits(params.campusZone === 'DOWNSCHOOL' ? 9 : 0),
    ));

    render(
      <NoResultsSuggestions
        variant="inline"
        query={{ search: 'lamp', campusZone: 'ACROSS', minPrice: '10', categoryId: 'c1' }}
        onApply={vi.fn()}
      />,
    );

    expect(await screen.findByText('Downschool')).toBeInTheDocument();
    // The widening offers belong on an empty page, not under a grid of results.
    expect(screen.queryByText('Any price')).not.toBeInTheDocument();
    expect(screen.queryByText(/Looking for this elsewhere/)).not.toBeInTheDocument();
  });
});
