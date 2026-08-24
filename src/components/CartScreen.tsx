import React, { useEffect, useState } from 'react';
import {
  ShoppingBag, Trash2, ArrowLeft, CheckCircle2, ShieldCheck, ShoppingCart,
  Minus, Plus, Loader2, AlertTriangle, MessageSquare, Tag, X, Store, Heart, Phone,
} from 'lucide-react';
import { api } from '../services/api';
import { AuthSession, CAMPUS_ZONES, CampusZone, Order, zoneLabel } from '../types';
import { Modal, ErrorBanner, Field } from './shared/Modal';
import { formatPrice } from '../utils/currency';

interface CartScreenProps {
  onBack: () => void;
  /** Seeds the meetup zone, since most handovers happen near where you live. */
  currentUser?: AuthSession;
  onExplore: () => void;
  onCartUpdated?: () => void;
  onGoToMessages?: () => void;
  onGoToOrders?: () => void;
  /** Resolves true once the listing is saved. Owned by App, which holds the
   *  saved list and so can tell "save it" from "it is already saved". */
  onSaveForLater?: (listingId: string) => Promise<boolean>;
  onGoToSaved?: () => void;
  /** Where "Add number" goes when the buyer has no phone on file. */
  onGoToProfile?: () => void;
}

interface CartRow {
  id: string;
  listing: {
    id: string; title: string; price: number; image?: string; status: string; removed: boolean;
    /** Null when there is no limit; 1 for a one-of-a-kind second-hand item. */
    availableStock?: number | null;
  };
  seller: { id: string; name: string };
  quantity: number;
  lineTotal: number;
  available: boolean;
  unavailableReason?: string;
}

interface CheckoutSummary {
  /** One order per seller - each accepts or declines their own independently. */
  orders: Order[];
  skipped: string[];
}

