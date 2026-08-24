import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { AuthSession } from '../types';
import { api } from '../services/api';

interface RoleSwitcherBarProps {
  currentUser: AuthSession;
  onSessionChange: (session: AuthSession) => void;
  onOpenAuthModal: () => void;
}

/**
 * Development-only RBAC test harness.
 *
 * Each button performs a real email + password login against a seeded demo
 * account - there is no back door that mints a session without credentials.
 * The whole bar is compiled out of production builds, because a one-click
 * "become an admin" control has no business shipping.
 */
const DEMO_ACCOUNTS = [
  { key: 'emma', label: '2. Customer (Emma)', email: 'emma.w@campus.edu', password: 'Password123', accent: 'blue' },
  { key: 'alex', label: '3. Seller (Alex - Derived)', email: 'alex.rivers@campus.edu', password: 'Password123', accent: 'emerald' },
  { key: 'admin', label: '4. Admin Console', email: 'admin@campus.edu', password: 'Admin123!', accent: 'purple' },
] as const;

export const RoleSwitcherBar: React.FC<RoleSwitcherBarProps> = ({
  currentUser,
  onSessionChange,
  onOpenAuthModal,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!import.meta.env.DEV) {
    return null;
  }

  const signOut = async () => {
    setLoading(true);
    setError(null);
    await api.auth.logout();
    onSessionChange({
      id: 'guest',
      name: 'Guest Visitor',
      email: '',
      avatar: '',
      role: 'guest',
      accountType: 'BUYER',
      sellerApprovalStatus: 'NOT_REQUESTED',
      canSell: false,
      hasActiveListings: false,
    });
    setLoading(false);
  };

  const signInAs = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    const res = await api.auth.login(email, password);
    setLoading(false);
    if (res.ok && res.user) {
      onSessionChange(res.user);
    } else {
      setError(res.error || 'Login failed. Has the API finished starting?');
    }
  };

  const roleBadgeColor = () => {
    if (currentUser.role === 'admin') return 'bg-purple-600 text-white border-purple-700';
    if (currentUser.role === 'customer' && currentUser.hasActiveListings)
      return 'bg-emerald-600 text-white border-emerald-700';
    if (currentUser.role === 'customer') return 'bg-blue-600 text-white border-blue-700';
    return 'bg-slate-700 text-white border-slate-800';
  };

  const roleLabel = () => {
    if (currentUser.role === 'admin') return 'ADMIN';
    if (currentUser.role === 'customer' && currentUser.hasActiveListings) return 'SELLER (Derived)';
    if (currentUser.role === 'customer') return 'CUSTOMER';
    return 'GUEST';
  };

  const accentClass = (accent: string, active: boolean) => {
    if (active) {
      const map: Record<string, string> = {
        blue: 'bg-blue-600 text-white border-blue-500 font-bold',
        emerald: 'bg-emerald-600 text-white border-emerald-500 font-bold',
        purple: 'bg-purple-600 text-white border-purple-500 font-bold',
      };
      return map[accent];
    }
    const hover: Record<string, string> = {
      blue: 'hover:bg-blue-600/40',
      emerald: 'hover:bg-emerald-600/40',
      purple: 'hover:bg-purple-600/40',
    };
    return `bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white ${hover[accent]}`;
  };

  return (
    <div className="bg-slate-900 text-slate-200 border-b border-slate-800 px-3 py-1.5 text-xs z-50">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            Server RBAC Session:
          </span>
          <span className={`px-2 py-0.5 rounded font-bold text-[11px] uppercase border shadow-xs ${roleBadgeColor()}`}>
            {roleLabel()}
          </span>
          <span className="text-white font-medium">{currentUser.name}</span>
          {currentUser.role === 'customer' && (
            <span className="text-slate-400 text-[11px]">
              ({currentUser.hasActiveListings
                ? 'Has Active Listings → Seller Nav'
                : '0 Active Listings → Customer Nav'})
            </span>
          )}
          {(currentUser.isSuspended || currentUser.isBanned) && (
            <span className="bg-red-500/20 text-red-300 border border-red-500/40 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {currentUser.isBanned ? 'BANNED (Write Lockout)' : 'SUSPENDED (Write Lockout)'}
            </span>
          )}
          {error && <span className="text-red-300 font-medium">{error}</span>}
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto">
          <span className="text-slate-400 font-medium mr-1 hidden sm:inline">Switch Test Account:</span>

          <button
            onClick={signOut}
            disabled={loading}
            className={`px-2.5 py-1 rounded transition-colors font-medium border disabled:opacity-50 ${
              currentUser.role === 'guest'
                ? 'bg-slate-700 text-white border-slate-600 font-bold'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
            }`}
          >
            1. Guest / Log Out
          </button>

          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.key}
              onClick={() => signInAs(account.email, account.password)}
              disabled={loading}
              className={`px-2.5 py-1 rounded transition-colors font-medium border disabled:opacity-50 ${accentClass(
                account.accent,
                currentUser.email === account.email,
              )}`}
            >
              {account.label}
            </button>
          ))}

          <button
            onClick={onOpenAuthModal}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 font-semibold transition-colors ml-1"
          >
            + Auth / Custom
          </button>
        </div>
      </div>
    </div>
  );
};
