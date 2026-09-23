import React, { useEffect, useRef, useState } from 'react';
import {
  Search, Plus, MessageSquare, ShoppingBag, Heart, Bell, X, Package,
} from 'lucide-react';
import { AuthSession, ViewType } from '../../types';
import { AccountMenu } from './AccountMenu';
import { SearchSuggestions } from '../search/SearchSuggestions';
import { recordSearch } from '../../services/recentSearches';
import { badgeText, canSell, GUEST_ALLOWED, isSellerState } from './navShared';

export type FeedType = 'All' | 'Product' | 'Service' | 'Food';

export interface CategoryLink {
  id: string;
  name: string;
}

interface TopNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onOpenAuthModal: () => void;
  onLogout?: () => void;
  currentUser: AuthSession;

  savedCount: number;
  cartCount: number;
  unreadMessagesCount: number;
  unreadNotificationsCount: number;

  /** Global search + category state, owned by App so nav and feed agree. */
  searchQuery: string;
  onSearchChange: (value: string) => void;
  feedType: FeedType;
  onFeedTypeChange: (type: FeedType) => void;
  categoryId: string;
  onCategoryChange: (id: string) => void;
  categories: CategoryLink[];

  /** Run a full search - lands on the results page. */
  onSubmitSearch: (term: string) => void;
  /** Jump straight to a listing picked from the suggestions dropdown. */
  onOpenListingById: (listingId: string) => void;
  /** Browse one category, from a category suggestion. */
  onSearchCategory: (categoryId: string) => void;
  /** Show the reduced listings, from the suggestions panel's deals row. */
  onShowDeals: () => void;
  /**
   * Hand searching to the full-screen overlay.
   *
   * Used below lg, where the compact bar has no room for a dropdown worth
   * reading. Desktop keeps the inline box and its panel.
   */
  onOpenSearchOverlay: () => void;
}

const PLACEHOLDERS = ['Search textbooks…', 'Find a tutor…', 'Search meals near you…'];


/**
 * Primary navigation for guests, customers and sellers.
 *
 * Desktop (lg+) is a two-row shopping-site bar: row 1 is search plus the
 * account/cart cluster and never moves; row 2 is the category strip, which is
 * secondary and collapses while scrolling down. Below lg it degrades to a
 * compact sticky header, with the bottom bar carrying primary navigation.
 *
 * Admins never see this - they get {@link AdminNav} instead, so the two modes
 * can never be mistaken for each other.
 */
