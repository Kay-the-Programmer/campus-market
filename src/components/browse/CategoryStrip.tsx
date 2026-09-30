import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { categoryEmoji } from '../shared/categoryEmoji';

export interface CategoryStripItem {
  id: string;
  name: string;
  listingCount: number;
  /** Admin-chosen picture. Absent for most categories - see categoryEmoji. */
  imageUrl?: string;
}

interface CategoryStripProps {
  categories: CategoryStripItem[];
  /** The category currently filtering the feed, if any. */
  activeId: string;
  /** Selecting the active one again clears it - the caller decides what that means. */
  onSelect: (id: string) => void;
  /** Opens the full index. Omitted, the trailing tile is not drawn. */
  onBrowseAll?: () => void;
}

/** How far one press of an arrow travels. Roughly three tiles. */
const STEP = 360;

/**
 * The categories, as a row of round tiles you scroll through.
 *
 * <p>It replaces a line of text links, and the reason is what people do with
 * a marketplace they have not used before: they do not read a nav, they look
 * for the thing that resembles what they came for. A round tile with a label
 * under it is the shape every shopping app has taught them to scan, and it
 * gives a category enough presence to be worth pressing.
 *
 * <p>Arrows rather than a visible scrollbar, and they appear only in the
 * direction there is something to reach - an arrow that does nothing is worse
 * than no arrow, because it is pressed once and then never trusted again.
 */
export const CategoryStrip: React.FC<CategoryStripProps> = ({
  categories,
  activeId,
  onSelect,
  onBrowseAll,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      // The 4px slack absorbs sub-pixel widths, which otherwise leave the
      // right arrow showing at the very end of the track for ever.
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, categories.length]);

  const nudge = (direction: -1 | 1) => {
    trackRef.current?.scrollBy({ left: STEP * direction, behavior: 'smooth' });
  };

  if (categories.length === 0) return null;

  const arrow = 'absolute top-[42px] z-10 w-9 h-9 rounded-full bg-white border border-[#e5eeff] '
    + 'shadow-[0_2px_10px_-2px_rgba(11,28,48,0.18)] flex items-center justify-center '
    + 'text-[#434655] hover:text-[#0b1c30] hover:border-[#c3c6d7] active:scale-90 '
    + 'transition-all duration-150';

  return (
    <section className="relative mb-6" aria-label="Browse by category">
      {edges.left && (
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label="Scroll categories left"
          className={`${arrow} -left-1 sm:left-0`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {edges.right && (
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label="Scroll categories right"
          className={`${arrow} -right-1 sm:right-0`}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/*
        px-1 and the negative margin let the tiles' focus rings and hover lift
        breathe without the first one being clipped by the scroll container.
      */}
      <div
        ref={trackRef}
        onScroll={measure}
        className="flex gap-1 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth snap-x px-1 -mx-1"
      >
        {categories.map((c) => {
          const active = activeId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              aria-pressed={active}
              className="snap-start shrink-0 w-[104px] sm:w-[118px] pt-1 pb-2 flex flex-col items-center gap-2 group focus-visible:outline-none"
            >
              <span
                className={`relative w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] rounded-full overflow-hidden flex items-center justify-center transition-all duration-200 group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-[#2563eb] ${
                  active
                    ? 'bg-[#eff4ff] ring-2 ring-[#2563eb] text-[#2563eb]'
                    : 'bg-[#f1f2f6] text-[#737686] group-hover:bg-[#e9ebf2]'
                }`}
              >
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  /* aria-hidden: the name underneath already says what this is,
                     and a screen reader announcing "books emoji Textbooks" is
                     the label read twice, once badly. */
                  <span aria-hidden="true" className="text-[30px] sm:text-[34px] leading-none select-none">
                    {categoryEmoji(c.name)}
                  </span>
                )}
              </span>
              <span
                className={`text-[12px] sm:text-[13px] leading-tight text-center line-clamp-2 transition-colors ${
                  active ? 'font-bold text-[#0b1c30]' : 'font-medium text-[#434655] group-hover:text-[#0b1c30]'
                }`}
              >
                {c.name}
              </span>
            </button>
          );
        })}

        {/* Last, where someone who has run out of tiles is already looking. */}
        {onBrowseAll && (
          <button
            type="button"
            onClick={onBrowseAll}
            className="snap-start shrink-0 w-[104px] sm:w-[118px] pt-1 pb-2 flex flex-col items-center gap-2 group focus-visible:outline-none"
          >
            <span className="w-[72px] h-[72px] sm:w-[84px] sm:h-[84px] rounded-full border border-dashed border-[#b4c5ff] bg-white text-[#2563eb] flex items-center justify-center transition-all duration-200 group-hover:-translate-y-0.5 group-hover:bg-[#eff4ff] group-focus-visible:ring-2 group-focus-visible:ring-[#2563eb]">
              <LayoutGrid className="w-7 h-7 sm:w-8 sm:h-8" />
            </span>
            <span className="text-[12px] sm:text-[13px] leading-tight text-center font-semibold text-[#2563eb]">
              All categories
            </span>
          </button>
        )}
      </div>
    </section>
  );
};
