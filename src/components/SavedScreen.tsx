import React, { useState } from 'react';
import {
  Trash2, SlidersHorizontal, ShieldCheck, MapPin, Heart,
  ChevronDown, ShoppingBag, BellRing, Loader2,
} from 'lucide-react';
import { AddToCart, AuthSession, Listing } from '../types';
import { formatPrice } from '../utils/currency';
import { ListingImage } from './shared/ListingImage';

interface SavedScreenProps {
  savedListings: Listing[];
  onSelectListing: (listing: Listing) => void;
  onRemoveSaved: (listingId: string) => void;
  onBrowseMore: () => void;
  /** Moves an item the other way: wishlist back into the cart. */
  onAddToCart?: AddToCart;
  currentUser?: AuthSession;
}

const SORTS = [
  { value: 'Recent', label: 'Recently saved' },
  { value: 'PriceLow', label: 'Price: Low to High' },
  { value: 'PriceHigh', label: 'Price: High to Low' },
] as const;

type SortValue = (typeof SORTS)[number]['value'];

export const SavedScreen: React.FC<SavedScreenProps> = ({
  savedListings,
  onSelectListing,
  onRemoveSaved,
  onBrowseMore,
  onAddToCart,
  currentUser,
}) => {
  const [sortBy, setSortBy] = useState<SortValue>('Recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  /* 'Recent' keeps server order, which is already newest-saved-first
     (findByUserIdOrderByCreatedAtDesc) - re-sorting it here by any field the
     listing carries would order by when it was POSTED, which is a different
     thing wearing the same label. */
  const sortedListings = [...savedListings].sort((a, b) => {
    if (sortBy === 'PriceLow') return a.price - b.price;
    if (sortBy === 'PriceHigh') return b.price - a.price;
    return 0;
  });

  const sortLabel = SORTS.find((s) => s.value === sortBy)!.label;

  const canBuy = currentUser && currentUser.role !== 'guest' && currentUser.role !== 'admin';

  const handleAddToCart = async (item: Listing, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onAddToCart) return;
    setAddingId(item.id);
    // `{ event: e }`, as the browse and search grids send it. The event used to
    // be passed positionally into the options slot, so the handler's own
    // stopPropagation never ran - harmless only because of the call above it.
    await onAddToCart(item, { event: e });
    setAddingId(null);
  };

  /**
   * Whether this saved item can go straight into the cart.
   *
   * The same test the browse and search grids apply, and it has to be: this
   * screen alone required `category === 'Product'`, which quietly stranded
   * saved food. Only services are uncartable - they are arranged with their
   * seller - and the server agrees, rejecting SERVICE and nothing else.
   * Someone's own listing is excluded too, since the server refuses that and
   * an offered button that only ever errors is worse than no button.
   */
  const canQuickAdd = (item: Listing) =>
    !!onAddToCart
    && !!canBuy
    && item.isAvailable
    && item.category !== 'Service'
    && item.seller?.id !== currentUser?.id;

  /** Sold and reserved items are still listed - they just can't be bought. */
  const unavailableCount = savedListings.filter((i) => !i.isAvailable).length;

  return (
    <div className="min-h-screen bg-[#f8f9ff] pb-28">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-7">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0b1c30]">Saved Items</h1>
            <p className="text-sm text-[#737686] font-medium mt-1">
              You have{' '}
              <span className="font-bold text-[#2563eb]">
                {savedListings.length} item{savedListings.length !== 1 ? 's' : ''}
              </span>{' '}
              on your wishlist
              {unavailableCount > 0 && (
                <span className="text-[#737686]">
                  {' '}· {unavailableCount} no longer available
                </span>
              )}
            </p>
          </div>

          {/* The same dropdown the feed and search results use. It was a button
              that cycled through three states, so the options you were not
              currently on were invisible and the only way to reach the third
              was to pass through the second. */}
          {savedListings.length > 0 && (
            <div className="relative shrink-0 mt-1">
              <button
                onClick={() => setSortOpen((o) => !o)}
                aria-expanded={sortOpen}
                aria-label={`Sort: ${sortLabel}`}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#eff4ff] hover:bg-[#dbe1ff] text-[#2563eb] text-xs font-bold transition-all duration-150"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{sortLabel}</span>
                <span className="sm:hidden">Sort</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 mt-1.5 z-20 w-52 bg-white rounded-2xl border border-[#e5eeff] shadow-modal overflow-hidden py-1">
                    {SORTS.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => { setSortBy(s.value); setSortOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-semibold transition-colors ${
                          sortBy === s.value
                            ? 'bg-[#eff4ff] text-[#2563eb]'
                            : 'text-[#434655] hover:bg-[#f8f9ff]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Saving a listing already subscribes you to its price drops, in
            ListingService. There used to be a bell on every card offering to
            turn that on - it called nothing, had no off state, and took credit
            for something saving had already done. Said once, as a fact. */}
        {savedListings.length > 0 && (
          <p className="flex items-center gap-2 text-xs text-[#434655] bg-white border border-[#e5eeff] rounded-xl px-3.5 py-2.5 mb-6">
            <BellRing className="w-3.5 h-3.5 text-[#2563eb] shrink-0" />
            <span>We'll notify you if anything here drops in price.</span>
          </p>
        )}

        {sortedListings.length === 0 ? (
          /* ── Empty State ── */
          <div className="text-center py-20 bg-white rounded-3xl shadow-card border border-[#e5eeff]">
            <div className="w-16 h-16 bg-[#eff4ff] rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-[#2563eb]" />
            </div>
            <h3 className="text-lg font-bold text-[#0b1c30]">Your wishlist is empty</h3>
            <p className="text-sm text-[#737686] mt-1.5 max-w-xs mx-auto">
              Tap the heart icon on any listing to save it here for later.
            </p>
            <button
              onClick={onBrowseMore}
              className="btn-primary !h-10 !px-6 !text-xs !rounded-xl mt-5 mx-auto"
            >
              Explore Campus Feed
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {sortedListings.map((item, itemIndex) => {
              const unavailable = !item.isAvailable;
              return (
              <div
                key={item.id}
                // The first card, not the whole list: a wishlist runs taller
                // than a phone screen, and a highlight around all of it points
                // at nothing in particular.
                data-onboarding={itemIndex === 0 ? 'saved-first' : undefined}
                onClick={() => onSelectListing(item)}
                className={`bg-white rounded-3xl border shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 overflow-hidden cursor-pointer group ${
                  unavailable ? 'border-[#c3c6d7]' : 'border-[#e5eeff]'
                }`}
              >
                {/* Banner image */}
                <div className="relative aspect-[16/9] w-full bg-[#e5eeff] overflow-hidden">
                  <ListingImage
                    src={item.image}
                    alt={item.title}
                    className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                      unavailable ? 'grayscale opacity-60' : ''
                    }`}
                  />

                  {/* The server sends sold and reserved items back on purpose,
                      flagged, so they can be labelled rather than silently
                      disappearing. Nothing was reading the flag, so a sold item
                      sat here looking perfectly buyable. */}
                  {unavailable && (
                    <div className="absolute inset-0 bg-[#0b1c30]/45 backdrop-blur-[1px] flex items-center justify-center">
                      <span className="px-4 py-1.5 rounded-xl bg-white/95 text-[#0b1c30] text-sm font-bold uppercase tracking-widest shadow-sm">
                        {item.badgeText === 'Reserved' ? 'Reserved' : 'Sold'}
                      </span>
                    </div>
                  )}

                  {/* Verified badge */}
                  {item.seller.verified && !unavailable && (
                    <div className="absolute bottom-3 left-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white/95 text-[#0b1c30] text-xs font-bold shadow-sm">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#2563eb] mr-1" />
                        Verified Seller
                      </span>
                    </div>
                  )}

                  <div className="absolute top-3 right-3 flex flex-col space-y-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveSaved(item.id); }}
                      className="w-9 h-9 rounded-full bg-white/95 hover:bg-red-50 text-[#434655] hover:text-red-600 flex items-center justify-center shadow-card transition-all duration-150"
                      title="Remove from wishlist"
                      aria-label={`Remove ${item.title} from wishlist`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Card info */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-lg font-bold transition-colors duration-150 ${
                        unavailable
                          ? 'text-[#737686]'
                          : 'text-[#0b1c30] group-hover:text-[#2563eb]'
                      }`}>
                        {item.title}
                      </h3>
                      <div className="flex items-center text-xs text-[#737686] mt-1">
                        <MapPin className="w-3.5 h-3.5 mr-1 text-[#b4c5ff]" />
                        <span>{item.location}</span>
                      </div>
                    </div>
                    <div className={`font-extrabold text-xl shrink-0 ${
                      unavailable ? 'text-[#a0a3b1]' : 'text-[#2563eb]'
                    }`}>
                      {formatPrice(item.price)}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#e5eeff] flex items-center justify-between gap-3 text-xs font-semibold">
                    <span className="text-[#737686]">{item.postedAt}</span>

                    {/* The cart can send an item here; until now nothing sent
                        one back, so the only route from wishlist to purchase
                        was to open the listing and start again. That applied to
                        saved food too, which is cartable everywhere else in the
                        app - a saved meal offered no way to buy it. */}
                    {canQuickAdd(item) ? (
                      <button
                        onClick={(e) => handleAddToCart(item, e)}
                        disabled={addingId === item.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-bold transition-colors disabled:opacity-60"
                        aria-label={`Add ${item.title} to cart`}
                      >
                        {addingId === item.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <ShoppingBag className="w-3.5 h-3.5" />}
                        Add to cart
                      </button>
                    ) : (
                      <span className="text-[#2563eb] group-hover:underline">View Details →</span>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
