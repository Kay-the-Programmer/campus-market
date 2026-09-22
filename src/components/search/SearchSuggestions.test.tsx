import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { SearchSuggestions } from './SearchSuggestions';
import { api } from '../../services/api';

/**
 * The panel someone sees before they have typed anything.
 *
 * <p>It used to offer five words written into the source - "textbook", "desk
 * lamp", "tutor", "bike", "lunch" - regardless of whether the campus had ever
 * listed any of them. These cover the replacement: that the rows come from the
 * catalogue, that they are ordered by how much is actually behind them, and
 * that the hard-coded list appears only when the catalogue cannot be read at
 * all.
 */

const getCategories = vi.fn();
const suggestions = vi.fn();

const CATEGORIES = [
  { id: 'c1', name: 'Bikes', slug: 'bikes', listingCount: 9 },
  { id: 'c2', name: 'Textbooks', slug: 'textbooks', listingCount: 42 },
  { id: 'c3', name: 'Empty Shelf', slug: 'empty', listingCount: 0 },
  { id: 'c4', name: 'Electronics', slug: 'electronics', listingCount: 31 },
];

function renderPanel(props: Partial<React.ComponentProps<typeof SearchSuggestions>> = {}) {
  return render(
    <SearchSuggestions
      query=""
      userId="u1"
      open
      onClose={() => {}}
      onSearch={() => {}}
      onSelectListing={() => {}}
      onSelectCategory={() => {}}
      {...props}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  getCategories.mockReset().mockResolvedValue({ categories: CATEGORIES });
  suggestions.mockReset().mockResolvedValue({ listings: [], categories: [] });
  vi.spyOn(api.categories, 'getAll').mockImplementation(getCategories);
  vi.spyOn(api.listings, 'suggestions').mockImplementation(suggestions);
});

describe('SearchSuggestions, before anything is typed', () => {
  it('offers the busiest categories, heaviest first', async () => {
    renderPanel();

    await screen.findByText('Textbooks');
    const rows = [...document.querySelectorAll('[role="listbox"] button')]
      .map((b) => b.textContent ?? '')
      .filter((t) => /Textbooks|Electronics|Bikes/.test(t));

    // 42, then 31, then 9 - the order is the whole point of the row.
    expect(rows[0]).toContain('Textbooks');
    expect(rows[1]).toContain('Electronics');
    expect(rows[2]).toContain('Bikes');
  });

  it('never offers a category with nothing in it', async () => {
    renderPanel();

    await screen.findByText('Textbooks');
    expect(screen.queryByText('Empty Shelf')).toBeNull();
  });

  it('states how much is behind each row, so none of them is a guess', async () => {
    renderPanel();

    expect(await screen.findByText('42')).toBeInTheDocument();
  });

  it('falls back to the static terms only when the catalogue cannot be read', async () => {
    getCategories.mockResolvedValue({ categories: [] });
    renderPanel();

    expect(await screen.findByText('textbook')).toBeInTheDocument();
    expect(screen.getByText('Try searching for')).toBeInTheDocument();
  });

  it('drops the static terms once real categories arrive', async () => {
    renderPanel();

    await screen.findByText('Textbooks');
    expect(screen.queryByText('desk lamp')).toBeNull();
  });

  it('offers the deals shortcut, and runs it when picked', async () => {
    const onShowDeals = vi.fn();
    renderPanel({ onShowDeals });

    fireEvent.click(await screen.findByText("Today's deals"));
    expect(onShowDeals).toHaveBeenCalledTimes(1);
  });

  it('omits the deals row entirely when no handler is given', async () => {
    renderPanel();

    await screen.findByText('Textbooks');
    expect(screen.queryByText("Today's deals")).toBeNull();
  });

  it('browses the category rather than text-searching its name', async () => {
    const onSelectCategory = vi.fn();
    const onSearch = vi.fn();
    renderPanel({ onSelectCategory, onSearch });

    fireEvent.click(await screen.findByText('Textbooks'));

    // Searching for the word "Textbooks" would match titles that merely
    // mention it and miss everything in the category that does not.
    expect(onSelectCategory).toHaveBeenCalledWith('c2', 'Textbooks');
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('keeps the keyboard list in step with what is drawn', async () => {
    const onShowDeals = vi.fn();
    renderPanel({ onShowDeals });
    await screen.findByText('Textbooks');

    // One press down lands on the first row, which is the deals shortcut.
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => expect(onShowDeals).toHaveBeenCalledTimes(1));
  });
});
