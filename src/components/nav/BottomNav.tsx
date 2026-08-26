import React, { useEffect, useRef, useState } from 'react';
import { Home, Heart, Plus, MessageSquare, ShoppingBag, Tag } from 'lucide-react';
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
}

/**
 * Mobile / tablet primary navigation (below lg, where the desktop top bar's
 * icon cluster is hidden).
 *
 * Labels stay visible at every size - clarity beats density on a five-item bar,
 * and the icons alone aren't unambiguous enough (a tag vs a heart, say).
 */
export const BottomNav: React.FC<BottomNavProps> = ({
  currentView,
  onNavigate,
  onOpenAuthModal,
  savedCount,
  cartCount = 0,
  unreadMessagesCount,
  currentUser,
}) => {
  const isGuest = currentUser.role === 'guest';
  const isSeller = isSellerState(currentUser);

  const [cartBump, setCartBump] = useState(false);
  const prevCart = useRef(cartCount);

  useEffect(() => {
    if (cartCount > prevCart.current) {
      setCartBump(true);
      const t = setTimeout(() => setCartBump(false), 400);
      prevCart.current = cartCount;
      return () => clearTimeout(t);
    }
    prevCart.current = cartCount;
  }, [cartCount]);

  // RBAC rule 4: admins never get the customer bar - they use the admin tabs.
  if (currentUser.role === 'admin') return null;
  // Full-screen flows own the viewport and supply their own back control.
  if (HIDES_BOTTOM_NAV.includes(currentView)) return null;

  const go = (view: ViewType) => {
    // A guest sees the same bar, but taps prompt sign-in rather than dead-ending.
    if (isGuest && !GUEST_ALLOWED.includes(view)) {
      onOpenAuthModal();
      return;
    }
    onNavigate(view);
  };

  const tabBase =
    'flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-xl transition-all duration-150 min-w-[56px]';
  const labelCls = 'text-[10px] font-semibold leading-none';

  const badge = (count: number) =>
    count > 0 && !isGuest ? (
      <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center border-[1.5px] border-white leading-none">
        {badgeText(count)}
      </span>
    ) : null;

  const tab = (
    view: ViewType,
    label: string,
    Icon: React.ElementType,
    opts: { count?: number; activeColor?: string; bump?: boolean } = {},
  ) => {
    const active = currentView === view;
    const activeColor = opts.activeColor ?? 'text-[#2563eb]';
    return (
      <button
        onClick={() => go(view)}
        // Matches the desktop bar's names, so an onboarding step anchors to
        // whichever of the pair is actually laid out at this width.
        data-onboarding={`nav-${view}`}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        className={`${tabBase} ${active ? activeColor : 'text-[#737686] hover:text-[#434655]'}`}
      >
        <span className={`relative ${opts.bump ? 'animate-cart-bump' : ''}`}>
          <Icon className="w-6 h-6" strokeWidth={active ? 2.5 : 1.8} fill={active ? 'currentColor' : 'none'} />
          {badge(opts.count ?? 0)}
        </span>
        <span className={labelCls}>{label}</span>
      </button>
    );
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#c3c6d7]/60 shadow-[0_-2px_16px_0_rgba(0,0,0,0.06)] py-2 px-3 lg:hidden"
      aria-label="Primary"
    >
      <div className="max-w-md mx-auto flex items-end justify-between">
        {tab('browse', 'Home', Home)}

        {/* Seller state swaps Saved for My Listings in the same slot. */}
        {isSeller
          ? tab('my-listings', 'Listings', Tag, { activeColor: 'text-[#007d55]' })
          : tab('saved', 'Saved', Heart, { count: savedCount })}

        {/* Raised centre action - selling is the platform's other half. */}
        <div className="relative -top-5 flex flex-col items-center">
          <button
            onClick={() => go('sell')}
            data-onboarding="nav-sell"
            aria-label="Sell an item"
            className={`w-14 h-14 rounded-full text-white flex items-center justify-center shadow-[0_6px_20px_0_rgba(0,0,0,0.18)] transition-all duration-150 active:scale-95 ring-4 ring-white ${
              isSeller ? 'bg-[#007d55] hover:bg-[#006242]' : 'bg-[#2563eb] hover:bg-[#004ac6]'
            }`}
          >
            <Plus className="w-7 h-7" strokeWidth={2.5} />
          </button>
          <span className="text-[10px] font-semibold text-[#737686] mt-1 leading-none">Sell</span>
        </div>

        {tab('messages', 'Messages', MessageSquare, { count: unreadMessagesCount })}
        {tab('cart', 'Cart', ShoppingBag, { count: cartCount, bump: cartBump })}
      </div>
    </nav>
  );
};
