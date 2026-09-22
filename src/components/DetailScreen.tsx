import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Heart, MapPin, Star, ChevronRight, Bookmark,
  MessageSquare, ShieldCheck, ShoppingBag, Trash2, Lock,
  Briefcase, Utensils, Flag, CalendarClock, Clock, ChevronDown, ChevronUp,
  Share2, Eye, MoreHorizontal, DoorOpen, Layers, ChevronLeft, Minus, Plus,
} from 'lucide-react';
import { AddToCart, Listing, AuthSession } from '../types';
import { api } from '../services/api';
import { ReportModal } from './shared/ReportModal';
import { BookingModal } from './shared/BookingModal';
import { Modal, ErrorBanner, Field } from './shared/Modal';
import { Breadcrumbs, Crumb } from './shared/Breadcrumbs';
import { useToast } from './shared/ToastProvider';
import { formatPrice } from '../utils/currency';
import { ListingImage } from './shared/ListingImage';
import { PriceTag, DiscountFlag } from './shared/PriceTag';

interface DetailScreenProps {
  listing: Listing;
  similarListings: Listing[];
  onBack: () => void;
  onToggleSave: (listingId: string, e?: React.MouseEvent) => void;
  onSelectSimilar: (listing: Listing) => void;
  /** `conversationId` is the thread to open, when the caller has just made one. */
  onOpenChat: (listing: Listing, conversationId?: string) => void;
  onViewSellerProfile: (sellerId: string) => void;
  currentUser: AuthSession;
  onOpenAuthModal: () => void;
  onListingDeleted?: () => void;
  onAddToCart?: AddToCart;
  /** Present only when this is the seller viewing their own listing. */
  onEditListing?: (listing: Listing) => void;
  /** "View all" under the similar row - browses the rest of this category. */
  onViewAllSimilar?: (listing: Listing) => void;
  /** Breadcrumb "Home". Absent in the Sell preview, which has nowhere to go. */
  onGoHome?: () => void;
  /** Renders inline rather than fixed - used for the Preview overlay in SellScreen. */
  embedded?: boolean;
}

const TYPE_STYLE: Record<string, { chip: string; icon: React.ReactNode; gradient: string }> = {
  Product: {
    chip: 'chip-product',
    icon: <ShoppingBag className="w-3 h-3" />,
    gradient: 'from-blue-500/10 to-indigo-500/5',
  },
  Service: {
    chip: 'chip-service',
    icon: <Briefcase className="w-3 h-3" />,
    gradient: 'from-violet-500/10 to-purple-500/5',
  },
  Food: {
    chip: 'chip-food',
    icon: <Utensils className="w-3 h-3" />,
    gradient: 'from-emerald-500/10 to-teal-500/5',
  },
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  Available: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    label: 'Available',
  },
  Reserved: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    label: 'Reserved',
  },
  Sold: {
    bg: 'bg-slate-100',
    text: 'text-slate-500',
    border: 'border-slate-200',
    label: 'Sold',
  },
};

