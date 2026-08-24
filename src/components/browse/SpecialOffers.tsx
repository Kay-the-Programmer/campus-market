import React, { useEffect, useState } from 'react';
import { Heart, MapPin, ShoppingBag, MessageSquare, Tag, Loader2 } from 'lucide-react';
import { AddToCart, AuthSession, Listing } from '../../types';
import { api } from '../../services/api';
import { formatPrice } from '../../utils/currency';
import { useChatSeller, ConnectingToSellerOverlay } from '../../hooks/useChatSeller';

interface SpecialOffersProps {
  onSelectListing: (listing: Listing) => void;
  onToggleSave: (listingId: string, e: React.MouseEvent) => void;
  onAddToCart?: AddToCart;
  onOpenChat?: (listing: Listing, conversationId?: string) => void;
  currentUser?: AuthSession;
  /** Saves made elsewhere, mirrored onto the hearts here. */
  listings: Listing[];
}

const MAX_OFFERS = 8;

/**
 * The Special Offers shelf.
 *
 * <p>Everything on it is a real listing an admin has promoted, so the picture,
 * the price and the seller are the same ones the buyer meets at handover -
 * there is no separate "deal" record that can drift from the thing being sold.
 *
 * <p>Fetched here rather than filtered out of the feed the parent already
 * holds: the feed is paginated and zone-filtered, so an offer could easily be
 * on page three or outside the chosen zone and silently vanish from a shelf
 * that is supposed to be the same for everyone.
 */
export const SpecialOffers: React.FC<SpecialOffersProps> = ({
  onSelectListing,
  onToggleSave,
  onAddToCart,
  onOpenChat,
  currentUser,
  listings,
}) => {
  const [offers, setOffers] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { chatSeller, connectingTo, isConnecting } = useChatSeller(currentUser, onOpenChat);

  useEffect(() => {
    api.listings
      .search({ specialOffer: 'true', size: MAX_OFFERS })
      .then((res) => {
        setOffers(res.listings);
        setLoading(false);
      });
  }, []);

  /* Hearts have to agree with the rest of the app - saving from the feed and
     then scrolling up should not show two different states for one listing. */
  useEffect(() => {
    setOffers((prev) =>
      prev.map((o) => {
        const fresh = listings.find((l) => l.id === o.id);
        return fresh ? { ...o, isSaved: fresh.isSaved } : o;
      }),
    );
  }, [listings]);

  if (loading) {
    return (
      <section className="mb-7">
        <div className="h-5 w-32 bg-[#e5eeff] rounded animate-pulse mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#e5eeff]/80 overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-[#e5eeff]" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-[#e5eeff] rounded w-3/4" />
                <div className="h-5 bg-[#dce9ff] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // An empty shelf renders nothing at all. A "no offers right now" placeholder
  // would take up the best space on the page to say nothing.
  if (offers.length === 0) return null;

  const canShop = currentUser?.role !== 'admin';

  const quickAdd = async (listing: Listing, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onAddToCart) return;
    setBusyId(listing.id);
    await onAddToCart(listing, { event: e });
    setBusyId(null);
  };

  return (
    <section className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ffe8ec] text-[#b3123c] text-[10px] font-extrabold uppercase tracking-wider">
            <Tag className="w-3 h-3" />
            Quick Deals
          </span>
        </div>
        <h2 className="text-[11px] font-semibold text-[#737686]">
          Unbeatable prices
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {offers.map((item) => {
          const sold = item.badgeText === 'Sold' || item.badgeText === 'Reserved';
          return (
            <article
              key={item.id}
              onClick={() => onSelectListing(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectListing(item);
                }
              }}
              className="group bg-white rounded-2xl shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col cursor-pointer border border-[#ffd9e0] hover:border-[#ff9fb2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2"
            >
              {/* The picture carries this section - offers live or die on how
                  good the thing looks, so it gets the whole card width. */}
              <div className="relative aspect-[4/3] w-full bg-[#e5eeff] overflow-hidden">
                <img
                  src={item.image}
                  alt={item.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {typeof item.discountPercent === 'number' && (
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-[#b3123c] text-white text-[11px] font-extrabold shadow-sm">
                    -{item.discountPercent}%
                  </span>
                )}

                <button
                  onClick={(e) => onToggleSave(item.id, e)}
                  aria-label={item.isSaved ? 'Remove from saved' : 'Save listing'}
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-[#434655] hover:text-red-500 flex items-center justify-center shadow-card transition-all duration-150"
                >
                  <Heart className={`w-4 h-4 transition-all ${item.isSaved ? 'fill-red-500 text-red-500' : ''}`} />
                </button>

                {sold && (
                  <div className="absolute inset-x-0 bottom-0 bg-[#0b1c30]/75 backdrop-blur-[2px] py-1.5">
                    <span className="block text-center text-[11px] font-bold text-white uppercase tracking-widest">
                      {item.badgeText}
                    </span>
                  </div>
                )}
              </div>

              <div className="p-3 flex-1 flex flex-col">
                <h3 className="font-semibold text-[#0b1c30] text-sm truncate group-hover:text-[#2563eb] transition-colors duration-150">
                  {item.title}
                </h3>

                <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[#b3123c] font-extrabold text-lg tracking-tight">
                    {formatPrice(item.price)}
                  </span>
                  {/* Only shown when the server sent one, so the strike-through
                      is always a real previous price rather than decoration. */}
                  {typeof item.compareAtPrice === 'number' && (
                    <span className="text-xs font-semibold text-[#a0a3b1] line-through">
                      {formatPrice(item.compareAtPrice)}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#737686] font-medium min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-[#b4c5ff] shrink-0" />
                  <span className="truncate">{item.location}</span>
                </div>

                {/* Buy or ask without leaving the shelf. Both stop propagation
                    so the card's own "open details" click does not also fire. */}
                {!sold && canShop && (
                  <div className="mt-2.5 pt-2.5 border-t border-[#f1f2f7] flex items-center gap-1.5">
                    {/* A service is arranged with its seller, never carted -
                        the server rejects a service cart line, so offering
                        "Add" here only ever produced an error toast. Chat is
                        the whole action for it, so it takes the full width. */}
                    {item.category === 'Service' ? (
                      onOpenChat && (
                        <button
                          onClick={(e) => chatSeller(item, e)}
                          disabled={isConnecting}
                          aria-label={`Chat ${item.seller?.name ?? 'the seller'} about ${item.title}`}
                          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#004ac6] text-white text-[11px] font-bold transition-colors disabled:opacity-60"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Chat seller
                        </button>
                      )
                    ) : (
                      <>
                        {onAddToCart && (
                          <button
                            onClick={(e) => quickAdd(item, e)}
                            disabled={busyId === item.id}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#b3123c] hover:bg-[#8d0e2f] text-white text-[11px] font-bold transition-colors disabled:opacity-60"
                          >
                            {busyId === item.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <ShoppingBag className="w-3.5 h-3.5" />}
                            Add
                          </button>
                        )}
                        {onOpenChat && (
                          <button
                            onClick={(e) => chatSeller(item, e)}
                            disabled={isConnecting}
                            aria-label={`Ask ${item.seller?.name ?? 'the seller'} about ${item.title}`}
                            className="px-2 py-1.5 rounded-lg border border-[#dbe1ff] text-[#2563eb] hover:bg-[#eff4ff] transition-colors disabled:opacity-60"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <ConnectingToSellerOverlay listing={connectingTo} />
    </section>
  );
};
