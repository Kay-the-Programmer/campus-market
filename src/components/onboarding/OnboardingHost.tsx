import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useOnboarding } from '../../hooks/useOnboarding';
import type { StepPlacement } from '../../services/onboarding';

/** Gap between the highlighted element and the card, and the ring's padding. */
const OFFSET = 12;
const RING_PAD = 6;
const CARD_WIDTH = 300;

interface Rect { top: number; left: number; width: number; height: number }

/** The laid-out element for a target, or null when none of them is visible. */
function findTarget(target?: string): Element | null {
  if (!target || typeof document === 'undefined') return null;
  /*
   * All matches, not the first. The same destination exists twice in the
   * chrome - once in the desktop bar, once in the bottom nav - and exactly one
   * of the pair is laid out at any width. Taking the first would point the
   * ring at whichever the markup happened to declare earlier, which on a phone
   * is the collapsed desktop copy.
   */
  const els = document.querySelectorAll(`[data-onboarding="${CSS.escape(target)}"]`);
  for (const el of Array.from(els)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  // Nothing laid out: the step falls back to a centred card rather than
  // pointing at nothing.
  return null;
}

/**
 * Viewport rect for the ring, clamped to what is actually on screen.
 *
 * <p>Some anchors are whole regions rather than controls - a saved list, a
 * photo grid - and on a phone those run taller than the screen. An unclamped
 * ring around one is a border with no visible relationship to anything, and
 * pushes the card past the fold. Clamping keeps the highlight on the part the
 * reader can see.
 */
function measure(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;

  const vh = window.innerHeight;
  const top = Math.max(r.top, 8);
  const bottom = Math.min(r.bottom, vh - 8);
  if (bottom <= top) return null; // Scrolled out of sight entirely.

  /*
   * A highlight taller than about a third of the screen has stopped being a
   * highlight - and it leaves nowhere for the card to sit, so the card ends up
   * on top of the very thing being pointed at. Ringing the top of a tall
   * anchor says the same thing and leaves room to explain it.
   */
  const maxHeight = Math.max(160, vh * 0.38);
  return {
    top,
    left: r.left,
    width: r.width,
    height: Math.min(bottom - top, maxHeight),
  };
}

/**
 * Places the card next to the anchor, clamped to the viewport.
 *
 * <p>Preferred placement is a hint, not a promise: an element near the right
 * edge would otherwise put half the card off screen, and on a phone almost
 * every nav target is near an edge.
 */
function place(rect: Rect, placement: StepPlacement, cardHeight: number): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampLeft = (l: number) => Math.max(12, Math.min(l, vw - CARD_WIDTH - 12));
  const clampTop = (t: number) => Math.max(12, Math.min(t, vh - cardHeight - 12));

  /*
   * The card's real height, measured, rather than an assumed one. The copy
   * runs from two lines to five, and a saved item is a banner card the height
   * of a phone: guessing put the card off the bottom of the screen on the very
   * pages where the anchor was biggest.
   */
  const above = rect.top - OFFSET - cardHeight;
  const below = rect.top + rect.height + OFFSET;
  const fitsAbove = above >= 12;
  const fitsBelow = below + cardHeight <= vh - 12;

  switch (placement) {
    case 'left':
      return { top: clampTop(rect.top), left: Math.max(12, rect.left - OFFSET - CARD_WIDTH) };
    case 'right':
      return { top: clampTop(rect.top), left: clampLeft(rect.left + rect.width + OFFSET) };
    case 'top':
      // A sticky action bar sits near the top of the viewport on a phone, so
      // "above it" is often off screen. Preference first, then whatever fits.
      return { top: fitsAbove ? above : clampTop(fitsBelow ? below : above), left: clampLeft(rect.left) };
    case 'bottom':
    default:
      return { top: fitsBelow ? below : clampTop(fitsAbove ? above : below), left: clampLeft(rect.left) };
  }
}

/**
 * Draws whichever onboarding step the engine says is due.
 *
 * <p>Two shapes, one component. A step with a resolvable target becomes a
 * tooltip with a ring around the real element; everything else - the opening
 * and closing lines, and any step whose target is not on this screen - becomes
 * a centred card. Both are the same content, so a step is never lost just
 * because the chrome it describes is behind a breakpoint.
 *
 * <p>The overlay does not capture clicks over the highlighted element: the
 * ring is drawn with an outer box-shadow on a pointer-events-none layer, so
 * someone who would rather just press the thing being explained can.
 */