export const TopNav: React.FC<TopNavProps> = ({
  currentView,
  onNavigate,
  onOpenAuthModal,
  onLogout,
  currentUser,
  savedCount,
  cartCount,
  unreadMessagesCount,
  unreadNotificationsCount,
  searchQuery,
  onSearchChange,
  feedType,
  onFeedTypeChange,
  categoryId,
  onCategoryChange,
  categories,
  onSubmitSearch,
  onOpenListingById,
  onSearchCategory,
  onShowDeals,
  onOpenSearchOverlay,
}) => {
  const isGuest = currentUser.role === 'guest';
  const isSeller = isSellerState(currentUser);
  /* Same rule as the bottom bar's Sell button: offered only to accounts that
     may actually post. Buyers reach the upgrade through "Start selling" in
     the account menu below, which says what it will do before it is pressed
     rather than after. */
  const showSell = canSell(currentUser);
  /* Counts a seller's unanswered queue. A buyer's own orders are not a number
     that needs chasing, so they get the icon without a badge rather than a
     badge that never clears. */
  const openOrdersCount = currentUser.openOrders ?? 0;

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [compact, setCompact] = useState(false);
  const lastScrollY = useRef(0);
  const [cartBump, setCartBump] = useState(false);
  const prevCart = useRef(cartCount);

  const [suggestOpen, setSuggestOpen] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  /* Close the dropdown on any click outside the search area. */
  useEffect(() => {
    if (!suggestOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [suggestOpen]);

  /** Every path that ends in a search funnels through here, so the term is
   *  recorded once and the dropdown always closes. */
  const runSearch = (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    recordSearch(currentUser.id, clean);
    onSearchChange(clean);
    setSuggestOpen(false);
    onSubmitSearch(clean);
  };

  /* Rotating placeholder signals all three listing types without extra copy. */
  useEffect(() => {
    const id = setInterval(() => setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length), 3200);
    return () => clearInterval(id);
  }, []);

  /* Row 1 never hides; row 2 gives space back once you're scrolling down. */
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setCompact(y > 64);
      lastScrollY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Confirms "that worked" without a toast on every add. */
  useEffect(() => {
    if (cartCount > prevCart.current) {
      setCartBump(true);
      const t = setTimeout(() => setCartBump(false), 400);
      return () => clearTimeout(t);
    }
    prevCart.current = cartCount;
  }, [cartCount]);
  useEffect(() => { prevCart.current = cartCount; }, [cartCount]);

  const go = (view: ViewType) => {
    if (isGuest && !GUEST_ALLOWED.includes(view)) {
      onOpenAuthModal();
      return;
    }
    onNavigate(view);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Plain Enter searches for exactly what was typed. A highlighted
    // suggestion intercepts Enter before this, inside SearchSuggestions.
    runSearch(searchQuery);
  };

  const iconBtn =
    'relative p-2.5 rounded-full text-[#434655] hover:text-[#2563eb] hover:bg-[#eff4ff] transition-all duration-150';

  const countBadge = (count: number) =>
    count > 0 && !isGuest ? (
      <span className="absolute -top-0.5 -right-0.5 bg-[#2563eb] text-white text-[9px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border-2 border-white leading-none">
        {badgeText(count)}
      </span>
    ) : null;


  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#c3c6d7]/60 shadow-[0_1px_8px_0_rgba(0,0,0,0.04)]">
      {/* ─────────────────────── Row 1: always visible ─────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`flex items-center gap-3 transition-all duration-200 ${compact ? 'h-14' : 'h-16'}`}>
          {/* Logo - always returns Home with filters cleared */}
          <button
            onClick={() => {
              onSearchChange('');
              onFeedTypeChange('All');
              onCategoryChange('');
              onNavigate('browse');
            }}
            className="flex items-center gap-2.5 shrink-0 group"
            aria-label="CampusMarket home"
          >
            {/* Mobile: icon-only logo */}
            <img
              src="/images/logo.png"
              alt=""
              width={36}
              height={36}
              className={`lg:hidden w-9 h-9 object-contain shrink-0 rounded-lg transition-all duration-200 ${isSeller ? 'ring-2 ring-[#ffffff]/40 ring-offset-1' : ''
                } group-hover:scale-105`}
            />
            {/* Desktop: full wordmark logo */}
            <img
              src="/images/desktop_logo.png"
              alt="QuickBine"
              className={`hidden lg:block h-9 object-contain shrink-0 transition-all duration-200 group-hover:scale-105`}
            />
            {/* Mobile-only brand text (desktop logo already includes the name) */}
            <div className="text-left hidden max-lg:hidden xl:hidden">
              {/* Intentionally hidden on all sizes – the desktop wordmark
                  replaces this on lg+, and mobile doesn't show text. */}
            </div>
          </button>

          {/* Search - the dominant element of the row */}
          <div ref={searchWrapRef} data-onboarding="nav-search" className="flex-1 min-w-0 relative">
            {/*
              Mobile: a button wearing the search box's clothes.

              Tapping it opens the full-screen search rather than focusing a
              field here. A real input in this bar meant the suggestions had to
              be a dropdown, and a dropdown on a phone is a short list squeezed
              between a sticky header and the soft keyboard. It looks identical
              until it is pressed, so nothing about the bar has to be relearnt.
            */}
            <button
              type="button"
              onClick={onOpenSearchOverlay}
              aria-label="Search listings"
              className={`lg:hidden w-full flex items-center gap-2.5 pl-4 pr-3 bg-[#f8f9ff] border border-[#e5eeff] rounded-full text-left transition-all duration-200 active:bg-white active:border-[#2563eb] ${compact ? 'py-2' : 'py-2.5'
                }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Search className="w-4 h-4 text-[#737686] shrink-0" />
              <span className={`flex-1 min-w-0 truncate text-sm font-medium ${searchQuery ? 'text-[#0b1c30]' : 'text-[#a0a3b1]'
                }`}>
                {searchQuery || PLACEHOLDERS[placeholderIndex]}
              </span>
              {searchQuery && (
                /* A span, not a button: a button inside a button is invalid
                   markup and the outer tap target swallows it anyway. The
                   press is caught here and stopped before it opens the
                   overlay. */
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Clear search"
                  onClick={(e) => { e.stopPropagation(); onSearchChange(''); }}
                  className="p-0.5 text-[#a0a3b1] shrink-0"
                >
                  <X className="w-4 h-4" />
                </span>
              )}
            </button>

            {/* Desktop: the real box, with its dropdown. */}
            <form onSubmit={submitSearch} className="hidden lg:block">
              <div className="relative">
                <Search className="w-4 h-4 text-[#737686] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { onSearchChange(e.target.value); setSuggestOpen(true); }}
                  onFocus={() => setSuggestOpen(true)}
                  placeholder={PLACEHOLDERS[placeholderIndex]}
                  aria-label="Search listings"
                  role="combobox"
                  aria-expanded={suggestOpen}
                  aria-autocomplete="list"
                  autoComplete="off"
                  className={`no-zoom-field w-full pl-11 pr-9 bg-[#f8f9ff] border border-[#e5eeff] rounded-full text-sm font-medium text-[#0b1c30] placeholder:text-[#a0a3b1] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/30 focus:border-[#2563eb] focus:bg-white transition-all duration-200 ${compact ? 'py-2' : 'py-2.5'
                    }`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-[#a0a3b1] hover:text-[#434655]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>

            <div className="hidden lg:block">
              <SearchSuggestions
                query={searchQuery}
                userId={currentUser.id}
                open={suggestOpen}
                onClose={() => setSuggestOpen(false)}
                onSearch={runSearch}
                onSelectListing={(id) => { setSuggestOpen(false); onOpenListingById(id); }}
                onSelectCategory={(id) => { setSuggestOpen(false); onSearchCategory(id); }}
                onShowDeals={() => { setSuggestOpen(false); onShowDeals(); }}
              />
            </div>
          </div>

          {/* Sell - a labelled call to action on desktop, never buried */}
          {showSell && (
          <button
            onClick={() => go('sell')}
            data-onboarding="nav-sell"
            className={`hidden lg:flex shrink-0 items-center gap-1.5 h-10 px-4 rounded-xl text-white font-bold text-sm transition-all duration-150 active:scale-[0.98] ${isSeller
              ? 'bg-[#007d55] hover:bg-[#006242] shadow-[0_4px_14px_0_rgba(0,125,85,0.24)]'
              : 'bg-[#2563eb] hover:bg-[#004ac6] shadow-[0_4px_14px_0_rgba(37,99,235,0.24)]'
              }`}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            <span>Sell an Item</span>
          </button>
          )}

          {/* Desktop icon cluster - fixed order so muscle memory holds */}
          <div className="hidden lg:flex items-center gap-0.5 shrink-0">
            {/* Orders sits with the other things you come back to check, rather
                than inside the account dropdown where it used to be: an order
                someone is waiting on is time-sensitive, and a menu you have to
                open first is a poor place for anything with a deadline. */}
            {!isGuest && (
              <button onClick={() => go('orders')} data-onboarding="nav-orders" className={iconBtn} title="Orders" aria-label="Orders">
                <Package className="w-5 h-5" />
                {countBadge(openOrdersCount)}
              </button>
            )}
            <button onClick={() => go('messages')} data-onboarding="nav-messages" className={iconBtn} title="Messages" aria-label="Messages">
              <MessageSquare className="w-5 h-5" />
              {countBadge(unreadMessagesCount)}
            </button>
            <button onClick={() => go('saved')} data-onboarding="nav-saved" className={iconBtn} title="Saved" aria-label="Saved">
              <Heart className="w-5 h-5" />
              {countBadge(savedCount)}
            </button>
            <button
              onClick={() => go('cart')}
              className={`${iconBtn} ${cartBump ? 'animate-cart-bump' : ''}`}
              title="Cart"
              aria-label="Cart"
            >
              <ShoppingBag className="w-5 h-5" />
              {countBadge(cartCount)}
            </button>
            {/* Desktop had no route to notifications at all: the bell was in the
                mobile-only cluster and the account menu never carried it, so a
                laptop user could not open them from anywhere. */}
            {!isGuest && (
              <button
                onClick={() => go('notifications')}
                className={iconBtn}
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            )}
          </div>

          {/* Mobile: orders + bell. The bottom bar carries browse, sell and the
              rest; these two are the "has anything happened?" pair, and orders
              is the half of it that costs money to miss. */}
          <div className="flex lg:hidden items-center shrink-0">
            {!isGuest && (
              <>
                <button onClick={() => go('orders')} data-onboarding="nav-orders" className={iconBtn} aria-label="Orders">
                  <Package className="w-5 h-5" />
                  {countBadge(openOrdersCount)}
                </button>
                <button onClick={() => go('notifications')} className={iconBtn} aria-label="Notifications">
                  <Bell className="w-5 h-5" />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </button>
              </>
            )}
          </div>

          {/* Account / auth */}
          <div className="shrink-0">
            {isGuest ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onOpenAuthModal}
                  className="hidden lg:inline text-xs font-semibold text-[#434655] hover:text-[#0b1c30] px-2 py-2"
                >
                  Log In
                </button>
                <button
                  onClick={onOpenAuthModal}
                  className="h-9 px-3.5 rounded-lg bg-[#2563eb] hover:bg-[#004ac6] text-white text-xs font-bold transition-colors"
                >
                  Sign Up
                </button>
              </div>
            ) : (
              <>
                <div className="hidden lg:block" data-onboarding="nav-account">
                  <AccountMenu currentUser={currentUser} onNavigate={onNavigate} onLogout={onLogout} />
                </div>
                <button
                  onClick={() => onNavigate('profile')}
                  className="lg:hidden"
                  data-onboarding="nav-account"
                  aria-label="Profile"
                >
                  {currentUser.avatar ? (
                    <img src={currentUser.avatar} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-[#2563eb]/30" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#dbe1ff]" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

    </header>
  );
};
