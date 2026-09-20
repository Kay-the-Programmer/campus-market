import React from 'react';
import {
  LayoutDashboard, Flag, Users, Grid3x3, ShieldCheck, LogOut, User as UserIcon,
  Store, PackageCheck, Megaphone, Tag, Package, MessageSquare, Mail,
} from 'lucide-react';
import { AuthSession } from '../../types';

export type AdminTab =
  | 'dashboard' | 'reports' | 'sellers' | 'heldOrders' | 'chats'
  | 'users' | 'listings' | 'homepage' | 'specialOffers' | 'categories'
  | 'campaigns' | 'auditLogs';

interface AdminNavProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onExitAdmin: () => void;
  currentUser: AuthSession;
  pendingReports?: number;
  /** Seller applications waiting on a decision. */
  pendingSellers?: number;
  /** Orders withheld from unverified sellers, waiting on review. */
  heldOrders?: number;
  /** Unread messages in threads this admin is mediating. */
  unreadChats?: number;
}

/** `badge` names which count, if any, sits on the tab. */
const TABS: { key: AdminTab; label: string; icon: React.ElementType; badge?: 'reports' | 'sellers' | 'held' | 'chats' }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'reports', label: 'Reports', icon: Flag, badge: 'reports' },
  { key: 'sellers', label: 'Seller Approvals', icon: Store, badge: 'sellers' },
  { key: 'heldOrders', label: 'Held Orders', icon: PackageCheck, badge: 'held' },
  { key: 'chats', label: 'Chats', icon: MessageSquare, badge: 'chats' },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'listings', label: 'Listings', icon: Package },
  { key: 'homepage', label: 'Home Page', icon: Megaphone },
  { key: 'specialOffers', label: 'Special Offers', icon: Tag },
  { key: 'categories', label: 'Categories', icon: Grid3x3 },
  { key: 'campaigns', label: 'Email Campaigns', icon: Mail },
  { key: 'auditLogs', label: 'Audit Trail', icon: ShieldCheck },
];

/**
 * Admin navigation. Deliberately a different shape and palette from the
 * customer chrome - a desaturated slate sidebar rather than the vibrant blue
 * shopping bar - so there is never any doubt which mode you are in.
 *
 * Desktop: fixed left sidebar. Mobile: a scrollable tab strip under the header,
 * and no bottom bar at all.
 */
export const AdminSidebar: React.FC<AdminNavProps> = ({
  activeTab,
  onTabChange,
  onExitAdmin,
  pendingReports = 0,
  pendingSellers = 0,
  heldOrders = 0,
  unreadChats = 0,
}) => {
  const badgeCount = (badge?: 'reports' | 'sellers' | 'held' | 'chats') =>
    badge === 'reports' ? pendingReports
      : badge === 'sellers' ? pendingSellers
      : badge === 'held' ? heldOrders
      : badge === 'chats' ? unreadChats
      : 0;

  const itemCls = (active: boolean) =>
    `w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      active
        ? 'bg-slate-800 text-white'
        : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
    }`;

  return (
    <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 sticky top-0 h-screen bg-slate-900 border-r border-slate-800">
      <div className="px-5 h-16 flex items-center gap-2.5 border-b border-slate-800 shrink-0">
        {/* Same mark as the customer chrome - the palette around it is what
            distinguishes the two modes, not a different brand. */}
        <img
          src="/images/logo.png"
          alt=""
          width={32}
          height={32}
          className="w-8 h-8 object-contain shrink-0"
        />
        <div className="min-w-0">
          <span className="text-[15px] font-bold tracking-tight text-white block leading-none truncate">
            CampusMarket
          </span>
          <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-400 block mt-1">
            Admin Console
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {TABS.map(({ key, label, icon: Icon, badge }) => {
          const count = badgeCount(badge);
          return (
            <button key={key} onClick={() => onTabChange(key)} className={itemCls(activeTab === key)}>
              <span className="flex items-center gap-3">
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {label}
              </span>
              {count > 0 && (
                <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Separated by a divider so it reads as leaving, not another section. */}
      <div className="shrink-0 border-t border-slate-800 p-3">
        <button
          onClick={onExitAdmin}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-white transition-colors"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Exit Admin
        </button>
      </div>
    </aside>
  );
};

/** Slim content header: identity only - no search, cart or messages apply here. */
export const AdminHeader: React.FC<AdminNavProps> = ({
  activeTab,
  onTabChange,
  onExitAdmin,
  currentUser,
  pendingReports = 0,
  pendingSellers = 0,
  heldOrders = 0,
  unreadChats = 0,
}) => (
  <div className="sticky top-0 z-30 bg-white border-b border-slate-200">
    <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
      <div className="lg:hidden">
        <span className="text-[15px] font-bold tracking-tight text-slate-900 block leading-none">
          CampusMarket
        </span>
        <span className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 block mt-0.5">
          Admin Console
        </span>
      </div>
      <span className="hidden lg:block text-sm font-semibold text-slate-700 capitalize">
        {TABS.find((t) => t.key === activeTab)?.label}
      </span>

      <div className="flex items-center gap-2 ml-auto">
        <div className="flex items-center gap-2">
          {currentUser.avatar ? (
            <img src={currentUser.avatar} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-slate-200" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-slate-500" />
            </div>
          )}
          <span className="hidden sm:block text-xs font-semibold text-slate-700 max-w-[120px] truncate">
            {currentUser.name}
          </span>
        </div>
        {/* Mobile keeps Exit where notifications would normally sit. */}
        <button
          onClick={onExitAdmin}
          aria-label="Exit admin"
          title="Exit Admin"
          className="lg:hidden p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </div>

    {/* Mobile tab strip, directly under the header. No bottom bar in admin. */}
    <div className="lg:hidden flex items-center gap-1 px-3 pb-2 overflow-x-auto no-scrollbar">
      {TABS.map(({ key, label, icon: Icon, badge }) => {
        const count = badge === 'reports' ? pendingReports
          : badge === 'sellers' ? pendingSellers
          : badge === 'held' ? heldOrders
          : badge === 'chats' ? unreadChats
          : 0;
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {count > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);