export const OnboardingHost: React.FC = () => {
  const onboarding = useOnboarding();
  const due = onboarding?.due ?? null;
  const target = due?.step.target;

  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(190);

  /*
   * Measured after paint and re-measured on anything that can move the anchor.
   * The nav is sticky and the feed scrolls under it, so a rect captured once
   * drifts within a second of real use.
   */
  useLayoutEffect(() => {
    if (!target) { setRect(null); return; }

    /*
     * Bring the anchor on screen, once per step.
     *
     * Half of these targets - the zone filter under a feed, the publish button
     * at the foot of a long form - sit below the fold on a phone. Explaining
     * something the reader would have to go looking for is the one failure
     * mode an anchored tooltip has that a plain card does not.
     *
     * It rides along with the measurement rather than running on its own,
     * because the screen a step points at is usually still mounting when the
     * step opens: an attempt made once, up front, finds nothing and never
     * happens again. The flag keeps it to a single scroll, so a reader who
     * scrolls away from the highlight is not dragged back to it.
     */
    let scrolled = false;

    const update = () => {
      const el = findTarget(target);
      if (el && !scrolled) {
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          scrolled = true;
          /*
           * Instant, not smooth. A smooth scroll is silently dropped in more
           * than one engine - it was dropped in the browser this was tested
           * in - and a highlight that never arrives is a worse trade than one
           * that arrives without an animation. It also spares anyone who has
           * asked for reduced motion a lurch they did not start.
           */
          el.scrollIntoView({ block: 'center' });
        }
      }
      setRect(measure(el));
    };

    update();

    // A target inside a lazily-mounted screen appears a frame or two late, and
    // the scroll above lands a few frames after that.
    const retries = [120, 350, 700, 1200].map((ms) => window.setTimeout(update, ms));
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      retries.forEach(window.clearTimeout);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [target, due?.step.id]);

  const next = onboarding?.next;
  const skip = onboarding?.skip;

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') skip?.();
    else if (e.key === 'Enter') next?.();
  }, [skip, next]);

  useEffect(() => {
    if (!due) return;
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [due, onKeyDown]);

  // The card is laid out before it is placed, so its height is known one paint
  // late. Placement reads this on the next render, which is why it starts at a
  // sane default rather than zero.
  useLayoutEffect(() => {
    const h = cardRef.current?.getBoundingClientRect().height;
    if (h && Math.abs(h - cardHeight) > 1) setCardHeight(h);
  });

  if (!due || !next || !skip) return null;

  const { step, index, total } = due;
  const anchored = rect !== null;

  // Waits for a page with something on it rather than teaching an empty one.
  // The step is not consumed - it is still due the next time round.
  if (step.requiresTarget && !anchored) return null;

  const isLast = index === total - 1;
  const cta = step.cta ?? (isLast ? 'Got it' : 'Next');

  const card = (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="onboarding-title"
      className="pointer-events-auto w-[300px] max-w-[calc(100vw-24px)] bg-white rounded-2xl border border-[#dbe1ff] shadow-modal p-4"
    >
      <button
        onClick={skip}
        aria-label="Skip this tour"
        className="absolute top-3 right-3 p-1.5 rounded-lg text-[#a0a3b1] hover:text-[#434655] hover:bg-[#f1f2f7] transition-colors"
      >
        <X className="w-4 h-4" />
      </button>

      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a0a3b1] mb-1">
        Step {index + 1} of {total}
      </p>
      <h3 id="onboarding-title" className="text-sm font-bold text-[#0b1c30] pr-6">
        {step.title}
      </h3>
      <p className="text-xs text-[#737686] mt-1.5 leading-relaxed">{step.body}</p>

      <div className="flex items-center justify-between gap-3 mt-4">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-4 bg-[#2563eb]' : 'w-1.5 bg-[#dbe1ff]'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={skip}
            className="text-xs font-semibold text-[#737686] hover:text-[#434655] px-2 py-1.5"
          >
            Skip
          </button>
          <button
            onClick={next}
            autoFocus
            className="text-xs font-bold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl px-3.5 py-2 transition-colors"
          >
            {cta}
          </button>
        </div>
      </div>
    </div>
  );

  if (!anchored) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-[#213145]/40 backdrop-blur-[2px]">
        <div className="relative">{card}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/*
        The dimming and the cut-out are the same element: a transparent box over
        the target with a very large outer shadow. One layer, no seams, and no
        four-rectangle mask to keep in sync with the rect.
      */}
      {/*
        No transition on the geometry. The ring is re-measured on every scroll
        and resize, and animating each of those made it lag the thing it is
        supposed to be pointing at - visibly on a phone, where the address bar
        collapsing fires a stream of them.
      */}
      <div
        className="absolute rounded-2xl"
        style={{
          top: rect.top - RING_PAD,
          left: rect.left - RING_PAD,
          width: rect.width + RING_PAD * 2,
          height: rect.height + RING_PAD * 2,
          boxShadow: '0 0 0 9999px rgba(33,49,69,0.45), 0 0 0 2px #2563eb inset',
        }}
      />
      <div className="absolute" style={place(rect, step.placement ?? 'bottom', cardHeight)}>
        <div className="relative">{card}</div>
      </div>
    </div>
  );
};
