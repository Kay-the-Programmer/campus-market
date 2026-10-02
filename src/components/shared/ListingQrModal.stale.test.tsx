import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListingQrModal } from './ListingQrModal';
import { Listing } from '../../types';

/*
 * The reported failure. In the browser it happens at the import: the chunk
 * belongs to a build that has been replaced, vercel.json rewrites the miss to
 * /index.html, and the engine refuses to run HTML as a module - rejecting with
 * the message below.
 *
 * Raised here from the call rather than from module load, because Vitest wraps
 * an error thrown by a mock factory in a message of its own, which is not the
 * string the browser produces. The classification is by message either way, so
 * this exercises the same branch; that the real message is classified at all is
 * covered in lazyChunk.test.ts, against all five engine phrasings.
 */
vi.mock('../../utils/qrCard', () => ({
  renderQrCard: () => Promise.reject(
    new Error("'text/html' is not a valid JavaScript MIME type."),
  ),
  canvasToFile: () => Promise.reject(new Error('unused')),
}));

vi.mock('./ToastProvider', () => ({ useToast: () => vi.fn() }));

const listing = {
  id: 'l1', title: 'USB-C to USB-C Cable', price: 120, image: '',
  category: 'Phone Accessories', categoryName: 'Phone Accessories',
  condition: 'Like new', location: 'Downschool',
} as unknown as Listing;

beforeEach(() => {
  sessionStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: vi.fn(), origin: 'https://campusmarket.test' },
  });
});

describe('sharing after a release', () => {
  it('explains that the page is out of date instead of quoting the browser', async () => {
    render(<ListingQrModal isOpen onClose={vi.fn()} listing={listing} />);

    await screen.findByText(/updated while this page was open/i);

    /* The whole point. This string is what the user reported seeing, and it
       means nothing to anyone who did not write the bundler config. */
    expect(screen.queryByText(/not a valid JavaScript MIME type/i)).toBeNull();
    expect(screen.queryByText(/MIME/i)).toBeNull();
  });

  it('offers the reload rather than taking it', async () => {
    render(<ListingQrModal isOpen onClose={vi.fn()} listing={listing} />);

    const button = await screen.findByRole('button', { name: /reload the page/i });
    // Nothing has reloaded yet: the modal opened over whatever they were
    // reading, and throwing that away unasked to fix a share button is worse
    // than the message.
    expect(window.location.reload).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));
  });

  it('falls back to a plain error when a reload has already been tried', async () => {
    // A reload that did not fix it must not become a loop.
    sessionStorage.setItem('cm_chunk_reloaded_at', String(Date.now()));

    render(<ListingQrModal isOpen onClose={vi.fn()} listing={listing} />);
    const button = await screen.findByRole('button', { name: /reload the page/i });
    fireEvent.click(button);

    await screen.findByText(/could not generate the code/i);
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
