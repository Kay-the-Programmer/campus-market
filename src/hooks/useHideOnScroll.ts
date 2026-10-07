import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * "Is the page being scrolled down right now?" - for chrome that gets out of
 * the way while someone is reading and comes back the moment they look up.
 *
 * <p>Direction rather than position, because position cannot answer the
 * question: a bar that hides below a fixed offset stays hidden through the
 * whole page, and the one moment someone wants the navigation back is halfway
 * down a long feed.
 */
interface HideOnScrollOptions {
  /**
   * Hold it open regardless. For a screen that does not draw the chrome at
   * all, and for anyone who has asked their OS to reduce motion - a bar that
   * slides away unbidden is exactly the motion they turned off.
   */
  disabled?: boolean;
  /**
   * Always visible within this many pixels of the top of the page.
   *
   * <p>The top of a page is where someone arrives and where they look for
   * their bearings, so the chrome is never hidden there - and a short page
   * that barely scrolls never flickers it away and back.
   */
  revealAbove?: number;
  /**
   * Movement below this many pixels is not treated as a direction.
   *
   * <p>Has to clear more than finger jitter. A page whose images are still
   * arriving settles by a few pixels as they do, and the browser corrects the
   * scroll position to match - which arrives here as a small upward movement
   * nobody made. Measured at eight pixels on the feed, so the default sits
   * above that: without the margin the bar pops back into view on its own
   * while someone is still scrolling down past loading images.
   */
  threshold?: number;
}

export interface HideOnScroll {
  /** True while the page is being scrolled down - hide your chrome. */
  hidden: boolean;
  /**
   * Force it back into view. For the moments a scroll position cannot speak
   * for - a route change, focus landing inside the hidden bar - where leaving
   * it off-screen would strand the thing that was just asked for.
   */
  reveal: () => void;
}

export function useHideOnScroll({
  disabled = false,
  revealAbove = 72,
  threshold = 12,
}: HideOnScrollOptions = {}): HideOnScroll {
  const [hidden, setHidden] = useState(false);
  /*
   * The same answer twice, because the two readers need different things:
   * the component needs state to re-render from, and the scroll handler needs
   * a value it can read without being re-created on every change - a listener
   * that re-subscribes each time the bar moves would miss events while it
   * swapped over.
   */
  const hiddenRef = useRef(false);
  const lastY = useRef(0);

  const apply = useCallback((next: boolean) => {
    if (hiddenRef.current === next) return;
    hiddenRef.current = next;
    setHidden(next);
  }, []);

  const reveal = useCallback(() => {
    // The scroll position is where it was, so without this the next small
    // downward movement would read as "still going down" and hide it again
    // before the reveal had been seen.
    lastY.current = typeof window === 'undefined' ? 0 : Math.max(0, window.scrollY);
    apply(false);
  }, [apply]);

  useEffect(() => {
    if (disabled) {
      apply(false);
      return undefined;
    }

    lastY.current = Math.max(0, window.scrollY);

    const onScroll = () => {
      // Clamped: iOS rubber-banding reports a negative scrollY past the top,
      // and the elastic snap back from it would otherwise read as a scroll
      // down and hide the bar at the very top of the page.
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY.current;

      if (y <= revealAbove) {
        lastY.current = y;
        apply(false);
        return;
      }

      /*
       * Below the threshold, lastY is deliberately NOT updated. Carrying the
       * older anchor forward is what lets a slow, deliberate drag accumulate
       * into a decision; resetting it on every event would mean a gentle
       * scroll never moves the bar at all, however far it travels.
       */
      if (Math.abs(delta) < threshold) return;

      lastY.current = y;
      apply(delta > 0);
    };

    // Passive: this handler never calls preventDefault, and saying so keeps
    // it off the critical path of the scroll it is watching.
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [apply, disabled, revealAbove, threshold]);

  return { hidden, reveal };
}
