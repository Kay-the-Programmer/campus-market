import React, { useEffect, useRef, useState } from 'react';
import { ListingImage } from './ListingImage';

/**
 * A listing card's photo, cycling through the rest of its gallery.
 *
 * <p>A listing with five photos was showing one of them in every feed, which
 * is the one place the other four would actually change somebody's mind: the
 * back of the jacket, the crack in the screen, the size of the desk next to a
 * chair. Cards now slide through them on their own.
 *
 * <h2>What stops this being a nuisance</h2>
 *
 * <p>A grid of two dozen cards all flicking at once is a worse feed than one
 * that never moves, and it is the obvious way to build this. So:
 *
 * <ul>
 * <li><b>Only what is on screen moves.</b> An observer starts the timer when a
 *     card scrolls in and stops it when it leaves, so the cost is the handful
 *     of cards somebody is actually looking at, not the hundred below them.</li>
 * <li><b>They do not move together.</b> Each card takes a fixed offset derived
 *     from its own first image, so a row advances raggedly rather than in
 *     lockstep - which is the difference between a feed that feels alive and
 *     one that pulses.</li>
 * <li><b>Reduced motion means no motion.</b> Not a shorter animation: the
 *     first photo and nothing else, because somebody who asked for stillness
 *     on a page of moving pictures asked for this one too.</li>
 * <li><b>A hidden tab does nothing.</b> Timers stop when the page is not being
 *     looked at, so a backgrounded feed is not quietly fetching photographs.</li>
 * <li><b>Photos are fetched as they are needed.</b> Only up to the one after
 *     the current, so a card nobody watches past the first slide costs one
 *     image - the same as before this existed.</li>
 * </ul>
 */

interface ListingGalleryProps {
  /** Every photo, in order. The first is the cover. */
  images: string[];
  alt: string;
  /** Applied to each image, so the caller keeps its hover and object-fit. */
  className?: string;
  sizes?: string;
  /** How long each photo is held, in milliseconds. */
  interval?: number;
  /** Load the first photo immediately - for a card above the fold. */
  eager?: boolean;
}

/** Long enough to read a photo, short enough to see a second one before scrolling. */
const DEFAULT_INTERVAL = 3200;

/** How far apart two cards' cycles are spread, in milliseconds. */
const STAGGER_SPREAD = 1400;

/**
 * A stable offset per listing, so neighbouring cards do not advance together.
 *
 * <p>Derived from the image URL rather than randomised: a re-render must not
 * move a card's rhythm, and two cards showing the same photo moving together
 * is not a case worth code.
 */
function staggerFor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % STAGGER_SPREAD;
}

export const ListingGallery: React.FC<ListingGalleryProps> = ({
  images, alt, className = '', sizes, interval = DEFAULT_INTERVAL, eager,
}) => {
  const photos = images.filter(Boolean);
  const [index, setIndex] = useState(0);
  /** How many photos have been mounted. Grows one ahead of what is shown. */
  const [loaded, setLoaded] = useState(2);
  const [visible, setVisible] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  /* One photo is the overwhelmingly common case and must cost exactly what it
     did before: one <img>, no observer, no timer, no wrapper state. */
  const cycles = photos.length > 1;

  useEffect(() => {
    if (!cycles) return;
    const node = hostRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      // No observer to tell us what is on screen: treat the card as visible
      // rather than as permanently still. A missing optimisation must not
      // remove the feature.
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      // A little margin, so a card starts cycling as it arrives rather than
      // standing still for one beat after it is already readable.
      { rootMargin: '80px 0px', threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cycles]);

  useEffect(() => {
    if (!cycles || !visible) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    let timer: number | undefined;
    const tick = () => {
      /* Checked at each tick rather than through a listener: the tab's state
         can change between ticks, and this is the cheapest possible check. */
      if (!document.hidden) {
        setIndex((current) => {
          const next = (current + 1) % photos.length;
          setLoaded((most) => Math.max(most, next + 2));
          return next;
        });
      }
      timer = window.setTimeout(tick, interval);
    };

    timer = window.setTimeout(tick, interval + staggerFor(photos[0] ?? alt));
    return () => window.clearTimeout(timer);
  }, [cycles, visible, interval, photos.length, photos[0], alt]);

  if (!cycles) {
    return (
      <ListingImage
        src={photos[0]}
        alt={alt}
        className={className}
        sizes={sizes}
        eager={eager}
      />
    );
  }

  return (
    <div ref={hostRef} className="absolute inset-0 overflow-hidden">
      {/*
        A sliding track rather than a crossfade. Two photographs dissolving
        into each other read as one muddled picture for the length of the
        transition; a slide says "there is another one", which is the whole
        message.
      */}
      <div
        className="flex h-full w-full transition-transform duration-700 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {photos.map((src, i) => (
          <div key={`${src}-${i}`} className="relative w-full h-full shrink-0">
            {i < loaded && (
              <ListingImage
                src={src}
                /* Only the cover is described. The rest are the same object
                   from another angle, and a screen reader announcing the same
                   listing four times as the track moves is noise. */
                alt={i === 0 ? alt : ''}
                aria-hidden={i === 0 ? undefined : true}
                className={className}
                sizes={sizes}
                eager={eager && i === 0}
              />
            )}
          </div>
        ))}
      </div>

      {/* Where you are in the set. Small, low-contrast and out of the way of
          the badges in both top corners. */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none">
        {photos.map((src, i) => (
          <span
            key={`dot-${src}-${i}`}
            className={`h-1 rounded-full transition-all duration-300 ${i === index
              ? 'w-3 bg-white'
              : 'w-1 bg-white/55'
              }`}
          />
        ))}
      </div>
    </div>
  );
};
