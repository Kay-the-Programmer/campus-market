import React, { useEffect, useRef, useState } from 'react';
import {
  User as UserIcon, ChevronDown, Tag, Award, Settings, LogOut, Heart,
  Store,
} from 'lucide-react';
import { AuthSession, ViewType } from '../../types';
import { canSell, isSellerState } from './navShared';

interface AccountMenuProps {
  currentUser: AuthSession;
  onNavigate: (view: ViewType) => void;
  onLogout?: () => void;
}

/** Desktop account dropdown. Sellers get My Listings pinned to the top. */
export const AccountMenu: React.FC<AccountMenuProps> = ({ currentUser, onNavigate, onLogout }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isSeller = isSellerState(currentUser);
  const sells = canSell(currentUser);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (view: ViewType) => { setOpen(false); onNavigate(view); };

  const itemCls =
    'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[#434655] hover:bg-[#f8f9ff] hover:text-[#0b1c30] transition-colors text-left';

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full border border-[#c3c6d7]/80 hover:bg-[#eff4ff] hover:border-[#2563eb]/40 transition-all duration-150"
      >
        {currentUser.avatar ? (
          <img src={currentUser.avatar} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-[#2563eb]/30" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-[#dbe1ff] flex items-center justify-center ring-2 ring-[#2563eb]/20">
            <UserIcon className="w-4 h-4 text-[#2563eb]" />
          </div>
        )}
        <span className="text-xs font-semibold text-[#0b1c30] hidden xl:inline max-w-[90px] truncate">
          {currentUser.name.split(' ')[0]}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#737686] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 bg-white rounded-2xl border border-[#e5eeff] shadow-modal overflow-hidden py-1 z-50 animate-fade-in"
        >
          <div className="px-4 py-3 border-b border-[#e5eeff]">
            <p className="text-sm font-bold text-[#0b1c30] truncate">{currentUser.name}</p>
            {isSeller ? (
              <p className="text-[11px] font-semibold text-[#007d55] mt-0.5">
                {currentUser.activeListings ?? 0} active listing
                {(currentUser.activeListings ?? 0) === 1 ? '' : 's'}
              </p>
            ) : (
              <p className="text-[11px] text-[#737686] mt-0.5 truncate">{currentUser.email}</p>
            )}
          </div>

          {isSeller && (
            <button role="menuitem" onClick={() => go('my-listings')} className={itemCls}>
              <Tag className="w-4 h-4 text-[#007d55]" /> My Listings
            </button>
          )}
          {/* Orders moved to the top bar, where it is one click from anywhere
              instead of two. Not duplicated here on purpose: two entry points
              to the same screen is how a menu stops being scannable. */}
          <button role="menuitem" onClick={() => go('profile')} className={itemCls}>
            <UserIcon className="w-4 h-4" /> Profile
          </button>
          {/* Sellers lose Saved from the main bar, so it stays reachable here. */}
          {isSeller && (
            <button role="menuitem" onClick={() => go('saved')} className={itemCls}>
              <Heart className="w-4 h-4" /> Saved
            </button>
          )}
          <button role="menuitem" onClick={() => go('deals')} className={itemCls}>
            <Award className="w-4 h-4" /> Deal History
          </button>
          <button role="menuitem" onClick={() => go('support')} className={itemCls}>
            <Settings className="w-4 h-4" /> Settings &amp; Help
          </button>

          {/* Buyers only. Routing to 'sell' is what triggers the upgrade
              prompt, so this needs no separate handler. */}
          {!sells && currentUser.role === 'customer' && (
            <div className="border-t border-[#e5eeff] mt-1 pt-1">
              <button
                role="menuitem"
                onClick={() => go('sell')}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[#006242] hover:bg-emerald-50 transition-colors text-left"
              >
                <Store className="w-4 h-4" /> Start selling
              </button>
            </div>
          )}

          {onLogout && (
            <div className="border-t border-[#e5eeff] mt-1 pt-1">
              <button
                role="menuitem"
                onClick={() => { setOpen(false); onLogout(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors text-left"
              >
                <LogOut className="w-4 h-4" /> Log Out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
