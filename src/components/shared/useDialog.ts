import React, { useEffect, useRef } from 'react';

/** Everything that can hold focus inside a dialog, in document order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What a dialog has to do beyond looking like one.
 *
 * <p>Three things, all of which the app's overlays were missing: Escape
 * closes, focus moves into the panel when it opens and back to whatever
 * opened it when it closes, and Tab stays inside while it is up. Without the
 * last one Tab walks the page behind the overlay - which is still rendered,
 * still focusable, and still clickable - so a keyboard user ends up operating
 * a page they cannot see.
 *
 * <p>A hook rather than markup because the two dialog shells in this app do
 * not share a wrapper: {@link Modal} is the common one, and AuthModal has its
 * own layout. The behaviour should not fork along with the markup.
 *
 * @param isOpen whether the dialog is currently rendered
 * @param onClose what Escape should call
 * @param panelRef the dialog panel itself, not the backdrop
 */
export function useDialog(
  isOpen: boolean,
  onClose: () => void,
  panelRef: React.RefObject<HTMLElement | null>,
) {
  /*
   * Held in a ref so the effect below depends on `isOpen` alone.
   *
   * Callers pass an inline arrow or a function declared in the component
   * body, both of which are a new value on every render. With onClose in the
   * dependency list the effect tore down and re-ran each time - which means
   * focus snapping back to the first field on every keystroke in the dialog,
   * and the "return focus to the opener" cleanup firing mid-edit.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!isOpen) return;

    /* Whatever opened the dialog gets focus back when it closes - otherwise
       focus falls to the top of the document and a keyboard user has to walk
       the whole page again to get back to where they were. */
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    /* The panel itself, not its first control. In this shell the first
       control is the × - landing on it means Enter dismisses the dialog
       someone has only just opened. From the panel, Tab reaches everything
       in order and Escape still closes. */
    panel?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;

      /* No visibility filter here. The obvious one is offsetParent !== null,
         and it is wrong twice over: it reports null for anything inside a
         position:fixed subtree in some engines, and null for everything under
         jsdom, which has no layout - so the trap silently did nothing in
         tests and would have done nothing for the fixed overlays either. */
      const stops = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!stops.length) return;

      const edge = e.shiftKey ? stops[0] : stops[stops.length - 1];
      if (document.activeElement === edge || !panel.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? stops[stops.length - 1] : stops[0]).focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      opener?.focus?.();
    };
  }, [isOpen, panelRef]);
}
