import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Home, Heart, Plus, MessageSquare, ShoppingBag, Tag, Search } from 'lucide-react';
import { ViewType, AuthSession } from '../../types';
import { badgeText, GUEST_ALLOWED, HIDES_BOTTOM_NAV, isSellerState } from './navShared';

interface BottomNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onOpenAuthModal: () => void;
  savedCount: number;
  cartCount?: number;
  unreadMessagesCount: number;
  currentUser: AuthSession;
  /**
   * Open the full-screen search.
   *
   * Optional so the bar still works on its own: without it the Search tab
   * falls back to navigating to the results view, which is what it did before
   * the overlay existed.
   */
  onOpenSearch?: () => void;
}

// Tuning constants for gesture + feedback behavior
const SWIPE_MIN_DISTANCE = 50; // px
const SWIPE_MAX_DURATION = 350; // ms — anything slower reads as a drag, not a flick
const SWIPE_AXIS_LOCK_RATIO = 1.5; // horizontal must dominate vertical by this much
const TAP_DEBOUNCE_MS = 350; // ignore accidental double-taps on the same control
const SPRING_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)'; // native-feeling overshoot

export const BottomNav: React.FC<BottomNavProps> = ({
  currentView,
  onNavigate,
  onOpenAuthModal,
  savedCount,
  cartCount = 0,
  unreadMessagesCount,
  currentUser,
  onOpenSearch,
}) => {
  const isGuest = currentUser.role === 'guest';
  const isSeller = isSellerState(currentUser);
  const [cartBump, setCartBump] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewType>(currentView);
  const prevCart = useRef(cartCount);
  const lastTapRef = useRef<{ view: ViewType | null; time: number }>({ view: null, time: 0 });

  // Touch/swipe tracking — includes time + vertical delta so a vertical
  // scroll on content behind the bar never gets misread as a tab swipe.
  const touchState = useRef<{ x: number; y: number; time: number } | null>(null);

  // Cart bump animation
  useEffect(() => {
    if (cartCount > prevCart.current) {
      setCartBump(true);
      const t = setTimeout(() => setCartBump(false), 400);
      prevCart.current = cartCount;
      return () => clearTimeout(t);
    }
    prevCart.current = cartCount;
  }, [cartCount]);

  // Sync active tab with current view
  useEffect(() => {
    setActiveTab(currentView);
  }, [currentView]);

  const go = useCallback(
    (view: ViewType) => {
      // Swallow accidental double-fires (fast repeat taps / touch+click ghost events)
      const now = Date.now();
      if (lastTapRef.current.view === view && now - lastTapRef.current.time < TAP_DEBOUNCE_MS) {
        return;
      }
      lastTapRef.current = { view, time: now };

      // Haptic feedback simulation — short + distinct for guest-blocked taps
      if (navigator.vibrate) navigator.vibrate(isGuest && !GUEST_ALLOWED.includes(view) ? 15 : 8);

      if (isGuest && !GUEST_ALLOWED.includes(view)) {
        onOpenAuthModal();
        return;
      }
      setActiveTab(view);
      onNavigate(view);
    },
    [isGuest, onNavigate, onOpenAuthModal],
  );

  /*
   * Early returns come AFTER every hook, and this position is load-bearing.
   *
   * They used to sit above the useCallback, which meant this component ran
   * eight hooks as a customer and seven the moment it returned early - and
   * React treats a change in hook count between renders as a corrupted
   * component ("Rendered fewer hooks than expected", error #300). Signing in
   * as an admin took the whole app to the error screen; a seller opening the
   * Sell form would have done the same. The hooks-order rule is not about
   * where a component *starts* returning, it is that every render must call
   * the same hooks - so conditional exits belong below the last of them.
   */
  // RBAC rule 4: admins never get the customer bar
  if (currentUser.role === 'admin') return null;
  if (HIDES_BOTTOM_NAV.includes(currentView)) return null;

  // Handle swipe gestures for navigation — axis-locked and velocity-aware
  // so vertical scrolling and slow drags never trigger a tab change.
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchState.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchState.current;
    touchState.current = null;
    if (!start) return;

    const end = e.changedTouches[0];
    const deltaX = end.clientX - start.x;
    const deltaY = end.clientY - start.y;
    const elapsed = Date.now() - start.time;

    const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * SWIPE_AXIS_LOCK_RATIO;
    const isFastEnough = elapsed <= SWIPE_MAX_DURATION;
    const isFarEnough = Math.abs(deltaX) > SWIPE_MIN_DISTANCE;

    if (!isHorizontal || !isFastEnough || !isFarEnough) return;

    // Must stay in the order the tabs are drawn, or a swipe jumps somewhere
    // other than the tab next to the one you are on.
    const views: ViewType[] = isSeller
      ? ['browse', 'search', 'my-listings', 'sell', 'messages', 'cart']
      : ['browse', 'search', 'saved', 'sell', 'messages', 'cart'];

    const currentIdx = views.indexOf(activeTab);
    const newIdx = deltaX < 0 ? Math.min(currentIdx + 1, views.length - 1) : Math.max(currentIdx - 1, 0);
    if (newIdx !== currentIdx) go(views[newIdx]);
  };

  const tabBase = `
    flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 
    rounded-xl transition-all duration-200 min-w-[48px] relative
    active:scale-90 transform-gpu select-none
  `;

  const labelCls = 'text-[10px] font-semibold leading-none transition-all duration-200';

  const badge = (count: number) =>
    count > 0 && !isGuest ? (
      <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center border-[1.5px] border-white leading-none animate-badge-pop">
        {badgeText(count)}
      </span>
    ) : null;

  /**
   * Search, which opens the overlay rather than routing.
   *
   * Tapping Search used to land on /search with whatever filters were already
   * set - "Browse all listings" and no box to type in, which is the one thing
   * someone pressing Search wants. It stays highlighted while the results view
   * is open, so the bar still says where you are.
   */
  const searchTab = () => {
    const active = activeTab === 'search';
    return (
      <button
        onClick={() => {
          if (!onOpenSearch) { go('search'); return; }
          if (navigator.vibrate) navigator.vibrate(8);
          onOpenSearch();
        }}
        data-onboarding="nav-search"
        aria-label="Search"
        className={`
          ${tabBase}
          ${active ? 'text-[#2563eb] scale-100' : 'text-[#737686] hover:text-[#434655] scale-95'}
          ${active ? 'opacity-100' : 'opacity-70'}
        `}
        style={{
          transform: active ? 'translateY(-2px)' : 'translateY(0)',
          transitionTimingFunction: SPRING_EASE,
          WebkitTapHighlightColor: 'transparent',
          WebkitTouchCallout: 'none',
          touchAction: 'manipulation',
        }}
      >
        <span className="relative">
          <Search className="w-6 h-6 transition-all duration-200" strokeWidth={active ? 2.5 : 1.8} />
        </span>
        <span className={`${labelCls} ${active ? 'opacity-100' : 'opacity-60'}`}>Search</span>
      </button>
    );
  };

  const tab = (
    view: ViewType,
    label: string,
    Icon: React.ElementType,
    opts: { count?: number; activeColor?: string; bump?: boolean } = {},
  ) => {
    const active = activeTab === view;
    const activeColor = opts.activeColor ?? 'text-[#2563eb]';

    return (
      <button
        onClick={() => go(view)}
        data-onboarding={`nav-${view}`}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={`
          ${tabBase} 
          ${active ? `${activeColor} scale-100` : 'text-[#737686] hover:text-[#434655] scale-95'}
          ${active ? 'opacity-100' : 'opacity-70'}
        `}
        style={{
          transform: active ? 'translateY(-2px)' : 'translateY(0)',
          transitionTimingFunction: SPRING_EASE,
          // Kill the mobile browser tap flash/callout so presses feel native
          WebkitTapHighlightColor: 'transparent',
          WebkitTouchCallout: 'none',
          touchAction: 'manipulation',
        }}
      >
        <span className={`relative ${opts.bump ? 'animate-cart-bump' : ''}`}>
          <Icon
            className="w-6 h-6 transition-all duration-200"
            strokeWidth={active ? 2.5 : 1.8}
            fill={active ? 'currentColor' : 'none'}
          />
          {badge(opts.count ?? 0)}
        </span>
        <span
          className={`
            ${labelCls} 
            ${active ? 'opacity-100' : 'opacity-60'}
          `}
        >
          {label}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* Safe area spacer for notched phones */}
      <div className="h-[72px] lg:hidden" aria-hidden="true" />

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-[#c3c6d7]/30 shadow-[0_-4px_20px_0_rgba(0,0,0,0.08)] py-2 px-3 lg:hidden"
        aria-label="Primary"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => (touchState.current = null)}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 8px)',
          // Prevent iOS rubber-band scroll and pull-to-refresh from
          // leaking through the bar during a swipe gesture.
          overscrollBehavior: 'contain',
          touchAction: 'pan-x',
        }}
      >
        <div className="max-w-md mx-auto flex items-end justify-between">
          {tab('browse', 'Home', Home)}

          {/*
            Search, in the primary nav.

            It lived only in the top bar, which on a phone is the one thing
            that scrolls away - so the single most common way of finding
            anything was missing from the only navigation always on screen,
            while Cart and Messages (which you cannot use until you have found
            something) both had a permanent slot.

            Added rather than swapped in. Cart and Messages live ONLY here on
            mobile - the top bar's small-screen cluster carries Orders,
            Notifications and the avatar, and nothing else - so neither can give
            up its slot. Five tabs around the button is tight, which is why the
            labels below are the smallest thing in the bar; it is still a better
            trade than hiding the primary action.
          */}
          {searchTab()}

          {isSeller
            ? tab('my-listings', 'Listings', Tag, { activeColor: 'text-[#007d55]' })
            : tab('saved', 'Saved', Heart, { count: savedCount })}

          {/* Floating action button with native feel */}
          <div className="relative -top-5 flex flex-col items-center group">
            <button
              onClick={() => go('sell')}
              data-onboarding="nav-sell"
              aria-label="Sell an item"
              className={`
                w-14 h-14 rounded-full text-white flex items-center justify-center 
                shadow-[0_8px_24px_0_rgba(0,0,0,0.2)] transition-all duration-200 
                active:scale-90 active:shadow-lg transform-gpu select-none
                ${isSeller ? 'bg-[#007d55] hover:bg-[#006242]' : 'bg-[#2563eb] hover:bg-[#004ac6]'}
              `}
              style={{
                boxShadow:
                  activeTab === 'sell' ? '0 8px 32px 0 rgba(37,99,235,0.4)' : '0 8px 24px 0 rgba(0,0,0,0.2)',
                transitionTimingFunction: SPRING_EASE,
                WebkitTapHighlightColor: 'transparent',
                WebkitTouchCallout: 'none',
                touchAction: 'manipulation',
              }}
            >
              <Plus className="w-7 h-7 transition-transform duration-200 group-active:rotate-90" strokeWidth={2.5} />
            </button>
            <span className="text-[10px] font-semibold text-[#737686] mt-1 leading-none select-none">Sell</span>
          </div>

          {tab('messages', 'Messages', MessageSquare, { count: unreadMessagesCount })}
          {tab('cart', 'Cart', ShoppingBag, { count: cartCount, bump: cartBump })}
        </div>
      </nav>
    </>
  );
};