/**
 * Whether the results bar has stopped travelling with the page.
 *
 * <p>Its own module because it is three lines that were wrong for the whole
 * height of the header, and inline in an observer callback there was nowhere to
 * say so and no way to test it.
 *
 * <p>The bar is `position: sticky` with `top` set to the header's height, so it
 * pins the moment the marker above it reaches the header's underside - not when
 * the marker reaches the top of the window, which is a further `headerHeight`
 * pixels of scrolling away. Comparing against zero is what made a pinned bar
 * report itself unpinned for that whole band.
 */

export interface StickyProbe {
  /** The observed marker's position, from the IntersectionObserver entry. */
  top: number;
  /** Whether the marker is still inside the root, header offset included. */
  isIntersecting: boolean;
}

/**
 * @param probe the marker sitting directly above the bar
 * @param headerHeight the bar's own `top` offset - the line it pins against
 */
export function isBarPinned(probe: StickyProbe, headerHeight: number): boolean {
  /* Both halves earn their place: the marker being above the line is what
     pinned means, and the intersection flag is what distinguishes that from a
     marker that is off the bottom of the screen instead. */
  return !probe.isIntersecting && probe.top <= headerHeight;
}
