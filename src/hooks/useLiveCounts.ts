import { useEffect, useRef } from 'react';
import { DATA_CHANGED_EVENT } from '../services/api';

/** Quiet enough not to hammer the API, quick enough that something another
 *  person did shows up while you are sitting on the page. */
const POLL_MS = 30_000;

/**
 * Bursts settle before anything is fetched. Checkout alone writes several times
 * in a row - one order per seller, plus cart deletions - and each of those
 * announces itself. Without this, placing one order would fire five refreshes
 * of the same numbers.
 */
const COALESCE_MS = 400;

interface Options {
  /** Nothing to count while signed out. */
  enabled: boolean;
  /** Fetches the current numbers. Called with no arguments, may be async. */
  refresh: () => void | Promise<void>;
}

/**
 * Keeps badge counts current without a reload.
 *
 * <p>Four triggers, because the counts go stale in four different ways:
 *
 * <ul>
 *   <li><b>After a write</b> - you accepted an order or opened a thread. This
 *       is the common case and the one that felt most broken, since the number
 *       contradicted what you had just done on screen.</li>
 *   <li><b>On focus and on becoming visible</b> - you were in another tab or
 *       another app while things happened.</li>
 *   <li><b>On an interval</b> - you are sitting on the page and somebody else
 *       ordered, messaged, or applied to sell.</li>
 * </ul>
 *
 * <p>The interval is suspended while the tab is hidden. A background tab that
 * keeps polling costs the server and the battery to keep a number correct
 * behind an invisible page, and the visibility trigger catches it up the
 * moment anyone looks.
 */
export function useLiveCounts({ enabled, refresh }: Options) {
  // Held in a ref so a caller can pass an inline closure without this
  // re-subscribing every render.
  const handler = useRef(refresh);
  handler.current = refresh;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const run = () => {
      if (stopped || document.visibilityState === 'hidden') return;
      handler.current();
    };

    /** Coalesces a burst of triggers into one fetch. */
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, COALESCE_MS);
    };

    const startInterval = () => {
      if (interval) clearInterval(interval);
      interval = setInterval(run, POLL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        schedule();
        startInterval();
      } else if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    window.addEventListener(DATA_CHANGED_EVENT, schedule);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') startInterval();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (interval) clearInterval(interval);
      window.removeEventListener(DATA_CHANGED_EVENT, schedule);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);
}
