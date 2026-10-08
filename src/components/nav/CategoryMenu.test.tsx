import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CategoryMenu } from './CategoryMenu';

const getAll = vi.fn();
vi.mock('../../services/api', () => ({
  api: { categories: { getAll: (...args: unknown[]) => getAll(...args) } },
}));

const row = (name: string, listingCount: number) => ({
  id: name.toLowerCase(), name, slug: name.toLowerCase(), listingCount,
});

const props = () => ({
  onSelectCategory: vi.fn(),
  onSelectType: vi.fn(),
  onSeeAll: vi.fn(),
});

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /categories/i }));

beforeEach(() => {
  getAll.mockReset();
  getAll.mockResolvedValue({ categories: [row('Textbooks', 9), row('Bikes', 20)] });
});

/*
 * The strip this replaces was removed because it cost a categories fetch on
 * every page load. The first two tests are that bill staying paid: nothing is
 * requested until somebody opens the menu, and opening it again does not ask
 * a second time.
 *
 * The rest are about not lying. An empty list from a failed request must not
 * render as "this campus sells nothing", and a category with no listings must
 * not be offered at all - navigation that leads somewhere empty teaches people
 * to stop trusting it.
 */
describe('CategoryMenu', () => {
  it('fetches nothing until it is opened', () => {
    render(<CategoryMenu {...props()} />);

    expect(getAll).not.toHaveBeenCalled();
  });

  it('fetches once and keeps the answer for the session', async () => {
    render(<CategoryMenu {...props()} />);

    openMenu();
    await screen.findByText('Textbooks');
    fireEvent.keyDown(document, { key: 'Escape' });
    openMenu();
    await screen.findByText('Textbooks');

    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it('orders by how much is actually on the shelf', async () => {
    render(<CategoryMenu {...props()} />);

    openMenu();
    await screen.findByText('Bikes');

    const listed = screen.getAllByRole('menuitem')
      .map((el) => el.textContent ?? '')
      .filter((t) => t.includes('Bikes') || t.includes('Textbooks'));
    expect(listed[0]).toContain('Bikes');
  });

  it('hides categories with nothing in them', async () => {
    getAll.mockResolvedValue({ categories: [row('Textbooks', 9), row('Taxidermy', 0)] });
    render(<CategoryMenu {...props()} />);

    openMenu();
    await screen.findByText('Textbooks');

    expect(screen.queryByText('Taxidermy')).toBeNull();
  });

  it('says a failed request failed rather than showing an empty catalogue', async () => {
    getAll.mockResolvedValue({ categories: [], error: 'offline' });
    render(<CategoryMenu {...props()} />);

    openMenu();

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/no categories have listings/i)).toBeNull();
  });

  it('hands a chosen category up and closes', async () => {
    const p = props();
    render(<CategoryMenu {...p} />);

    openMenu();
    fireEvent.click(await screen.findByText('Textbooks'));

    expect(p.onSelectCategory).toHaveBeenCalledWith('textbooks');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('offers the three core types alongside the long tail', async () => {
    const p = props();
    render(<CategoryMenu {...p} />);

    openMenu();
    /* Settle the fetch first: the types do not wait for it, but asserting
       before it resolves leaves React updating a torn-down tree. */
    await screen.findByText('Textbooks');
    fireEvent.click(screen.getByText('Services'));

    expect(p.onSelectType).toHaveBeenCalledWith('Service');
  });

  it('closes on Escape without choosing anything, and gives focus back', async () => {
    const p = props();
    render(<CategoryMenu {...p} />);

    openMenu();
    await screen.findByText('Textbooks');
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(p.onSelectCategory).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /categories/i })).toHaveFocus();
  });

  it('closes when the page behind it is clicked', async () => {
    render(<CategoryMenu {...props()} />);

    openMenu();
    await screen.findByText('Textbooks');
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
  });
});
