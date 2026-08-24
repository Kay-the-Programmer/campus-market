import { useEffect, useState } from 'react';

/**
 * How long to wait after the last keystroke before treating typing as
 * finished.
 *
 * Tuned against real typing rather than pulled from the air: a competent
 * typist runs 60-90 wpm, roughly 130-200ms between characters, so anything
 * below ~250ms still fires mid-word. 400ms sits comfortably past that gap
 * while staying under the ~1s where a pause starts to feel like a hang, so a
 * whole query costs one request instead of one per character.
 */
export const TYPING_SETTLE_MS = 400;

/**
 * Returns `value` only once it has stopped changing for `delay` ms.
 *
 * Deliberately debounces the VALUE rather than wrapping the request: any
 * effect keyed on the result runs once per settled value, so there is no way
 * to accidentally leave one call site firing per keystroke.
 */
export function useDebouncedValue<T>(value: T, delay: number = TYPING_SETTLE_MS): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    // An empty value settles immediately - clearing a search box should show
    // the cleared state now, not after a wait for input that is not coming.
    if (value === '' || value === null || value === undefined) {
      setSettled(value);
      return;
    }
    const handle = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return settled;
}