export const DetailScreen: React.FC<DetailScreenProps> = ({
  listing,
  similarListings,
  onBack,
  onToggleSave,
  onSelectSimilar,
  onOpenChat,
  onViewSellerProfile,
  currentUser,
  onOpenAuthModal,
  onListingDeleted,
  onAddToCart,
  onEditListing,
  onViewAllSimilar,
  onGoHome,
  embedded,
}) => {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [descExpanded, setDescExpanded] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [addedJustNow, setAddedJustNow] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /* Reviews of this listing specifically, separate from the seller's overall
     rating shown beside their name. */
  const [listingReviews, setListingReviews] = useState<{
    reviews: any[]; count: number; average: number | null;
  }>({ reviews: [], count: 0, average: null });

  useEffect(() => {
    let cancelled = false;
    api.listings.reviews(listing.id).then((res) => {
      if (!cancelled) {
        setListingReviews({ reviews: res.reviews, count: res.count, average: res.average });
      }
    });
    return () => { cancelled = true; };
  }, [listing.id]);

  /*
   * A different listing is a different page, and a page opens at the top.
   * Tapping something in the "Similar listings" row used to swap the content
   * underneath you while leaving the scroll position where it was, so you
   * landed halfway down a listing you had not seen the top of. The gallery and
   * quantity belong to the old item too, so both reset here.
   */
  useEffect(() => {
    setActiveImageIndex(0);
    setQuantity(1);
    setDescExpanded(false);
    if (!embedded) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [listing.id, embedded]);

  const toast = useToast();

  /**
   * Share this listing.
   *
   * The native sheet where there is one - it reaches the apps people actually
   * send links through - and the clipboard everywhere else. A silent copy is
   * indistinguishable from a broken button, so it confirms either way.
   */
  const handleShare = async () => {
    const url = `${window.location.origin}/listing/${listing.id}`;
    const shareData = {
      title: listing.title,
      text: `${listing.title} — ${formatPrice(listing.price)} on CampusMarket`,
      url,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // Dismissing the sheet is a decision, not a failure - fall through to
        // the clipboard only when sharing was unavailable, never when the
        // person looked at it and chose not to.
        if ((err as DOMException)?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to your clipboard.');
    } catch {
      toast.error('Could not copy the link. You can copy it from the address bar.');
    }
  };

  const isService = listing.category === 'Service';
  /* Services published before this field existed have no mode and were all
     bookable, so only an explicit WALK_IN changes the flow. */
  const isWalkIn = isService && listing.serviceMode === 'WALK_IN';
  const isFood = listing.category === 'Food';
  const unavailable = listing.badgeText === 'Sold' || listing.badgeText === 'Reserved';

  const handleChatSeller = async () => {
    if (currentUser.role === 'guest') { onOpenAuthModal(); return; }
    setStartingChat(true);
    const res = await api.listings.startChat(listing.id);
    setStartingChat(false);
    if (!res.ok) {
      toast.error(res.error || 'Could not open a chat with this seller.');
      return;
    }
    onOpenChat(listing, (res.data as { thread?: { id?: string } })?.thread?.id);
  };

  const handleReport = () => {
    if (currentUser.role === 'guest') { onOpenAuthModal(); return; }
    setReportOpen(true);
  };

  const handleBooking = () => {
    if (currentUser.role === 'guest') { onOpenAuthModal(); return; }
    setBookingOpen(true);
  };

  const handleAddToCart = async () => {
    if (currentUser.role === 'guest') { onOpenAuthModal(); return; }
    if (currentUser.role === 'admin') {
      toast.info('Admins do not have a cart. Use a customer account to shop.', {
        title: 'Not available for admins',
      });
      return;
    }
    if (onAddToCart) {
      setIsAddingToCart(true);
      const result = await onAddToCart(listing, { quantity });
      setIsAddingToCart(false);
      // `false` means it failed - the caller already showed why. Anything else
      // (void or true) is success, so the button confirms it too.
      if (result !== false) {
        setAddedJustNow(true);
        setTimeout(() => setAddedJustNow(false), 2500);
      }
    }
  };

  const handleAdminRemove = async () => {
    if (!removeReason.trim()) {
      setDeleteError('A moderation reason is required.');
      return;
    }
    setDeleting(true);
    const res = await api.listings.delete(listing.id, true);
    setDeleting(false);

    if (res.success) {
      setRemoveOpen(false);
      toast.success('Listing removed and recorded in the audit trail.');
      if (onListingDeleted) onListingDeleted(); else onBack();
    } else {
      setDeleteError(res.error || 'Could not remove this listing.');
    }
  };

  /*
   * Opens the confirmation and asks the server what is at stake.
   *
   * The unconfirmed call never deletes - it comes back CONFIRM_REQUIRED with
   * the conversation count, which is the only thing worth warning about here.
   * The dialog itself is the confirmation, so the button below deletes
   * outright rather than making the same person press Delete twice.
   */
  const openDeleteDialog = async () => {
    setDeleteError(null);
    setDeleteOpen(true);
    const res = await api.listings.delete(listing.id, false);
    if (res.code === 'CONFIRM_REQUIRED' && res.conversationCount) {
      setDeleteError(
        `You have ${res.conversationCount} active conversation(s) about this item. Deleting it can't be undone.`,
      );
    }
  };

  const handleOwnerDelete = async () => {
    setDeleting(true);
    const res = await api.listings.delete(listing.id, true);
    setDeleting(false);

    if (res.success) {
      setDeleteOpen(false);
      toast.success('Your listing was removed.');
      if (onListingDeleted) onListingDeleted(); else onBack();
      return;
    }
    setDeleteError(res.error || 'Could not delete this listing.');
  };

  const images = listing.gallery && listing.gallery.length > 0 ? listing.gallery : [listing.image];

  const showImage = (index: number) =>
    setActiveImageIndex((index + images.length) % images.length);

  /* Arrow keys move through the gallery, as they do in any image viewer. Only
     bound when there is more than one photo, and never while the person is
     typing into something. */
  useEffect(() => {
    if (images.length < 2 || embedded) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === 'ArrowRight') showImage(activeImageIndex + 1);
      if (e.key === 'ArrowLeft') showImage(activeImageIndex - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, activeImageIndex, embedded]);
  const isGuest = currentUser.role === 'guest';
  const isAdmin = currentUser.role === 'admin';
  const isOwner = !isGuest && currentUser.id === listing.seller.id;

  const typeStyle = TYPE_STYLE[listing.category] ?? TYPE_STYLE.Product;
  const statusConfig = STATUS_CONFIG[listing.badgeText === 'Sold' ? 'Sold' : listing.badgeText === 'Reserved' ? 'Reserved' : 'Available'];

  const contextualPill = useMemo(() => {
    if (listing.category === 'Product') {
      return listing.condition && listing.condition !== 'N/A' ? listing.condition : null;
    }
    if (listing.category === 'Service') {
      return listing.availability?.trim() || null;
    }
    return listing.pickupWindow?.trim() || null;
  }, [listing]);

  /*
   * How many of these you may buy at once.
   *
   * Services are booked rather than stacked, so they never get a stepper. Food
   * is capped at the servings its seller declared. A product declares nothing -
   * the seller is never asked how many they have - so it gets a plain sane
   * ceiling and keeps selling until they mark it sold.
   */
  const maxQuantity = typeof listing.availableStock === 'number'
    ? Math.max(1, listing.availableStock)
    : 10;
  const showQuantity = !isService && !isOwner && !isGuest && !isAdmin
    && !unavailable && maxQuantity > 1;

  // Clamp when the listing changes under a stepper that was already raised.
  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(1, q), maxQuantity));
  }, [maxQuantity]);

  /*
   * "Similar Listings" used to be the first five of whatever the feed happened
   * to hold, so a row headed "similar" under a physics textbook could be three
   * meals and a haircut. Relatedness is ranked instead: same category first,
   * then the same type, then anything - so the row degrades to "more listings"
   * on a thin catalogue instead of claiming a resemblance that isn't there.
   */
  const similar = useMemo(() => {
    const pool = similarListings.filter(
      (item) => item.id !== listing.id && item.badgeText !== 'Sold',
    );
    const score = (item: Listing) => {
      if (listing.categoryId && item.categoryId === listing.categoryId) return 0;
      if (item.category === listing.category) return 1;
      return 2;
    };
    return [...pool].sort((a, b) => score(a) - score(b)).slice(0, 5);
  }, [similarListings, listing.id, listing.categoryId, listing.category]);

  /*
   * Home › Category › This listing.
   *
   * The category step is the one that earns the trail: it is the only route
   * from a listing up to the shelf it came from, which matters most for the
   * people who arrived by shared link and have no history to go back through.
   * It is omitted when the listing has no category rather than substituted
   * with its type, which would be a link to a different, wider place than the
   * label implies.
   */
  const crumbs: Crumb[] = useMemo(() => {
    const trail: Crumb[] = [{ label: 'Home', onClick: onGoHome }];
    if (listing.categoryName && onViewAllSimilar) {
      trail.push({ label: listing.categoryName, onClick: () => onViewAllSimilar(listing) });
    }
    trail.push({ label: listing.title });
    return trail;
  }, [listing, onGoHome, onViewAllSimilar]);

  const hasReviews = listing.seller.reviewsCount > 0;
  const descriptionIsLong = listing.description.length > 260;

  // Primary action button configuration
  const primaryAction = useMemo(() => {
    if (isGuest) return null;
    if (isAdmin) return null;
    if (isOwner) return null;

    if (isService) {
      // A walk-in service has nothing to schedule. Sending someone to a date
      // picker to buy K5 of printing is the friction this replaces: the useful
      // action is "tell them you're coming", which is a message.
      if (isWalkIn) {
        return {
          label: startingChat ? 'Opening…' : `Message ${listing.seller.name.split(' ')[0]}`,
          icon: <MessageSquare className="w-4 h-4" />,
          onClick: handleChatSeller,
          color: 'bg-violet-600 hover:bg-violet-700 shadow-violet-200',
          disabled: startingChat || unavailable,
        };
      }
      return {
        label: 'Request Booking',
        icon: <CalendarClock className="w-4 h-4" />,
        onClick: handleBooking,
        color: 'bg-violet-600 hover:bg-violet-700 shadow-violet-200',
        // The server rejects a booking on anything but an ACTIVE listing, so a
        // Sold/Reserved service would otherwise open the form only to fail on
        // submit. Same treatment as the product "Add to Cart" button below.
        disabled: unavailable,
      };
    }
    return {
      label: addedJustNow ? 'Added!' : isAddingToCart ? 'Adding…' : 'Add to Cart',
      icon: <ShoppingBag className="w-4 h-4" />,
      onClick: handleAddToCart,
      color: addedJustNow
        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
        : 'bg-slate-900 hover:bg-slate-800 shadow-slate-200',
      disabled: isAddingToCart || unavailable,
    };
    // quantity and listing.id belong here: the click handlers close over both,
    // and a memo that skipped them would add yesterday's quantity, or add the
    // previous listing after a tap through the similar row.
  }, [isGuest, isAdmin, isOwner, isService, isWalkIn, addedJustNow, isAddingToCart,
    unavailable, startingChat, quantity, listing.id, listing.seller.name]);

  const secondaryAction = useMemo(() => {
    if (isGuest || isAdmin || isOwner) return null;

    // Walk-in already leads with the chat, so its secondary is the fallback for
    // anyone who does want a time - the seller can always say yes in chat.
    if (isWalkIn) {
      return {
        label: 'Ask for availability',
        icon: <CalendarClock className="w-4 h-4" />,
        onClick: handleChatSeller,
        disabled: startingChat,
      };
    }
    // Bookable services used to have no chat at all, which left "is this still
    // running?" with nowhere to go except a booking request for a made-up slot.
    return {
      label: startingChat ? 'Opening…' : isService ? 'Chat seller' : 'Chat Seller',
      icon: <MessageSquare className="w-4 h-4" />,
      onClick: handleChatSeller,
      disabled: startingChat,
    };
  }, [isGuest, isAdmin, isOwner, isService, isWalkIn, startingChat, listing.id]);

  return (
    <div className={embedded ? 'bg-slate-50' : 'min-h-screen bg-slate-50'}>

      {/* ── Navigation Header ── */}
      {!embedded && (
        <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <button
              onClick={onBack}
              className="group flex items-center gap-2 px-3 py-2 -ml-3 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600 group-hover:text-slate-900 transition-colors" />
              <span className="text-sm font-semibold text-slate-600 group-hover:text-slate-900 hidden sm:inline">Back</span>
            </button>

            <div className="flex items-center gap-1">
              {!isGuest && !isAdmin && (
                <button
                  onClick={(e) => onToggleSave(listing.id, e)}
                  className={`p-2.5 rounded-xl transition-all duration-200 ${listing.isSaved
                    ? 'bg-red-50 text-red-500 hover:bg-red-100'
                    : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                    }`}
                >
                  <Heart className={`w-5 h-5 ${listing.isSaved ? 'fill-red-500' : ''}`} />
                </button>
              )}
              <button
                onClick={handleShare}
                aria-label="Share this listing"
                title="Share"
                className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </nav>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-32 lg:pb-12">
        {/* Not in the Sell preview: it is a rehearsal of the page, and its
            crumbs would lead out of the form the seller is still filling in. */}
        {!embedded && <Breadcrumbs items={crumbs} className="mb-4" />}

        <div className="lg:grid lg:grid-cols-12 lg:gap-8">

          {/* ── Left Column: Gallery ── */}
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="sticky top-20">
              {/* Main Image */}
              <div className="relative aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/3] rounded-2xl sm:rounded-3xl overflow-hidden bg-slate-900 shadow-xl shadow-slate-200/50 ring-1 ring-slate-900/5">
                {/*
                  The one image on this page worth the full 1600px - it fills
                  the column and is what the visitor came to look at. Eager and
                  high priority: it is the largest thing on screen at paint, so
                  it is what the browser's "largest contentful paint" waits on.
                */}
                <ListingImage
                  src={images[activeImageIndex]}
                  alt={listing.title}
                  full
                  eager
                  className="w-full h-full object-cover"
                />

                {/* Status Overlay */}
                {unavailable && (
                  <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center">
                    <div className="bg-white/95 backdrop-blur px-6 py-3 rounded-2xl shadow-2xl">
                      <span className="text-lg font-bold text-slate-800 uppercase tracking-widest">
                        {listing.badgeText}
                      </span>
                    </div>
                  </div>
                )}

                {/* Mobile: Back button overlay */}
                {!embedded && (
                  <button
                    onClick={onBack}
                    className="lg:hidden absolute top-4 left-4 w-10 h-10 rounded-full bg-black/30 hover:bg-black/50 backdrop-blur-md text-white flex items-center justify-center transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}

                {/* Step through the photos from the photo itself. The thumbnail
                    strip is a jump-to, not a next - and on a phone the strip is
                    below the fold of the image you are looking at. */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => showImage(activeImageIndex - 1)}
                      aria-label="Previous photo"
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 hover:bg-white backdrop-blur-sm text-slate-800 flex items-center justify-center shadow-lg transition-all active:scale-90"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => showImage(activeImageIndex + 1)}
                      aria-label="Next photo"
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/85 hover:bg-white backdrop-blur-sm text-slate-800 flex items-center justify-center shadow-lg transition-all active:scale-90"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-slate-900/60 backdrop-blur-sm text-[11px] font-bold text-white">
                      {activeImageIndex + 1} / {images.length}
                    </div>
                  </>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="mt-3 sm:mt-4 flex gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {images.map((imgUrl, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImageIndex(idx)}
                      className={`relative flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden ring-2 transition-all duration-200 ${idx === activeImageIndex
                        ? 'ring-blue-600 ring-offset-2'
                        : 'ring-transparent hover:ring-slate-300 opacity-60 hover:opacity-100'
                        }`}
                    >
                      <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

            </div>
          </div>

          {/* ── Right Column: Details ── */}
          <div className="lg:col-span-5 xl:col-span-4 mt-6 lg:mt-0">
            <div className="space-y-4 sm:space-y-5">

              {/* Title & Price Card */}
              <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5">
                {/* Category & Status */}
                <div className="flex items-center flex-wrap gap-2 mb-3">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${typeStyle.chip}`}>
                    {typeStyle.icon}
                    {listing.categoryName || listing.category}
                  </span>
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}>
                    {statusConfig.label}
                  </span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight tracking-tight">
                  {listing.title}
                </h1>

                <div className="mt-4 flex items-baseline gap-2 flex-wrap">
                  <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                    {formatPrice(listing.price)}
                  </span>
                  {listing.priceUnit && (
                    <span className="text-base font-semibold text-slate-500">{listing.priceUnit}</span>
                  )}
                  {/* The saving, on the one screen where the decision is
                      actually made. Gated on discountPercent rather than on
                      compareAtPrice: the server only sends a percentage when
                      the comparison is real, so this can never strike through
                      a "was" price that is at or below what is being asked. */}
                  {listing.discountPercent != null && listing.compareAtPrice != null && (
                    <>
                      <span className="text-base font-semibold text-slate-400 line-through">
                        <span className="sr-only">Was </span>
                        {formatPrice(listing.compareAtPrice)}
                      </span>
                      <span className="text-sm font-extrabold text-[#b3123c] bg-[#ffe8ec] rounded-full px-2 py-0.5">
                        Save {listing.discountPercent}%
                      </span>
                    </>
                  )}
                </div>

                {isFood && (listing.quantity ?? 0) > 1 && (
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {listing.quantity} servings available
                  </p>
                )}

                {/* Key Info Row */}
                <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap gap-2">
                  {contextualPill && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-700 text-sm font-medium border border-slate-200">
                      {isFood && <Clock className="w-3.5 h-3.5 text-slate-500" />}
                      {contextualPill}
                    </div>
                  )}
                  {isFood && listing.dietaryTags?.map((tag) => (
                    <span key={tag} className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium border border-emerald-200">
                      {tag}
                    </span>
                  ))}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-700 text-sm font-medium border border-slate-200">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    {listing.location}
                  </div>

                  {/* Scarcity, stated rather than only enforced at the cart.
                      Second-hand goods are one-of-one, and finding that out
                      after two people have negotiated for the same item is how
                      one of them ends up disappointed. */}
                  {!unavailable && typeof listing.availableStock === 'number' && (
                    <div
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${listing.availableStock === 1
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      {listing.availableStock === 1
                        ? 'Only one available'
                        : `${listing.availableStock} available`}
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop Actions */}
              {!embedded && (
                <div className="hidden lg:block bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5 space-y-3">
                  {isGuest && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600 text-center">
                        Sign in to contact the seller or save this item
                      </p>
                      <button
                        onClick={onOpenAuthModal}
                        className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors"
                      >
                        Log In / Sign Up
                      </button>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-violet-700 bg-violet-50 px-4 py-3 rounded-xl">
                        <ShieldCheck className="w-4 h-4" />
                        Admin Moderation Controls
                      </div>
                      <button
                        onClick={() => { setRemoveReason(''); setDeleteError(null); setRemoveOpen(true); }}
                        disabled={deleting}
                        className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove Listing
                      </button>
                    </div>
                  )}

                  {isOwner && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 px-4 py-3 rounded-xl">
                        <Eye className="w-4 h-4" />
                        You are the seller
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {onEditListing && (
                          <button
                            onClick={() => onEditListing(listing)}
                            className="h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors"
                          >
                            Edit Listing
                          </button>
                        )}
                        <button
                          onClick={openDeleteDialog}
                          disabled={deleting}
                          className={`h-12 rounded-xl font-bold text-sm transition-colors ${onEditListing ? '' : 'col-span-2'} bg-red-50 hover:bg-red-100 text-red-600 border border-red-200`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {!isGuest && !isAdmin && !isOwner && primaryAction && (
                    <>
                      {/* Choosing "3" before pressing Add, rather than pressing
                          Add and then correcting it in the cart. */}
                      {showQuantity && (
                        <div className="flex items-center justify-between gap-3 pb-1">
                          <span className="text-sm font-semibold text-slate-700">Quantity</span>
                          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden">
                            <button
                              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                              disabled={quantity <= 1}
                              aria-label="Decrease quantity"
                              className="px-3 py-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span
                              aria-live="polite"
                              className="px-4 text-sm font-bold text-slate-900 min-w-[40px] text-center"
                            >
                              {quantity}
                            </span>
                            <button
                              onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                              disabled={quantity >= maxQuantity}
                              aria-label="Increase quantity"
                              title={quantity >= maxQuantity ? 'No more of these available' : undefined}
                              className="px-3 py-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={primaryAction.onClick}
                        disabled={primaryAction.disabled}
                        data-onboarding="detail-primary"
                        className={`w-full h-14 rounded-xl text-white font-bold text-sm shadow-lg transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${primaryAction.color}`}
                      >
                        {primaryAction.icon}
                        {primaryAction.label}
                      </button>

                      {secondaryAction && (
                        <button
                          onClick={secondaryAction.onClick}
                          disabled={secondaryAction.disabled}
                          data-onboarding="detail-chat"
                          className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {secondaryAction.icon}
                          {secondaryAction.label}
                        </button>
                      )}

                      {!isService && (
                        <button
                          onClick={(e) => onToggleSave(listing.id, e)}
                          className={`w-full h-12 rounded-xl border-2 font-bold text-sm transition-all flex items-center justify-center gap-2 ${listing.isSaved
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                          <Bookmark className={`w-4 h-4 ${listing.isSaved ? 'fill-blue-600' : ''}`} />
                          {listing.isSaved ? 'Saved' : 'Save for Later'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Seller Card */}
              <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5">
                <div className="flex items-center gap-4">
                  <div
                    onClick={() => onViewSellerProfile(listing.seller.id)}
                    className="relative shrink-0 cursor-pointer group"
                  >
                    <img
                      src={listing.seller.avatar}
                      alt={listing.seller.name}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover ring-2 ring-slate-100 group-hover:ring-blue-200 transition-all"
                    />
                    {listing.seller.verified && (
                      <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center ring-2 ring-white shadow-sm">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      onClick={() => onViewSellerProfile(listing.seller.id)}
                      className="cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                          {listing.seller.name}
                        </h3>
                        {listing.seller.verified && (
                          <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                            Verified
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {[listing.seller.department, listing.seller.year].filter(Boolean).join(' • ')}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        {hasReviews ? (
                          <span className="flex items-center gap-1 text-amber-600 font-bold text-sm">
                            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                            {listing.seller.rating.toFixed(1)}
                            <span className="text-slate-400 font-normal">({listing.seller.reviewsCount})</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-semibold text-xs border border-blue-100">
                            New seller
                          </span>
                        )}
                        <span className="text-slate-300">|</span>
                        <span className="text-xs text-slate-500">
                          Since {listing.seller.joinedDate.replace(/^Joined\s*/, '')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onViewSellerProfile(listing.seller.id)}
                    className="shrink-0 p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {isGuest && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">

                    <button
                      onClick={onOpenAuthModal}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Sign In
                    </button>
                  </div>
                )}

                {!isGuest && !isAdmin && !isOwner && (
                  <button
                    onClick={handleReport}
                    className="mt-4 pt-4 border-t border-slate-100 w-full text-left text-xs text-slate-400 hover:text-red-600 font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    Report this listing
                  </button>
                )}
              </div>

              {/* How this service works. Answers the question a buyer has
                  before they commit to anything: do I book, or do I just turn
                  up? Getting that wrong wastes a trip or a day of waiting. */}
              {isService && (
                <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5">
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
                    How this works
                  </h2>
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isWalkIn ? 'bg-emerald-50 text-emerald-600' : 'bg-violet-50 text-violet-600'
                        }`}
                    >
                      {isWalkIn ? <DoorOpen className="w-4.5 h-4.5" /> : <CalendarClock className="w-4.5 h-4.5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-sm">
                        {isWalkIn ? 'No booking needed' : 'By appointment'}
                      </p>
                      <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">
                        {isWalkIn
                          ? `Message ${listing.seller.name.split(' ')[0]} to say you're coming, then drop in.`
                          : 'Request a time and wait for the seller to confirm it in chat.'}
                      </p>

                      <div className="mt-3 space-y-1.5">
                        {listing.availability?.trim() && (
                          <p className="text-xs text-slate-600 flex items-start gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                            <span>
                              <span className="font-semibold">
                                {isWalkIn ? 'Find them: ' : 'Usually free: '}
                              </span>
                              {listing.availability}
                            </span>
                          </p>
                        )}
                        {/* Where to go matters far more when the plan is to
                            physically walk there, so it is repeated here. */}
                        {isWalkIn && listing.location && (
                          <p className="text-xs text-slate-600 flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                            <span>
                              <span className="font-semibold">Location: </span>
                              {listing.location}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* What other buyers said about this exact listing. Sparse for a
                  one-off second-hand item, and the point for anything repeated -
                  a printing service or a tutor accumulates handovers, and
                  "four people used this" answers what seller stars cannot. */}
              {listingReviews.count > 0 && (
                <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      Reviews of this listing
                    </h2>
                    <span className="flex items-center gap-1.5 text-sm">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      <span className="font-bold text-slate-900">{listingReviews.average}</span>
                      <span className="text-slate-500">
                        ({listingReviews.count} {listingReviews.count === 1 ? 'review' : 'reviews'})
                      </span>
                    </span>
                  </div>

                  <div className="space-y-3">
                    {listingReviews.reviews.slice(0, 4).map((review) => (
                      <div key={review.id} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {review.reviewer?.name ?? 'A buyer'}
                          </span>
                          <span className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3 h-3 ${i < review.rating
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-200'
                                  }`}
                              />
                            ))}
                          </span>
                        </div>
                        {review.comment && (
                          <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                            {review.comment}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm ring-1 ring-slate-900/5">
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
                  Description
                </h2>
                <div className="relative">
                  <p
                    className={`text-slate-600 text-sm leading-relaxed whitespace-pre-line ${!descExpanded && descriptionIsLong ? 'line-clamp-4' : ''
                      }`}
                  >
                    {listing.description}
                  </p>
                  {descriptionIsLong && (
                    <button
                      onClick={() => setDescExpanded((v) => !v)}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      {descExpanded ? (
                        <>Show less <ChevronUp className="w-4 h-4" /></>
                      ) : (
                        <>Read more <ChevronDown className="w-4 h-4" /></>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Similar Listings ── */}
        {similar.length > 0 && (
          <div className="mt-10 sm:mt-14">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Similar Listings</h2>
              {onViewAllSimilar && (
                <button
                  onClick={() => onViewAllSimilar(listing)}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View all <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {similar
                .map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onSelectSimilar(item)}
                    className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                      <ListingImage
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      {/* This row was the last grid in the app still quoting a
                          bare price, which made the cheaper alternative to
                          what you are looking at the one place its saving was
                          invisible. */}
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
        )}
      </main>

      {/* ── Mobile Floating Action Bar ── */}
      {!embedded && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-t border-slate-200/80 safe-area-pb">
          <div className="max-w-3xl mx-auto px-4 py-3">
            {isGuest && (
              <button
                onClick={onOpenAuthModal}
                className="w-full h-12 rounded-xl bg-slate-900 text-white font-bold text-sm shadow-lg shadow-slate-200"
              >
                Log In to Continue
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => { setRemoveReason(''); setDeleteError(null); setRemoveOpen(true); }}
                disabled={deleting}
                className="w-full h-12 rounded-xl bg-red-600 text-white font-bold text-sm shadow-lg shadow-red-200 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Remove Listing (Admin)
              </button>
            )}

            {isOwner && (
              <div className="flex items-center gap-3">
                {onEditListing && (
                  <button
                    onClick={() => onEditListing(listing)}
                    className="flex-1 h-12 rounded-xl bg-slate-900 text-white font-bold text-sm"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={openDeleteDialog}
                  disabled={deleting}
                  className={`h-12 rounded-xl bg-red-50 text-red-600 font-bold text-sm border border-red-200 ${onEditListing ? 'px-6' : 'flex-1'}`}
                >
                  Delete
                </button>
              </div>
            )}

            {!isGuest && !isAdmin && !isOwner && (
              <>
                {/* The price scrolls away with the header on a phone, so the
                    bar that carries the decision carries the number too -
                    nobody should have to scroll back up to check what they
                    are about to commit to. */}
                <div className="flex items-baseline justify-between gap-3 mb-2.5">
                  <span className="text-lg font-extrabold text-slate-900 tracking-tight">
                    {formatPrice(listing.price)}
                    {listing.priceUnit && (
                      <span className="text-xs font-semibold text-slate-500 ml-0.5">
                        {listing.priceUnit}
                      </span>
                    )}
                    {/* The saving travels with the price for the same reason
                        the price is here at all: this bar is the last thing
                        seen before committing, and "K80" alone is a weaker
                        number than "K80, down from K120". */}
                    {listing.discountPercent != null && listing.compareAtPrice != null && (
                      <span className="text-xs font-semibold text-slate-400 line-through ml-1.5">
                        <span className="sr-only">Was </span>
                        {formatPrice(listing.compareAtPrice)}
                      </span>
                    )}
                  </span>
                  {/* The stepper rides the price row rather than taking a row
                      of its own - the bar is already the last thing between a
                      phone user and the decision, and quantity is part of that
                      decision, not a setting they should have to go looking for
                      on a screen size where the desktop panel does not exist. */}
                  {showQuantity ? (
                    <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                        aria-label="Decrease quantity"
                        className="px-2.5 py-1.5 text-slate-600 active:bg-slate-100 disabled:opacity-40"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span
                        aria-live="polite"
                        className="px-2.5 text-sm font-bold text-slate-900 min-w-[28px] text-center"
                      >
                        {quantity}
                      </span>
                      <button
                        onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                        disabled={quantity >= maxQuantity}
                        aria-label="Increase quantity"
                        className="px-2.5 py-1.5 text-slate-600 active:bg-slate-100 disabled:opacity-40"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {typeof listing.availableStock === 'number' && listing.availableStock === 1 && !unavailable && (
                        <span className="text-[11px] font-bold text-amber-700">Only one available</span>
                      )}
                      {unavailable && (
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                          {listing.badgeText}
                        </span>
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => onToggleSave(listing.id, e)}
                    className={`shrink-0 w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${listing.isSaved
                      ? 'border-blue-600 bg-blue-50 text-blue-600'
                      : 'border-slate-200 text-slate-500'
                      }`}
                  >
                    <Bookmark className={`w-5 h-5 ${listing.isSaved ? 'fill-blue-600' : ''}`} />
                  </button>

                  {primaryAction && (
                    <button
                      onClick={primaryAction.onClick}
                      disabled={primaryAction.disabled}
                      data-onboarding="detail-primary"
                      className={`flex-1 h-12 rounded-xl text-white font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${primaryAction.color}`}
                    >
                      {primaryAction.icon}
                      {primaryAction.label}
                    </button>
                  )}

                  {secondaryAction && (
                    <button
                      onClick={secondaryAction.onClick}
                      disabled={secondaryAction.disabled}
                      data-onboarding="detail-chat"
                      className="flex-1 h-12 rounded-xl bg-blue-600 text-white font-bold text-sm shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {secondaryAction.icon}
                      {secondaryAction.label}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="LISTING"
        targetId={listing.id}
        targetLabel={listing.title}
      />

      <BookingModal
        isOpen={bookingOpen}
        onClose={() => setBookingOpen(false)}
        listingId={listing.id}
        listingTitle={listing.title}
        statedAvailability={listing.availability}
        onBooked={() => onOpenChat(listing)}
      />

      <Modal
        isOpen={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title="Remove this listing?"
        subtitle={listing.title}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setRemoveOpen(false)} className="btn-ghost !rounded-xl !text-sm">Cancel</button>
            <button onClick={handleAdminRemove} disabled={deleting} className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm">
              {deleting ? 'Removing…' : 'Remove listing'}
            </button>
          </div>
        }
      >
        <ErrorBanner message={deleteError} />
        <Field label="Moderation reason (recorded in the audit log)">
          <input value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} placeholder="Prohibited item reported by students" className="input-base text-sm" />
        </Field>
        <p className="text-xs text-slate-500">
          The seller keeps their account. The listing disappears from all public views.
        </p>
      </Modal>

      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your listing?"
        subtitle={listing.title}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setDeleteOpen(false)} className="btn-ghost !rounded-xl !text-sm">Keep it</button>
            <button onClick={handleOwnerDelete} disabled={deleting} className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm">
              {deleting ? 'Deleting…' : deleteError ? 'Delete anyway' : 'Delete'}
            </button>
          </div>
        }
      >
        <ErrorBanner message={deleteError} />
        <p className="text-xs text-slate-500">
          This can't be undone. Past conversations and deal history keep a reference to it, shown as "Listing removed".
        </p>
      </Modal>
    </div>
  );
};
