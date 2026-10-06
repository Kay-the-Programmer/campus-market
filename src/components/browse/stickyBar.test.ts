import { describe, expect, it } from 'vitest';
import { isBarPinned } from './stickyBar';

/** The feed header's height on a phone, which is the bar's own `top` offset. */
const HEADER = 61;

/*
 * What the observer reports as the page scrolls. The marker is zero-height and
 * sits directly above the bar, and the root is inset by the header - so the
 * marker stops intersecting at exactly the moment it passes the header's
 * underside, which is exactly the moment the bar pins.
 */
const whenMarkerIsAt = (top: number) => ({ top, isIntersecting: top > HEADER });

describe('knowing when the results bar has pinned', () => {
  it('is not pinned while the marker is still below the header', () => {
    expect(isBarPinned(whenMarkerIsAt(400), HEADER)).toBe(false);
    expect(isBarPinned(whenMarkerIsAt(HEADER + 1), HEADER)).toBe(false);
  });

  it('is pinned from the moment the marker reaches the header', () => {
    expect(isBarPinned(whenMarkerIsAt(HEADER), HEADER)).toBe(true);
  });

  /*
   * The regression this exists for. Comparing the marker against zero instead
   * of the header left the bar reporting itself unpinned for the header's whole
   * height of scrolling after it had already stopped moving - and while the
   * background was still being switched on this flag, that band was a pinned
   * bar you could read the grid through.
   */
  it.each([HEADER, 40, 12, 1])('is pinned with the marker at %ipx, inside the old blind spot', (top) => {
    expect(isBarPinned(whenMarkerIsAt(top), HEADER)).toBe(true);
  });

  it('stays pinned however far the marker has gone past', () => {
    expect(isBarPinned(whenMarkerIsAt(-2000), HEADER)).toBe(true);
  });

  /* Scrolled back up far enough that the marker is off the bottom of the
     screen: not intersecting either, and emphatically not pinned. */
  it('is not pinned when the marker is below the viewport entirely', () => {
    expect(isBarPinned({ top: 2000, isIntersecting: false }, HEADER)).toBe(false);
  });

  /* The header is measured after first paint, so it is zero on the very first
     frames. The bar's `top` is zero then too, and the two must agree. */
  it('works before the header has been measured', () => {
    expect(isBarPinned({ top: 0, isIntersecting: false }, 0)).toBe(true);
    expect(isBarPinned({ top: 10, isIntersecting: true }, 0)).toBe(false);
  });
});
