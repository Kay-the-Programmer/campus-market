import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useOnboarding } from '../../hooks/useOnboarding';
import type { StepPlacement } from '../../services/onboarding';

/** Gap between the highlighted element and the card, and the ring's padding. */
const OFFSET = 12;
const RING_PAD = 6;
const CARD_WIDTH = 300;

interface Rect { top: number; left: number; width: number; height: number }

function measure(target?: string): Rect | null {
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
    if (r.width === 0 || r.height === 0) continue;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }
  // Nothing laid out: the step falls back to a centred card rather than
  // pointing at nothing.
  return null;
}

/**
 * Places the card next to the anchor, clamped to the viewport.
 *
 * <p>Preferred placement is a hint, not a promise: an element near the right
 * edge would otherwise put half the card off screen, and on a phone almost
 * every nav target is near an edge.
 */
function place(rect: Rect, placement: StepPlacement): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampLeft = (l: number) => Math.max(12, Math.min(l, vw - CARD_WIDTH - 12));

  switch (placement) {
    case 'top':
      return { top: Math.max(12, rect.top - OFFSET), left: clampLeft(rect.left), transform: 'translateY(-100%)' };
    case 'left':
      return { top: Math.min(rect.top, vh - 180), left: Math.max(12, rect.left - OFFSET - CARD_WIDTH) };
    case 'right':
      return { top: Math.min(rect.top, vh - 180), left: clampLeft(rect.left + rect.width + OFFSET) };
    case 'bottom':
    default: {
      const below = rect.top + rect.height + OFFSET;
      // Not enough room underneath - flip above rather than run off the fold.
      if (below > vh - 160) {
        return { top: Math.max(12, rect.top - OFFSET), left: clampLeft(rect.left), transform: 'translateY(-100%)' };
      }
      return { top: below, left: clampLeft(rect.left) };
    }
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

  /*
   * Measured after paint and re-measured on anything that can move the anchor.
   * The nav is sticky and the feed scrolls under it, so a rect captured once
   * drifts within a second of real use.
   */
  useLayoutEffect(() => {
    if (!target) { setRect(null); return; }

    const update = () => setRect(measure(target));
    update();

    // A target inside a lazily-mounted screen appears a frame or two late.
    const retry = window.setTimeout(update, 250);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearTimeout(retry);
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

  if (!due || !next || !skip) return null;

  const { step, index, total } = due;
  const isLast = index === total - 1;
  const cta = step.cta ?? (isLast ? 'Got it' : 'Next');
  const anchored = rect !== null;

  const card = (
    <div
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
      <div
        className="absolute rounded-2xl transition-all duration-150"
        style={{
          top: rect.top - RING_PAD,
          left: rect.left - RING_PAD,
          width: rect.width + RING_PAD * 2,
          height: rect.height + RING_PAD * 2,
          boxShadow: '0 0 0 9999px rgba(33,49,69,0.45), 0 0 0 2px #2563eb inset',
        }}
      />
      <div className="absolute" style={place(rect, step.placement ?? 'bottom')}>
        <div className="relative">{card}</div>
      </div>
    </div>
  );
};
