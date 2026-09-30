import React from 'react';
import { Listing } from '../../types';
import { PRICE_ON_REQUEST, formatPrice } from '../../utils/currency';

interface PriceTagProps {
  listing: Pick<Listing, 'price' | 'priceUnit' | 'compareAtPrice' | 'discountPercent'>;
  /** Grid cards and the offers shelf; `lg` is the listing detail. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE: Record<
  NonNullable<PriceTagProps['size']>,
  { now: string; was: string; unit: string; onRequest: string }
> = {
  // `onRequest` sits a step below `now`: it is a phrase rather than a figure,
  // and at the same size it reads as shouting on a card and wraps on a narrow
  // one. Not as small as `unit`, which would make it look like a footnote.
  sm: { now: 'text-base', was: 'text-[11px]', unit: 'text-[10px]', onRequest: 'text-xs' },
  md: { now: 'text-lg sm:text-xl', was: 'text-xs', unit: 'text-xs', onRequest: 'text-sm' },
  lg: { now: 'text-3xl', was: 'text-sm', unit: 'text-sm', onRequest: 'text-lg' },
};

/**
 * The price, and the saving when there is one.
 *
 * <p>One component rather than the same three lines repeated on every card,
 * because a struck-through price is a claim about money: if the feed, the
 * search results and the listing page each build it by hand, one of them
 * eventually rounds differently or keeps rendering the "was" after the seller
 * clears it, and the app quotes two different savings for one item.
 *
 * <p>It never computes the percentage. `discountPercent` is worked out
 * server-side in DtoMapper against the same test the deals filter uses, so the
 * badge, the filter and the sort cannot disagree - see
 * ListingSpecifications.hasDiscount. When the server sends no percentage there
 * is no discount to draw, whatever `compareAtPrice` happens to hold.
 */
export const PriceTag: React.FC<PriceTagProps> = ({ listing, size = 'md', className = '' }) => {
  const s = SIZE[size];
  // The server's own answer to "is this reduced", not a re-derivation of it.
  const reduced = listing.discountPercent != null && listing.compareAtPrice != null;

  /*
   * A service the seller quotes per job. Rendered as a phrase rather than a
   * figure - smaller, and in the muted colour the unit already uses - because
   * it is the absence of a price, and dressing it in the big blue numerals
   * would have it scanned as one. The struck-through "was" cannot apply here:
   * there is no asking price for a saving to be measured against, and the
   * server rejects the combination outright.
   */
  if (listing.price == null) {
    return (
      <div className={`flex items-baseline flex-wrap gap-x-2 gap-y-0.5 ${className}`}>
        <span className={`${s.onRequest} font-bold text-[#737686] tracking-tight`}>
          {PRICE_ON_REQUEST}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-baseline flex-wrap gap-x-2 gap-y-0.5 ${className}`}>
      <span className={`text-[#2563eb] font-extrabold ${s.now} tracking-tight`}>
        {formatPrice(listing.price)}
        {listing.priceUnit && (
          <span className={`${s.unit} font-semibold text-[#737686] ml-0.5`}>{listing.priceUnit}</span>
        )}
      </span>

      {reduced && (
        <>
          {/*
            Announced to screen readers as what it is. A bare <s> reads as
            the number itself, which would say the item costs the old price.

            `relative` is load-bearing. sr-only is position:absolute, and an
            absolutely positioned element is only clipped by an ancestor's
            overflow if that ancestor is in its containing-block chain. With
            every ancestor static, the containing block was the document: the
            label stayed at its static position inside a horizontally scrolled
            shelf, escaped the row's clipping, and stretched the page to the
            width of the whole shelf - 400px of sideways scroll on the browse
            feed, from a 1px label nobody can see.
          */}
          <span className={`relative ${s.was} font-semibold text-[#a0a3b1] line-through`}>
            <span className="sr-only">Was </span>
            {formatPrice(listing.compareAtPrice!)}
          </span>
          <span
            className={`${s.was} font-extrabold text-[#b3123c] bg-[#ffe8ec] rounded-full px-1.5 py-0.5 leading-none`}
          >
            −{listing.discountPercent}%
          </span>
        </>
      )}
    </div>
  );
};

/*
 * There was a ViewsNote here - "Seen N times this week" under the price on
 * browse cards and the trending shelf.
 *
 * It is gone because how many people have looked at a listing is the seller's
 * information, not the shopper's. A seller reads it on My Listings, where it
 * tells them whether the thing is being seen; on a card it was telling every
 * buyer how much competition they had, which is a different message to a
 * different audience. The number is now withheld from the payload for anyone
 * but the owner - see DtoMapper.listing - rather than merely not drawn.
 */

/**
 * The corner flash on a card's photo.
 *
 * <p>Separate from PriceTag because it sits in a different part of the card -
 * over the image, where it is doing the scanning job: it is what makes someone
 * stop on this card rather than the one next to it. The price block underneath
 * is what they read once they have stopped.
 */
export const DiscountFlag: React.FC<{ percent?: number; className?: string }> = ({
  percent,
  className = '',
}) => {
  if (percent == null) return null;
  return (
    <span
      className={`px-2 py-1 rounded-lg bg-[#b3123c] text-white text-[10px] font-extrabold uppercase tracking-wide shadow-sm ${className}`}
    >
      {percent}% off
    </span>
  );
};
