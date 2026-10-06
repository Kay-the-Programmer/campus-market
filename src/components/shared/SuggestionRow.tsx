import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Listing } from '../../types';
import { ListingGallery } from './ListingGallery';
import { PriceTag, DiscountFlag } from './PriceTag';

/**
 * A titled row of listing cards under a listing.
 *
 * <p>Extracted when the listing page grew a second one. The two rows answer
 * different questions - "more like this" and "what else did people open" - and
 * the whole point is that a reader can tell them apart, which only works if
 * the cards themselves are identical and the heading is the only difference.
 */

interface SuggestionRowProps {
  title: string;
  /** A line under the heading saying where these came from. Optional. */
  caption?: string;
  listings: Listing[];
  onSelect: (listing: Listing) => void;
  /** Renders a "View all" link when given. */
  onViewAll?: () => void;
}

export const SuggestionRow: React.FC<SuggestionRowProps> = ({
  title, caption, listings, onSelect, onViewAll,
}) => {
  if (listings.length === 0) return null;

  return (
    <div className="mt-10 sm:mt-14">
      <div className="flex items-center justify-between mb-5 gap-4">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h2>
          {caption && <p className="text-sm text-slate-500 mt-0.5">{caption}</p>}
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="shrink-0 text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            View all <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {listings.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(item);
              }
            }}
            className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
              <ListingGallery
                images={item.gallery?.length ? item.gallery : [item.image]}
                alt={item.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              {/* This row was the last grid in the app still quoting a bare
                  price, which made the cheaper alternative to what you are
                  looking at the one place its saving was invisible. */}
              <div className="absolute top-2.5 left-2.5">
                <DiscountFlag percent={item.discountPercent} />
              </div>
            </div>
            <div className="p-3 sm:p-4">
              <h3 className="font-bold text-slate-900 text-sm truncate group-hover:text-blue-600 transition-colors">
                {item.title}
              </h3>
              <div className="flex items-center justify-between gap-2 mt-1.5">
                <PriceTag listing={item} size="sm" />
                <span className="text-xs text-slate-400 font-medium shrink-0">
                  {item.categoryName || item.category}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
