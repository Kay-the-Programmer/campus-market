import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SuggestedCategories } from './SuggestedCategories';

const suggested = vi.fn();

vi.mock('../../services/api', () => ({
  api: { categories: { suggested: (...args: unknown[]) => suggested(...args) } },
}));

const category = (name: string, listingCount = 4) => ({
  id: `id-${name}`, name, slug: name.toLowerCase(), listingCount,
});

beforeEach(() => {
  suggested.mockReset();
  suggested.mockResolvedValue({ categories: [], aborted: false, error: null });
});

describe('the "worth a look" shelf', () => {
  it('shows the categories the server picked, in its order', async () => {
    suggested.mockResolvedValue({
      categories: [category('Textbooks'), category('Lab gear'), category('Bikes')],
      aborted: false, error: null,
    });

    render(<SuggestedCategories recentIds={['a', 'b']} onSelect={() => {}} />);

    await waitFor(() => expect(screen.getByText('Textbooks')).toBeInTheDocument());
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels[0]).toContain('Textbooks');
    expect(labels[2]).toContain('Bikes');
  });

  /*
   * A heading over one or two chips is not a shelf, it is a loose end - and on
   * a thin catalogue there may genuinely be nowhere else worth sending anyone.
   */
  it('renders nothing at all rather than a heading over two chips', async () => {
    suggested.mockResolvedValue({
      categories: [category('Textbooks'), category('Bikes')],
      aborted: false, error: null,
    });

    const { container } = render(<SuggestedCategories recentIds={[]} onSelect={() => {}} />);

    await waitFor(() => expect(suggested).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('stays silent when the request fails', async () => {
    suggested.mockResolvedValue({ categories: [], error: 'down', aborted: false });

    const { container } = render(<SuggestedCategories recentIds={[]} onSelect={() => {}} />);

    await waitFor(() => expect(suggested).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  /* The whole point of the parameter: a signed-out visitor has no history on
     the server, so theirs has to travel with the request or they get the
     stranger's answer. */
  it('sends this device’s recent listings so a guest gets a real suggestion', async () => {
    render(<SuggestedCategories recentIds={['l1', 'l2']} onSelect={() => {}} />);

    await waitFor(() => expect(suggested).toHaveBeenCalled());
    expect(suggested.mock.calls[0][1]).toEqual(['l1', 'l2']);
  });

  it('asks again when a different person signs in', async () => {
    const { rerender } = render(
      <SuggestedCategories recentIds={['l1']} onSelect={() => {}} userId="alex" />);
    await waitFor(() => expect(suggested).toHaveBeenCalledTimes(1));

    rerender(<SuggestedCategories recentIds={['l1']} onSelect={() => {}} userId="sam" />);
    await waitFor(() => expect(suggested).toHaveBeenCalledTimes(2));
  });

  it('does not ask again when nothing it depends on changed', async () => {
    const { rerender } = render(
      <SuggestedCategories recentIds={['l1']} onSelect={() => {}} userId="alex" />);
    await waitFor(() => expect(suggested).toHaveBeenCalledTimes(1));

    rerender(<SuggestedCategories recentIds={['l1']} onSelect={() => {}} userId="alex" />);
    rerender(<SuggestedCategories recentIds={['l1']} onSelect={() => {}} userId="alex" />);
    expect(suggested).toHaveBeenCalledTimes(1);
  });

  it('ignores a malformed row rather than rendering a blank chip', async () => {
    suggested.mockResolvedValue({
      categories: [category('Textbooks'), { id: 'x' }, category('Bikes'), category('Food')],
      aborted: false, error: null,
    });

    render(<SuggestedCategories recentIds={[]} onSelect={() => {}} />);

    await waitFor(() => expect(screen.getByText('Textbooks')).toBeInTheDocument());
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