export const CartScreen: React.FC<CartScreenProps> = ({
  onBack,
  currentUser,
  onExplore,
  onCartUpdated,
  onGoToMessages,
  onGoToOrders,
  onSaveForLater,
  onGoToSaved,
  onGoToProfile,
}) => {
  /*
   * Nothing on this platform is delivered - every order ends with two people
   * meeting somewhere on campus. A buyer with no number on file has left the
   * seller with only the chat thread to find them by, which works right up
   * until someone is standing outside the library wondering if the other one
   * came. So the gap is raised at the two moments it is actually about to
   * matter, and never as a blocker: an order with a chat thread is still a
   * perfectly workable order.
   */
  const missingPhone = !currentUser?.phone?.trim();
  const [items, setItems] = useState<CartRow[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [meetupZone, setMeetupZone] = useState<CampusZone | ''>(currentUser?.campusZone ?? '');
  const [orderNote, setOrderNote] = useState('');
  /** Row whose save is in flight, so only that row shows the spinner. */
  const [savingId, setSavingId] = useState<string | null>(null);
  /** Title of the last item moved out, so the cart can say where it went. */
  const [justSaved, setJustSaved] = useState<string | null>(null);

  /**
   * Refetch the cart.
   *
   * `silent` skips the full-page spinner, which is what a refresh following an
   * edit wants: the row's buttons are already disabled by `busy`, and swapping
   * the whole screen for "Loading your cart…" on every press of + made
   * adjusting a quantity feel like leaving the page and coming back.
   */
  const loadCart = async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await api.cart.getAll();
    if (res.status === 401 || res.status === 403) {
      setError(res.error || 'You do not have access to a cart.');
      setItems([]);
    } else {
      setError(null);
      setItems((res.raw?.items as CartRow[]) || []);
      setSubtotal(res.subtotal || 0);
    }
    setLoading(false);
  };

  useEffect(() => { loadCart(); }, []);

  const applyResult = async (ok: boolean, message?: string) => {
    await loadCart(true);
    /*
     * Reported after the refetch, not before it.
     *
     * A successful refetch clears the banner, so an error set first was wiped
     * before it could ever be read - the server's "Only 2 left." arrived, was
     * thrown away, and the stepper just snapped back with no explanation.
     */
    if (!ok) setError(message || 'That did not work.');
    onCartUpdated?.();
  };

  const changeQuantity = async (row: CartRow, next: number) => {
    setBusy(true);
    const res = await api.cart.updateQuantity(row.id, next);
    setBusy(false);
    applyResult(res.success, res.error);
  };

  const removeItem = async (row: CartRow) => {
    setBusy(true);
    const res = await api.cart.remove(row.id);
    setBusy(false);
    applyResult(res.success, res.error);
  };

  /*
   * Save it, then drop the line - in that order, and only if the save actually
   * took. Removing first would mean a failed save loses the item outright,
   * which is the one outcome "save for later" must never produce.
   */
  const saveForLater = async (row: CartRow) => {
    if (!onSaveForLater) return;
    setSavingId(row.id);
    const saved = await onSaveForLater(row.listing.id);
    if (!saved) {
      setSavingId(null);
      setError('Could not save that item, so it is still in your cart.');
      return;
    }
    const res = await api.cart.remove(row.id);
    setSavingId(null);
    if (res.success) setJustSaved(row.listing.title);
    applyResult(res.success, res.error);
  };

  const checkout = async () => {
    setBusy(true);
    setError(null);
    // Writes one order per seller and opens the matching chat thread. An
    // omitted zone still falls back to the buyer's own, server-side.
    const res = await api.orders.checkout({
      meetupZone: meetupZone || undefined,
      note: orderNote.trim() || undefined,
    });
    setBusy(false);

    if (res.success) {
      setConfirmOpen(false);
      setOrderNote('');
      setSummary({ orders: res.orders || [], skipped: res.skipped || [] });
      // Silent: the confirmation is already on screen behind this, and the
      // full-page spinner used to blink over it in the seconds right after the
      // most consequential press in the app.
      await loadCart(true);
      onCartUpdated?.();
    } else {
      /*
       * Refetch first, report second.
       *
       * A successful refetch clears the banner, so setting the error before it
       * threw the message away: a rejected checkout closed nothing, explained
       * nothing, and handed back a "Place order" button looking exactly as it
       * had before it was pressed. This is the worst place in the app to fail
       * quietly - the usual cause is something selling out between opening the
       * review and confirming it, which is precisely what the buyer needs told.
       */
      await loadCart(true);
      setError(res.error || 'Could not place your order.');
    }
  };

  /** True when this row already holds everything the seller has. */
  const atStockLimit = (row: CartRow) =>
    typeof row.listing.availableStock === 'number' && row.quantity >= row.listing.availableStock;

  const availableItems = items.filter((i) => i.available);
  const unavailableCount = items.filter((i) => !i.available).length;
  const canCheckout = !busy && availableItems.length > 0;

  /* Checkout writes one order per seller, and until now the cart gave no hint
     of that - you pressed "Place order" once and three orders appeared. Sorting
     by seller lets the list be headed by who each item comes from, so the split
     is visible before it happens rather than explained afterwards. */
  const sortedItems = [...items].sort((a, b) =>
    a.seller.name.localeCompare(b.seller.name) || a.listing.title.localeCompare(b.listing.title));

  const sellerCount = new Set(availableItems.map((i) => i.seller.id)).size;

  /** Items from one seller, for the per-seller subtotal in its header. */
  const sellerTotal = (sellerId: string) =>
    availableItems.filter((i) => i.seller.id === sellerId)
      .reduce((sum, i) => sum + i.lineTotal, 0);

  const CheckoutButton = ({ className = '' }: { className?: string }) => (
    <button
      onClick={() => { setError(null); setConfirmOpen(true); }}
      disabled={!canCheckout}
      className={`py-3.5 bg-[#2563eb] text-white rounded-2xl font-semibold hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 ${className}`}
    >
      {busy ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Placing order…</span>
        </>
      ) : (
        <>
          <ShoppingBag className="w-5 h-5" />
          <span>Review order</span>
        </>
      )}
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#434655]">
          <Loader2 className="w-8 h-8 animate-spin text-[#2563eb]" />
          <span className="text-sm font-medium">Loading your cart…</span>
        </div>
      </div>
    );
  }

  if (error && items.length === 0 && !summary) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-10 max-w-md text-center shadow-card border border-red-100">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <ShoppingBag className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-[#0b1c30] mb-2">Cart unavailable</h2>
          <p className="text-sm text-[#737686] mb-8">{error}</p>
          <button
            onClick={onBack}
            className="px-8 py-3 bg-[#2563eb] text-white rounded-2xl font-semibold hover:bg-[#1d4ed8] transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const showMobileBar = !summary && items.length > 0;

  return (
    <div className={`min-h-screen bg-[#f8f9ff] py-6 px-4 sm:px-6 lg:px-8 ${showMobileBar ? 'pb-28 lg:pb-6' : ''}`}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[#434655] hover:text-[#2563eb] font-medium transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to shop</span>
          </button>
          {items.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-[#737686]">
              <ShoppingBag className="w-4 h-4" />
              <span className="font-semibold">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
            </div>
          )}
        </div>

        <ErrorBanner message={error} />

        {/* An item that vanishes from the cart looks deleted whatever the
            button said, so the move is confirmed with a way to follow it. */}
        {justSaved && !summary && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#dbe1ff] bg-[#eff4ff] px-4 py-3">
            <p className="text-xs font-semibold text-[#0b1c30] min-w-0">
              <span className="truncate">“{justSaved}”</span> moved to your saved items.
            </p>
            <div className="flex items-center gap-1 shrink-0">
              {onGoToSaved && (
                <button
                  onClick={onGoToSaved}
                  className="text-xs font-bold text-[#2563eb] hover:text-[#004ac6] px-2 py-1"
                >
                  View saved
                </button>
              )}
              <button
                onClick={() => setJustSaved(null)}
                aria-label="Dismiss"
                className="p-1 rounded-full text-[#737686] hover:text-[#0b1c30] hover:bg-white/70"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {summary ? (
          <div className="bg-white rounded-3xl p-8 md:p-12 shadow-card border border-[#e5eeff]">
            <div className="text-center max-w-2xl mx-auto">
              <div className="w-16 h-16 bg-[#e6faf1] text-[#007d55] rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-[#0b1c30] mb-2">
                {summary.orders.length === 1 ? 'Order placed' : 'Orders placed'}
              </h2>
              <p className="text-[#737686] mb-8 text-sm">
                Each seller now sees your order and can accept or decline it. A chat thread is open
                with each of them for arranging payment and pickup.
              </p>
            </div>

            <div className="grid gap-3 max-w-2xl mx-auto">
              {summary.orders.map((order) => (
                <div key={order.id} className="border border-[#e5eeff] rounded-2xl p-5 bg-[#f8f9ff]">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 shrink-0 bg-[#eff4ff] rounded-xl flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-[#2563eb]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-sm text-[#0b1c30]">{order.counterparty.name}</p>
                        <span className="text-[11px] font-mono font-bold text-[#737686] shrink-0">
                          {order.reference}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {order.items.map((item) => (
                          <li key={item.id} className="text-xs text-[#737686] flex items-center gap-2">
                            <span className="w-1 h-1 bg-[#2563eb] rounded-full shrink-0" />
                            {item.title}
                            {item.quantity > 1 && <span className="font-semibold">× {item.quantity}</span>}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs font-bold text-[#2563eb]">
                        {formatPrice(order.total)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {/* The one moment this is both true and actionable: the order
                  exists, a seller is about to arrange a meeting, and nothing
                  is half-finished if they step away to add a number. */}
              {missingPhone && (
                <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs text-amber-900">
                        Add your phone number
                      </p>
                      <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                        {summary.orders.length === 1 ? 'Your seller' : 'Your sellers'} will arrange a
                        meeting spot with you. A number makes that far easier than chat alone.
                      </p>
                    </div>
                    {onGoToProfile && (
                      <button
                        onClick={onGoToProfile}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 transition-colors"
                      >
                        Add number
                      </button>
                    )}
                  </div>
                </div>
              )}

              {summary.skipped.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold text-xs text-amber-800">Removed — no longer available</p>
                      <ul className="mt-2 space-y-1">
                        {summary.skipped.map((t) => (
                          <li key={t} className="text-xs text-amber-700 flex items-center gap-2">
                            <X className="w-3 h-3 shrink-0" />
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
              {onGoToOrders && (
                <button
                  onClick={onGoToOrders}
                  className="w-full sm:w-auto px-8 py-3 bg-[#2563eb] text-white rounded-2xl font-semibold hover:bg-[#1d4ed8] transition-colors"
                >
                  Track my orders
                </button>
              )}
              {onGoToMessages && (
                <button
                  onClick={onGoToMessages}
                  className="w-full sm:w-auto px-8 py-3 border border-[#e5eeff] text-[#434655] rounded-2xl font-semibold hover:bg-[#f8f9ff] transition-colors"
                >
                  Go to messages
                </button>
              )}
              <button
                onClick={onExplore}
                className="w-full sm:w-auto px-8 py-3 border border-[#e5eeff] text-[#434655] rounded-2xl font-semibold hover:bg-[#f8f9ff] transition-colors"
              >
                Keep browsing
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 md:p-20 text-center shadow-card border border-[#e5eeff]">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 bg-[#eff4ff] text-[#2563eb] rounded-full flex items-center justify-center mx-auto mb-6">
                <ShoppingCart className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-[#0b1c30] mb-3">Your cart is empty</h2>
              <p className="text-[#737686] mb-8 text-sm">
                Discover gadgets, accessories, electronics, and more across campus.
              </p>
              <button
                onClick={onExplore}
                className="px-10 py-3 bg-[#2563eb] text-white rounded-2xl font-semibold hover:bg-[#1d4ed8] transition-colors"
              >
                Browse marketplace
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold text-[#0b1c30]">Your items</h2>
                <span className="text-xs font-medium text-[#737686]">{availableItems.length} available</span>
              </div>

              {sortedItems.map((row, i) => (
                <React.Fragment key={row.id}>
                  {/* One header per seller, opening each run of their items. */}
                  {(i === 0 || sortedItems[i - 1].seller.id !== row.seller.id) && (
                    <div className="flex items-baseline justify-between gap-3 pt-3 first:pt-0">
                      <p className="text-xs font-bold text-[#434655] flex items-center gap-1.5 min-w-0">
                        <Store className="w-3.5 h-3.5 text-[#a0a3b1] shrink-0" />
                        <span className="truncate">{row.seller.name}</span>
                      </p>
                      {sellerTotal(row.seller.id) > 0 && (
                        <span className="text-xs font-semibold text-[#737686] shrink-0">
                          {formatPrice(sellerTotal(row.seller.id))}
                        </span>
                      )}
                    </div>
                  )}
                  <div
                    className={`bg-white rounded-2xl p-4 shadow-card hover:shadow-card-hover transition-shadow border ${row.available ? 'border-[#e5eeff]' : 'border-amber-200 bg-amber-50/40'
                      }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                        {row.listing.removed || !row.listing.image ? (
                          <div className="w-16 h-16 rounded-xl bg-[#eff4ff] border border-[#dbe1ff] flex items-center justify-center shrink-0">
                            <Tag className="w-6 h-6 text-[#b4c5ff]" />
                          </div>
                        ) : (
                          <img
                            src={row.listing.image}
                            alt={row.listing.title}
                            className={`w-16 h-16 rounded-xl object-cover border border-[#e5eeff] shrink-0 ${row.available ? '' : 'grayscale opacity-60'
                              }`}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className={`font-bold text-sm truncate ${row.available ? 'text-[#0b1c30]' : 'text-[#737686]'}`}>
                            {row.listing.title}
                          </h3>
                          {row.available ? (
                            <div className="flex items-baseline gap-1.5 mt-1">
                              <span className="text-lg font-extrabold text-[#2563eb]">{formatPrice(row.lineTotal)}</span>
                              {row.quantity > 1 && (
                                <span className="text-xs text-[#a0a3b1]">({formatPrice(row.listing.price)} each)</span>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs font-semibold text-amber-700 mt-1 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {row.unavailableReason || 'No longer available'}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        {row.available && (
                          <div className="flex items-center border border-[#dbe1ff] rounded-xl overflow-hidden bg-white">
                            {/* Stops at 1. The server reads any quantity below
                              one as "delete this row", so the last press of −
                              silently removed the item - a surprising end for
                              a button that had merely decremented every other
                              time, and an unrecoverable one on a marketplace
                              where most items are one-of-a-kind. Taking it out
                              is what the two buttons to the right are for, and
                              both of those say which they do. */}
                            <button
                              onClick={() => changeQuantity(row, row.quantity - 1)}
                              disabled={busy || row.quantity <= 1}
                              aria-label="Decrease quantity"
                              className="px-3 py-2 hover:bg-[#eff4ff] text-[#434655] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-3 text-sm font-bold text-[#0b1c30] min-w-[24px] text-center">
                              {row.quantity}
                            </span>
                            {/* Disabled at the limit rather than letting the
                              press fail: the server refuses it anyway, and a
                              button that only ever errors is worse than one
                              that visibly cannot be pressed. */}
                            <button
                              onClick={() => changeQuantity(row, row.quantity + 1)}
                              disabled={busy || atStockLimit(row)}
                              aria-label="Increase quantity"
                              title={atStockLimit(row) ? 'No more of these available' : undefined}
                              className="px-3 py-2 hover:bg-[#eff4ff] text-[#434655] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {/* Not everything you take out of a cart is something
                          you stopped wanting. Deleting was the only way out,
                          so second thoughts about buying it today cost you the
                          listing - on a marketplace where most items are
                          one-of-one, finding it again is not a given. */}
                        {onSaveForLater && row.available && !row.listing.removed && (
                          <button
                            onClick={() => saveForLater(row)}
                            disabled={busy || savingId === row.id}
                            className="p-2.5 text-[#737686] hover:text-[#2563eb] hover:bg-[#eff4ff] rounded-xl transition-colors disabled:opacity-50"
                            aria-label={`Save ${row.listing.title} for later`}
                            title="Save for later"
                          >
                            {savingId === row.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Heart className="w-4 h-4" />}
                          </button>
                        )}
                        <button
                          onClick={() => removeItem(row)}
                          disabled={busy || savingId === row.id}
                          className="p-2.5 text-[#737686] hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                          aria-label="Remove from cart"
                          title="Remove from cart"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* Order Summary — desktop sidebar */}
            <div className="hidden lg:block lg:sticky lg:top-6 h-fit">
              <div className="bg-white rounded-2xl p-6 shadow-card border border-[#e5eeff] space-y-5">
                <h3 className="font-bold text-lg text-[#0b1c30]">Order summary</h3>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#434655]">Available items ({availableItems.length})</span>
                    <span className="font-semibold text-[#0b1c30]">{formatPrice(subtotal)}</span>
                  </div>
                  {unavailableCount > 0 && (
                    <div className="flex justify-between text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-xl">
                      <span>Unavailable items</span>
                      <span className="font-semibold">{unavailableCount}</span>
                    </div>
                  )}
                  {/* Said before the button, not after: finding out you placed
                      three orders instead of one is a surprise, and surprises
                      belong on the near side of an irreversible action. */}
                  {sellerCount > 1 && (
                    <div className="flex items-start gap-2 text-xs text-[#434655] bg-[#f8f9ff] border border-[#e5eeff] px-3 py-2.5 rounded-xl">
                      <Store className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#2563eb]" />
                      <span>
                        Goes to <span className="font-semibold">{sellerCount} sellers</span> as{' '}
                        {sellerCount} separate orders. Each one accepts or declines their own.
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-[#434655]">Campus pickup</span>
                    <span className="text-[#007d55] font-semibold">Free</span>
                  </div>
                </div>

                <div className="border-t border-[#e5eeff] pt-4 flex justify-between items-center">
                  <span className="font-bold text-base text-[#0b1c30]">Total</span>
                  <span className="text-xl font-bold text-[#2563eb]">{formatPrice(subtotal)}</span>
                </div>

                <CheckoutButton className="w-full" />

                <p className="text-xs text-[#737686] text-center leading-relaxed">
                  No payment is taken here — this opens a chat with each seller to arrange pickup.
                </p>

                <div className="flex items-center justify-center gap-2 text-xs text-[#737686] pt-1 border-t border-[#e5eeff]">
                  <ShieldCheck className="w-4 h-4 text-[#007d55]" />
                  <span>Student-to-student direct deal</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile checkout bar — keeps total + action reachable without scrolling past every item */}
      {showMobileBar && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#e5eeff] px-4 py-3 shadow-[0_-4px_16px_rgba(11,28,48,0.08)]">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-[#737686] leading-tight">
                Total {unavailableCount > 0 && <span className="text-amber-700">· {unavailableCount} unavailable</span>}
              </p>
              <p className="text-lg font-bold text-[#0b1c30] leading-tight">{formatPrice(subtotal)}</p>
            </div>
            <CheckoutButton className="flex-1" />
          </div>
        </div>
      )}

      {/* The review step. Placing an order messages real people and commits
          you to meeting them, so the last thing before it is a summary of who
          gets what and where - not a button that fires on first press. */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Review your order"
        subtitle={
          sellerCount > 1
            ? `${availableItems.length} item(s) going to ${sellerCount} sellers`
            : `${availableItems.length} item(s)`
        }
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setConfirmOpen(false)}
              className="btn-ghost !rounded-xl !text-sm"
            >
              Back to cart
            </button>
            <button
              onClick={checkout}
              disabled={busy}
              className="btn-primary !rounded-xl !text-sm flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Placing…' : `Place order · ${formatPrice(subtotal)}`}
            </button>
          </div>
        }
      >
        <ErrorBanner message={error} />

        <div className="space-y-2 mb-4 max-h-52 overflow-y-auto pr-1">
          {availableItems.map((row) => (
            <div key={row.id} className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-md bg-[#eff4ff] text-[#2563eb] text-[11px] font-bold flex items-center justify-center shrink-0">
                {row.quantity}
              </span>
              <span className="text-sm text-[#0b1c30] truncate flex-1">{row.listing.title}</span>
              <span className="text-sm font-semibold text-[#434655] shrink-0">
                {formatPrice(row.lineTotal)}
              </span>
            </div>
          ))}
        </div>

        {sellerCount > 1 && (
          <p className="mb-4 flex items-start gap-2 text-xs text-[#434655] bg-[#f8f9ff] border border-[#e5eeff] rounded-xl px-3 py-2.5">
            <Store className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#2563eb]" />
            <span>
              This becomes <span className="font-semibold">{sellerCount} separate orders</span>.
              Each seller accepts or declines their own.
            </span>
          </p>
        )}

        {/* Said here rather than after the fact, for the same reason the
            multi-seller split is: this is the near side of a button that
            messages real people and commits you to meeting them. */}
        {missingPhone && (
          <p className="mb-4 flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            <Phone className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
            <span>
              <span className="font-semibold">No phone number on your account.</span>{' '}
              The seller can still reach you in chat, but a number is how people
              actually find each other at the handover. You can add one after
              placing this order.
            </span>
          </p>
        )}

        <Field label="Where do you want to meet?">
          <select
            value={meetupZone}
            onChange={(e) => setMeetupZone(e.target.value as CampusZone | '')}
            className="input-base text-sm"
          >
            {/* Blank is honest rather than a silent default: the server picks
                the buyer's own zone, and this says so instead of pretending a
                choice was made. */}
            <option value="">
              {currentUser?.campusZone
                ? `My zone (${zoneLabel(currentUser.campusZone)})`
                : 'Let the seller suggest a spot'}
            </option>
            {CAMPUS_ZONES.map((z) => (
              <option key={z.value} value={z.value}>{z.label}</option>
            ))}
          </select>
        </Field>

        <div className="mt-3">
          <Field label="Note for the seller (optional)">
            <textarea
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              rows={2}
              placeholder="e.g. I'm free after 4pm, near the library."
              className="input-base text-sm resize-none"
            />
          </Field>
        </div>

        <p className="mt-3 text-xs text-[#737686] leading-relaxed">
          Nothing is paid now. You pay in person when you collect, and either side can cancel
          before that.
        </p>
      </Modal>
    </div>
  );
};
