import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListingImage } from './ListingImage';

const FULL = '/api/uploads/abc.webp';
const THUMB = '/api/uploads/abc.thumb.webp';
const SMALL = '/api/uploads/abc.small.webp';
const TINY = '/api/uploads/abc.tiny.webp';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ListingImage', () => {
  it('fetches the thumbnail and loads lazily by default', () => {
    render(<ListingImage src={FULL} alt="a listing" />);
    const img = screen.getByRole('img', { name: 'a listing' });
    expect(img).toHaveAttribute('src', THUMB);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  /*
   * The hero is progressive, not immediate.
   *
   * It used to put the full image straight into src, so opening a listing on
   * a weak connection meant staring at an empty box for the length of a
   * fresh download - even though the browser already had the thumbnail in
   * cache from the card that was just tapped. It now shows that thumbnail at
   * once and swaps up when the big file has finished arriving out of band, so
   * there is never a moment with no photo and never a half-painted one.
   */
  it('shows the cached thumbnail first, eagerly and at high priority', () => {
    render(<ListingImage src={FULL} alt="hero" full eager />);
    const img = screen.getByRole('img', { name: 'hero' });
    expect(img).toHaveAttribute('src', THUMB);
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });

  it('swaps to the full image once it has finished downloading', () => {
    const loaders: { src: string; onload?: () => void }[] = [];
    vi.stubGlobal('Image', class {
      decoding = '';
      onload?: () => void;
      #src = '';
      set src(v: string) { this.#src = v; loaders.push(this); }
      get src() { return this.#src; }
    });

    render(<ListingImage src={FULL} alt="hero" full eager />);
    const img = screen.getByRole('img', { name: 'hero' });
    // The big file is fetched out of band - never into the visible element,
    // which is what stops a half-decoded image being painted over the thumb.
    expect(img).toHaveAttribute('src', THUMB);
    expect(loaders).toHaveLength(1);
    expect(loaders[0].src).toBe(FULL);

    act(() => { loaders[0].onload?.(); });
    expect(img).toHaveAttribute('src', FULL);
  });

  it('stays on the thumbnail when the connection asks us to go easy', () => {
    // Save-Data, or a link the browser itself rates as 2G. The thumbnail is a
    // real photo; several hundred KB for a sharper one is not a good trade
    // for someone who has said their data is scarce.
    const loaders: unknown[] = [];
    vi.stubGlobal('Image', class {
      decoding = '';
      onload?: () => void;
      set src(_v: string) { loaders.push(this); }
    });
    vi.stubGlobal('navigator', Object.create(navigator, {
      connection: { value: { saveData: true }, configurable: true },
    }));

    render(<ListingImage src={FULL} alt="hero" full eager />);
    expect(screen.getByRole('img', { name: 'hero' })).toHaveAttribute('src', THUMB);
    expect(loaders).toHaveLength(0);
  });

  it('offers every rendition, so each context downloads the right one', () => {
    render(<ListingImage src={FULL} alt="tile" />);
    const img = screen.getByRole('img', { name: 'tile' });
    expect(img).toHaveAttribute('srcset', `${TINY} 160w, ${SMALL} 400w, ${THUMB} 640w`);
    // Without sizes the browser assumes 100vw and always takes the larger
    // file, which would make the srcset worse than useless.
    expect(img).toHaveAttribute('sizes');
  });

  it('lets a caller that knows its width say so', () => {
    render(<ListingImage src={FULL} alt="row" sizes="40px" />);
    expect(screen.getByRole('img', { name: 'row' })).toHaveAttribute('sizes', '40px');
  });

  it('never offers a srcset on the hero - it is managing its own upgrade', () => {
    render(<ListingImage src={FULL} alt="hero" full eager />);
    expect(screen.getByRole('img', { name: 'hero' })).not.toHaveAttribute('srcset');
  });

  /*
   * Degrading one step at a time.
   *
   * Every image uploaded before the ".small" rendition existed is named by a
   * srcset candidate that was never written. A browser that picks a candidate
   * and gets a 404 does not try the next one - it fires error and draws
   * nothing - so without this staircase, adding the srcset would have blanked
   * every existing photo in the app.
   */
  it('drops the srcset, then the thumbnail, as each fails', () => {
    render(<ListingImage src={FULL} alt="old" />);
    const img = screen.getByRole('img', { name: 'old' });
    expect(img).toHaveAttribute('srcset');

    // Step one: the .small candidate does not exist.
    fireEvent.error(img);
    expect(img).not.toHaveAttribute('srcset');
    expect(img).toHaveAttribute('src', THUMB);

    // Step two: no thumbnail either - an image older than both renditions.
    fireEvent.error(img);
    expect(img).toHaveAttribute('src', FULL);
  });

  it('loads an external image as-is - there is no thumbnail to try', () => {
    const external = 'https://lh3.googleusercontent.com/photo.jpg';
    render(<ListingImage src={external} alt="ext" />);
    expect(screen.getByRole('img', { name: 'ext' })).toHaveAttribute('src', external);
  });

  it('does not leave a failed image invisible', () => {
    // The fade-in starts at opacity 0. An image that errors never fires load,
    // so without this it would stay transparent for good - a blank tile with
    // nothing to indicate why.
    render(<ListingImage src={FULL} alt="broken" />);
    const img = screen.getByRole('img', { name: 'broken' });
    fireEvent.error(img);
    expect(img).toHaveClass('opacity-100');
  });

  it('passes other attributes through to the img', () => {
    render(<ListingImage src={FULL} alt="styled" className="w-full object-cover" />);
    expect(screen.getByRole('img', { name: 'styled' })).toHaveClass('object-cover');
  });
});
