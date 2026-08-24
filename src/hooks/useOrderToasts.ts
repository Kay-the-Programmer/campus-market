import { useCallback, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { NotificationItem } from '../types';

/** Types that interrupt with a toast. Widen this to toast more of them. */
const TOASTED_TYPES: NotificationItem['type'][] = ['order'];

/** Quiet enough not to hammer the API, quick enough that a seller sitting on
 *  the page sees an order within about half a minute of it arriving. */
const POLL_MS = 30_000;

interface Options {
  /** Skip everything while signed out - there is nothing to poll for. */
  enabled: boolean;
  onNotification: (notification: NotificationItem) => void;
}

/**
 * Surfaces new order notifications as toasts without depending on push.
 *
 * <p>Push already toasts when it is switched on, but that needs a granted
 * permission and a live FCM token, so most sellers had no in-app signal at all
 * - an order arrived and the screen said nothing until they reloaded.
 *
 * <p>Ids already seen are remembered, and the first poll seeds that set without
 * toasting: opening the app with eleven unread orders should not fire eleven
 * toasts about things that happened yesterday. Only what arrives while the app
 * is open interrupts.
 */
export function useOrderToasts({ enabled, onNotification }: Options) {
  const seen = useRef<Set<string> | null>(null);
  const handler = useRef(onNotification);
  handler.current = onNotification;

  /** Exposed so a push arriving first can claim the id and stop the poll
   *  re-announcing the same notification a few seconds later. */
  const markSeen = useCallback((id?: string) => {
    if (id && seen.current) seen.current.add(id);
  }, []);

  useEffect(() => {
    if (!enabled) {
      seen.current = null;
      return;
    }

    let cancelled = false;

    const poll = async () => {
      // A background tab would queue toasts nobody is watching, and they would
      // all land at once on return. The focus listener catches up instead.
      if (document.visibilityState === 'hidden') return;

      const res = await api.notifications.getAll();
      if (cancelled || res.error) return;

      const relevant = res.notifications.filter(
        (n) => TOASTED_TYPES.includes(n.type) && !n.read,
      );

      // First run establishes the baseline silently.
      if (seen.current === null) {
        seen.current = new Set(relevant.map((n) => n.id));
        return;
      }

      // Oldest first, so a burst reads in the order things actually happened.
      for (const n of [...relevant].reverse()) {
        if (seen.current.has(n.id)) continue;
        seen.current.add(n.id);
        handler.current(n);
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    const onFocus = () => poll();
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled]);

  return { markSeen };
}
