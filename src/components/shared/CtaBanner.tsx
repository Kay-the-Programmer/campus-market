import React, { useEffect, useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { PromoSlot, PROMO_THEME_TILE, promoAppearance, promoVariant } from '../../types';
import { api } from '../../services/api';
import { ListingImage } from './ListingImage';

/**
 * A wide marketing banner on the browse pages - a discount, an invitation to
 * start selling, whatever the campaign is - drawn between rows of results.
 *
 * <p>The copy sits on the left and a collage of small pictures on the right,
 * stacked at varying heights and bleeding off the edges. The collage is
 * optional: a banner with none is copy on a colour, which is what every new
 * banner starts as and therefore has to look deliberate.
 *
 * <p>Everything here is admin-editable - see PromoEditor. The banner is the
 * same PromoSlot record the carousel and the offers tiles are, so it inherits
 * their colour overrides, their link rules and their audit trail.
 */

/*
 * Where the banners go, and why there are exactly two of them.
 *
 * A banner has to be *earned* by content above it, so the first is pushed
 * twelve cards down the grid rather than sitting at the top of it: someone who
 * came to shop sees two or three rows of things for sale before the first
 * piece of marketing. Twelve is also the one count that divides evenly by
 * every grid width the browse pages use (two columns on a phone, three on a
 * tablet, four on a desktop), so the banner never lands mid-row and leaves a
 * hole in the grid.
 *
 * The second goes at the very end, after the results. The two can only both be
 * drawn when there are enough cards between them - CTA_MIN_TAIL_CARDS - which
 * is the whole point: two banners back to back is an advert break, and it is
 * the thing people scroll past without reading. On a short page the inline one
 * is simply dropped, so there is always content between them or only one.
 */

/** Cards drawn before the inline banner. Divides by 2, 3 and 4 - see above. */
export const CTA_INLINE_AFTER = 12;

/** Cards that must follow the inline banner before the tail one is also shown. */
export const CTA_MIN_TAIL_CARDS = 4;

/** At most this many banners are rendered, however many an admin has written. */
const CTA_MAX_BANNERS = 2;

/**
 * Last known good copy, used only when GET /api/promos fails.
 *
 * <p>Mirrors what V17 seeds, on the same reasoning as the carousel's fallback:
 * a browse page is what a visitor sees first, and one timed-out request should
 * not silently strip the page of everything that invites them to do anything.
 */
export const FALLBACK_CTA_BANNERS: PromoSlot[] = [
  {
    id: 'fallback-cta-sell', placement: 'CTA_BANNER', theme: 'PURPLE', wide: false,
    active: true, sortOrder: 0, imageOverlay: 40,
    title: "Sell what you're not using.",
    subtitle: 'List it in under a minute. Zero platform fees — you keep every kwacha.',
    ctaLabel: 'Start selling', ctaLink: '/sell',
  },
  {
    id: 'fallback-cta-deals', placement: 'CTA_BANNER', theme: 'BLUE', wide: false,
    active: true, sortOrder: 1, imageOverlay: 40,
    title: 'Deals from students near you.',
    subtitle: 'Textbooks, gadgets and home-cooked meals, marked down every day.',
    ctaLabel: 'See the deals', ctaLink: '/browse?deals=1',
  },
];

/** The banners an admin has published, in their order, capped at what fits. */
export function ctaBannersFrom(promos: PromoSlot[]): PromoSlot[] {
  return promos
    .filter((p) => p.placement === 'CTA_BANNER' && p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, CTA_MAX_BANNERS);
}

export interface CtaPlacement {
  /** Drawn inside the results grid, after CTA_INLINE_AFTER cards. */
  inline: PromoSlot | null;
  /** Drawn after the results, at the foot of the page. */
  tail: PromoSlot | null;
}

/**
 * Decides which of the banners a page actually draws, given how many results
 * it has to separate them with.
 *
 * <p>The guarantee is the point: whatever comes back from the server, this
 * never returns two banners that would render next to each other.
 */
export function placeCtaBanners(banners: PromoSlot[], resultCount: number): CtaPlacement {
  if (banners.length === 0) {
    return { inline: null, tail: null };
  }
  // One banner always goes at the foot of the page rather than into the grid:
  // at the end it is what you read once you have run out of listings, which is
  // exactly the moment an invitation to sell or to see the deals lands.
  const enoughToSeparate = resultCount >= CTA_INLINE_AFTER + CTA_MIN_TAIL_CARDS;
  if (banners.length === 1 || !enoughToSeparate) {
    return { inline: null, tail: banners[0] };
  }
  return { inline: banners[0], tail: banners[1] };
}

/**
 * Fetches the published banners.
 *
 * <p>For pages that do not already hold the promo list. The browse feed does -
 * it renders the carousel and the tiles from the same response - so it passes
 * its own promos to {@link ctaBannersFrom} instead of calling this.
 */
export function useCtaBanners(): PromoSlot[] {
  const [banners, setBanners] = useState<PromoSlot[]>(() => ctaBannersFrom(FALLBACK_CTA_BANNERS));

  useEffect(() => {
    let alive = true;
    api.promos.getActive().then((res) => {
      // An empty array is a real answer - an admin who took every banner down
      // meant to take every banner down - so only an error keeps the fallback.
      if (alive && !res.error && Array.isArray(res.promos)) {
        setBanners(ctaBannersFrom(res.promos));
      }
    });
    return () => { alive = false; };
  }, []);

  return banners;
}

/*
 * The collage geometry, one entry per picture.
 *
 * Fixed sizes and hand-picked vertical offsets rather than anything derived:
 * the effect wanted is a shop window - pictures of different shapes at
 * different heights, some running off the top and bottom edges - and an even
 * row of identical thumbnails reads as a product grid instead. The banner
 * clips, so a tile taller than the strip bleeds rather than stretching it.
 *
 * Later entries drop out on narrow screens. Three pictures on a phone is a
 * cluster; six is a smear.
 */
const COLLAGE_TILES: string[] = [
  'w-[4.25rem] h-20 sm:w-24 sm:h-36 lg:w-28 lg:h-40 sm:-translate-y-4',
  'w-[4.25rem] h-24 sm:w-24 sm:h-44 lg:w-28 lg:h-56 sm:translate-y-5',
  'w-[4.25rem] h-20 sm:w-24 sm:h-32 lg:w-28 lg:h-36 sm:-translate-y-6',
  'hidden sm:block sm:w-24 sm:h-40 lg:w-28 lg:h-48 sm:translate-y-2',
  'hidden sm:block sm:w-24 sm:h-32 lg:w-28 lg:h-36 sm:-translate-y-3',
  'hidden lg:block lg:w-28 lg:h-48 lg:translate-y-6',
];

interface CtaBannerProps {
  slot: PromoSlot;
  /** Follows the banner's in-app link. The page owns what that means. */
  onNavigate: (link?: string) => void;
  /** Layout classes from the caller, e.g. col-span-full inside a results grid. */
  className?: string;
}

export const CtaBanner: React.FC<CtaBannerProps> = ({ slot, onNavigate, className = '' }) => {
  // The same resolver the carousel and the admin preview use, so a banner
  // cannot look one way in the editor and another on the page.
  const look = promoAppearance(slot, promoVariant(slot.placement));
  const images = (slot.collageImages ?? []).filter(Boolean).slice(0, COLLAGE_TILES.length);
  const themeText = PROMO_THEME_TILE[slot.theme].text;

  /*
   * A banner with a link but no button label is still clickable: the label is
   * optional in the editor, and a panel that goes somewhere but cannot be
   * pressed is a dead end. The overlay is used only in that case, so it never
   * sits on top of - or nests with - a real button.
   */
  const wholeIsClickable = Boolean(slot.ctaLink) && !slot.ctaLabel;

  return (
    <section
      aria-label={slot.title}
      className={`relative isolate overflow-hidden rounded-2xl shadow-card ${
        slot.imageUrl && !slot.bgColor ? 'bg-[#0b1c30]' : look.backgroundClass
      } ${className}`}
      style={look.panelStyle}
    >
      {slot.imageUrl && (
        <>
          <ListingImage
            src={slot.imageUrl}
            alt=""
            aria-hidden="true"
            full
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute inset-0 bg-[#0b1c30]"
            style={{ opacity: slot.imageOverlay / 100 }}
          />
        </>
      )}

      {/* Decorative glow, matching the carousel's. Drawn only where there is no
          photograph to sit on top of. */}
      {!slot.imageUrl && (
        <div
          className="absolute -top-16 -left-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none"
          aria-hidden="true"
        />
      )}

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center">
        {/* ── Copy. Half the banner on a wide screen, all of it on a phone ── */}
        <div className="px-5 pt-6 pb-5 sm:py-8 sm:pl-8 sm:pr-4 sm:w-[48%] lg:w-[46%] sm:shrink-0">
          {slot.badge && (
            <span className="inline-block mb-2 px-2.5 py-0.5 rounded-full bg-white/85 text-[#0b1c30] text-[10px] font-bold uppercase tracking-wider">
              {slot.badge}
            </span>
          )}
          <h2
            className={`text-xl sm:text-2xl lg:text-3xl font-extrabold leading-tight tracking-tight ${
              slot.textColor ? '' : 'text-white'
            }`}
            style={{ textWrap: 'balance', ...(slot.textColor ? { color: slot.textColor } : {}) }}
          >
            {slot.title}
          </h2>
          {slot.subtitle && (
            <p
              className={`mt-1.5 sm:mt-2 text-xs sm:text-sm leading-relaxed max-w-md ${
                slot.textColor ? 'opacity-85' : 'text-white/85'
              }`}
              style={slot.textColor ? { color: slot.textColor } : undefined}
            >
              {slot.subtitle}
            </p>
          )}
          {slot.ctaLabel && (
            <button
              onClick={() => onNavigate(slot.ctaLink)}
              className={`mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all ${
                slot.buttonColor ? '' : 'bg-white'
              } ${slot.buttonTextColor ? '' : themeText}`}
              style={look.buttonStyle}
            >
              {slot.ctaLabel}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ── Collage. Bleeds off the right edge and the top and bottom of the
             strip, which is what makes it a window rather than a row of
             thumbnails - the banner's overflow-hidden does the cutting.

             Centred *safely*: a strip that fits sits in the middle of the
             space, and one that does not overflows only at the end, so the
             pictures are never cut off on the side the copy is on. ── */}
        {images.length > 0 ? (
          <div className="flex-1 min-w-0 h-28 sm:h-44 lg:h-52 flex items-center justify-center-safe gap-2 sm:gap-3 pb-6 sm:pb-0">
            {images.map((src, i) => (
              <div
                key={`${src}-${i}`}
                className={`shrink-0 overflow-hidden rounded-xl bg-white/15 ring-1 ring-white/25 shadow-lg ${COLLAGE_TILES[i]}`}
              >
                <ListingImage
                  src={src}
                  alt=""
                  aria-hidden="true"
                  sizes="112px"
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        ) : (
          /* No collage: the same motif the carousel falls back to, so an
             unillustrated banner still looks composed rather than unfinished.
             Hidden on a phone, where the copy alone already fills the width. */
          <div className="hidden sm:flex flex-1 items-center justify-center py-8">
            <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center rotate-3">
              <Sparkles className="w-9 h-9 lg:w-11 lg:h-11 text-white/90" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>

      {wholeIsClickable && (
        <button
          onClick={() => onNavigate(slot.ctaLink)}
          className="absolute inset-0 z-20 w-full h-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset"
          aria-label={slot.title}
        />
      )}
    </section>
  );
};
