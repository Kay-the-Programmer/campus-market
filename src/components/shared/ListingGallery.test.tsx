import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListingGallery } from './ListingGallery';

/**
 * The cheap part of this component is showing a photograph; the expensive part
 * is everything that stops two dozen of them running at once. These are the
 * conditions under which it must do nothing at all.
 */

/** Whatever the last observer was handed, so a test can scroll a card into view. */
let observerCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
let reducedMotion = false;

beforeEach(() => {
  vi.useFakeTimers();
  observerCallback = null;
  reducedMotion = false;

  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
      observerCallback = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  });

  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion') && reducedMotion,
    media: query, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const scrollIntoView = () => act(() => { observerCallback?.([{ isIntersecting: true }]); });

/** The track's transform is what says which photo is showing. */
const shownIndex = (container: HTMLElement) => {
  const track = container.querySelector('[style*="translateX"]') as HTMLElement | null;
  const match = track?.style.transform.match(/-?([\d.]+)%/);
  return match ? Number(match[1]) / 100 : 0;
};

const PHOTOS = ['/a.jpg', '/b.jpg', '/c.jpg'];

describe('a listing with one photo', () => {
  /* The overwhelmingly common case, and it has to cost what it always did:
     one image, no track, no dots, no observer, no timer. */
  it('is a plain image with nothing moving', () => {
    const { container } = render(<ListingGallery images={['/only.jpg']} alt="Desk lamp" />);

    expect(screen.getByAltText('Desk lamp')).toBeInTheDocument();
    expect(container.querySelector('[style*="translateX"]')).toBeNull();
    expect(observerCallback).toBeNull();
  });

  it('treats an empty gallery as no gallery rather than crashing', () => {
    expect(() => render(<ListingGallery images={[]} alt="Desk lamp" />)).not.toThrow();
    expect(() => render(<ListingGallery images={['', '']} alt="Desk lamp" />)).not.toThrow();
  });
});

describe('a listing with several photos', () => {
  it('stands still until the card is actually on screen', () => {
    const { container } = render(<ListingGallery images={PHOTOS} alt="Jacket" />);

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(shownIndex(container)).toBe(0);
  });

  it('advances once the card scrolls in', () => {
    const { container } = render(<ListingGallery images={PHOTOS} alt="Jacket" />);
    scrollIntoView();

    act(() => { vi.advanceTimersByTime(6_000); });
    expect(shownIndex(container)).toBe(1);
  });

  it('wraps back round to the cover', () => {
    const { container } = render(<ListingGallery images={PHOTOS} alt="Jacket" />);
    scrollIntoView();

    act(() => { vi.advanceTimersByTime(6_000); });
    act(() => { vi.advanceTimersByTime(3_200); });
    act(() => { vi.advanceTimersByTime(3_200); });
    expect(shownIndex(container)).toBe(0);
  });

  it('stops again when the card scrolls away', () => {
    const { container } = render(<ListingGallery images={PHOTOS} alt="Jacket" />);
    scrollIntoView();
    act(() => { vi.advanceTimersByTime(6_000); });
    const parked = shownIndex(container);

    act(() => { observerCallback?.([{ isIntersecting: false }]); });
    act(() => { vi.advanceTimersByTime(30_000); });

    expect(shownIndex(container)).toBe(parked);
  });

  /*
   * Not a shorter animation - none. Somebody who asked for stillness on a page
   * of moving pictures asked for this one too.
   */
  it('never moves for somebody who asked for reduced motion', () => {
    reducedMotion = true;
    const { container } = render(<ListingGallery images={PHOTOS} alt="Jacket" />);
    scrollIntoView();

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(shownIndex(container)).toBe(0);
  });

  it('does nothing while the tab is in the background', () => {
    const { container } = render(<ListingGallery images={PHOTOS} alt="Jacket" />);
    scrollIntoView();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(shownIndex(container)).toBe(0);

    /* And picks up again afterwards. Not asserted as a particular photo: the
       cycle keeps its phase while the tab is away, so the first move after
       coming back lands wherever that phase had got to. */
    hidden.mockReturnValue(false);
    act(() => { vi.advanceTimersByTime(6_000); });
    expect(shownIndex(container)).toBeGreaterThan(0);
  });

  /* A card nobody watches past the first slide must cost one image, which is
     what it cost before this component existed. */
  it('fetches photos as it reaches them rather than all at once', () => {
    render(<ListingGallery images={[...PHOTOS, '/d.jpg', '/e.jpg']} alt="Jacket" />);
    expect(document.querySelectorAll('img')).toHaveLength(2);

    scrollIntoView();
    act(() => { vi.advanceTimersByTime(6_000); });
    expect(document.querySelectorAll('img')).toHaveLength(3);
  });

  it('describes the listing once, not once per photo', () => {
    render(<ListingGallery images={PHOTOS} alt="Jacket" />);
    expect(screen.getAllByAltText('Jacket')).toHaveLength(1);
  });

  it('marks where you are in the set', () => {
    const { container } = render(<ListingGallery images={PHOTOS} alt="Jacket" />);
    // One dot per photo, whether or not its image has been fetched yet.
    expect(container.querySelectorAll('.rounded-full')).toHaveLength(PHOTOS.length);
  });

  /* Two cards advancing in lockstep is what makes a grid pulse. The offset is
     derived from the photo, so it is stable across re-renders. */
  it('gives different listings different rhythms', () => {
    const first = render(<ListingGallery images={PHOTOS} alt="Jacket" />);
    const firstCb = observerCallback;
    const second = render(<ListingGallery images={['/x.jpg', '/y.jpg']} alt="Bike" />);
    const secondCb = observerCallback;

    act(() => { firstCb?.([{ isIntersecting: true }]); secondCb?.([{ isIntersecting: true }]); });

    /* Step through the stagger window and record when each card first moves.
       Identical offsets would be a grid that pulses in unison, which is the
       thing this exists to prevent. */
    act(() => { vi.advanceTimersByTime(3_200); });
    let firstMovedAt = -1;
    let secondMovedAt = -1;
    for (let elapsed = 0; elapsed <= 1_500; elapsed += 50) {
      if (firstMovedAt < 0 && shownIndex(first.container) > 0) firstMovedAt = elapsed;
      if (secondMovedAt < 0 && shownIndex(second.container) > 0) secondMovedAt = elapsed;
      act(() => { vi.advanceTimersByTime(50); });
    }

    expect(firstMovedAt).toBeGreaterThan(0);
    expect(secondMovedAt).toBeGreaterThan(0);
    expect(firstMovedAt).not.toBe(secondMovedAt);
  });

  /* Derived from the photo rather than randomised, so a re-render does not
     move a card's rhythm out from under somebody mid-scroll. */
  it('keeps the same rhythm across a re-render', () => {
    const { container, rerender } = render(<ListingGallery images={PHOTOS} alt="Jacket" />);
    scrollIntoView();

    act(() => { vi.advanceTimersByTime(3_200); });
    rerender(<ListingGallery images={PHOTOS} alt="Jacket" />);
    act(() => { vi.advanceTimersByTime(700); });

    // 3,900ms in: past this photo's 661ms offset, so it has moved exactly once
    // - a re-render that restarted the clock would still be showing the cover.
    expect(shownIndex(container)).toBe(1);
  });
});
