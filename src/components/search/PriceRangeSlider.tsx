import React, { useEffect, useRef, useState } from 'react';
import { formatPrice } from '../../utils/currency';

interface PriceRangeSliderProps {
  /** Current filter values, as SearchFilters holds them: '' means unbounded. */
  min: string;
  max: string;
  /** Top of the scale, normally the most expensive listing, rounded up. */
  ceiling: number;
  /** Fired on release, not per pixel - see the comment on `commit`. */
  onCommit: (min: string, max: string) => void;
}

/** Fallback scale until the real ceiling loads, and for an empty catalogue
 *  where there is nothing to derive one from. */
export const DEFAULT_PRICE_CEILING = 500;

/**
 * Round the priciest listing up to something that reads like a scale endpoint:
 * K312 becomes K350, not a slider ending on an oddly specific number.
 *
 * <p>Lives here rather than in either screen so the browse feed and the search
 * results cannot drift into two different scales for the same catalogue.
 */
export function niceCeiling(maxPrice: number): number {
  if (maxPrice <= 0) return DEFAULT_PRICE_CEILING;
  const grain = maxPrice <= 100 ? 10 : maxPrice <= 500 ? 50 : maxPrice <= 2000 ? 100 : 500;
  return Math.ceil(maxPrice / grain) * grain;
}

/** Steps stay coarse enough that a drag lands on a round number people would
 *  have typed anyway. Nobody filters to "K37 and up". */
function stepFor(ceiling: number): number {
  if (ceiling <= 100) return 5;
  if (ceiling <= 500) return 10;
  if (ceiling <= 2000) return 25;
  return 50;
}

/**
 * Two-thumb price range.
 *
 * The scale runs from 0 to the priciest listing rather than a hardcoded
 * maximum, so the thumbs always span the range that actually exists - on a
 * campus where nothing costs over K200, a slider topping out at K5,000 would
 * confine every real listing to the leftmost few pixels.
 *
 * A thumb parked at either end means "unbounded on this side", not a literal
 * 0 or ceiling. That distinction matters: a filter pinned to today's most
 * expensive listing would silently exclude anything pricier posted tomorrow.
 */
export const PriceRangeSlider: React.FC<PriceRangeSliderProps> = ({
  min, max, ceiling, onCommit,
}) => {
  // A typed value can sit above the priciest listing, so the scale stretches to
  // fit rather than clamping input the person deliberately entered.
  const top = Math.max(ceiling, Number(max) || 0);
  const step = stepFor(top);

  const [lo, setLo] = useState(() => Number(min) || 0);
  const [hi, setHi] = useState(() => (max === '' ? top : Number(max)));
  const dragging = useRef(false);

  /* Track external changes - a preset pill removed in the header, a value typed
     into the boxes, the back button - but never mid-drag, which would yank the
     thumb out from under the cursor. */
  useEffect(() => {
    if (dragging.current) return;
    setLo(Number(min) || 0);
    setHi(max === '' ? top : Number(max));
  }, [min, max, top]);

  /* Committing per pixel would put a URL write and a re-render behind every
     step of the drag; the search itself is debounced, but the history churn is
     not. Release is also when someone has actually decided. */
  const commit = (nextLo: number, nextHi: number) => {
    dragging.current = false;
    onCommit(
      nextLo > 0 ? String(nextLo) : '',
      nextHi < top ? String(nextHi) : '',
    );
  };

  const pct = (v: number) => (top === 0 ? 0 : (v / top) * 100);

  /**
   * Clicking the track jumps the nearer thumb, the way a single native slider
   * behaves. The inputs themselves ignore pointer events so their thumbs can
   * both be grabbed, which otherwise costs the track its own click target -
   * and "click where you want it" is how a lot of people use a slider.
   *
   * Presses that land on a thumb arrive with that input as the target and are
   * left to the browser, which is already doing the right thing with them.
   */
  const handleTrackClick = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const value = Math.round((ratio * top) / step) * step;
    if (Math.abs(value - lo) <= Math.abs(value - hi)) {
      setLo(value);
      commit(value, hi);
    } else {
      setHi(value);
      commit(lo, value);
    }
  };

  return (
    <div className="pt-0.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-[#0b1c30]">
          {formatPrice(lo)} – {formatPrice(hi)}{hi >= top ? '+' : ''}
        </span>
        {(lo > 0 || hi < top) && (
          <button
            onClick={() => { setLo(0); setHi(top); commit(0, top); }}
            className="text-[10px] font-bold text-[#2563eb] hover:text-[#004ac6]"
          >
            Reset
          </button>
        )}
      </div>

      <div className="relative h-5 cursor-pointer" onPointerDown={handleTrackClick}>
        {/* Track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-[#dce9ff]" />
        {/* Selected span */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-[#2563eb]"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          className="range-input"
          min={0}
          max={top}
          step={step}
          value={lo}
          aria-label="Minimum price"
          aria-valuetext={formatPrice(lo)}
          onChange={(e) => {
            dragging.current = true;
            setLo(Math.min(Number(e.target.value), hi));
          }}
          onPointerUp={() => commit(lo, hi)}
          onKeyUp={() => commit(lo, hi)}
          onBlur={() => dragging.current && commit(lo, hi)}
        />
        <input
          type="range"
          className="range-input"
          min={0}
          max={top}
          step={step}
          value={hi}
          aria-label="Maximum price"
          aria-valuetext={hi >= top ? 'No maximum' : formatPrice(hi)}
          onChange={(e) => {
            dragging.current = true;
            setHi(Math.max(Number(e.target.value), lo));
          }}
          onPointerUp={() => commit(lo, hi)}
          onKeyUp={() => commit(lo, hi)}
          onBlur={() => dragging.current && commit(lo, hi)}
        />
      </div>

      <div className="flex items-center justify-between mt-1 text-[10px] font-semibold text-[#a0a3b1]">
        <span>{formatPrice(0)}</span>
        <span>{formatPrice(top)}+</span>
      </div>
    </div>
  );
};
