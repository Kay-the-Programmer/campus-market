import React, { useEffect, useState, useRef } from 'react';
import {
  Plus, Eye, Heart, MessageCircle, MoreVertical,
  Pencil, Trash2, Loader2, AlertTriangle, CheckCircle2,
  Clock, Package, ArrowLeft, ChevronDown,
  ShoppingBag, Briefcase, Utensils, FileEdit, Tag,
} from 'lucide-react';
import { Listing } from '../types';
import { api } from '../services/api';
import { MarkSoldModal } from './shared/MarkSoldModal';
import { Modal, ErrorBanner } from './shared/Modal';

interface MyListingsScreenProps {
  onBack: () => void;
  onNavigateToSell: () => void;
  onSelectListing: (listing: Listing) => void;
  onEditListing: (listing: Listing) => void;
  onListingsChanged?: () => void;
}

type TabKey = 'Available' | 'Reserved' | 'Sold' | 'Draft';
type SortKey = 'newest' | 'oldest' | 'views';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'Available', label: 'Active' },
  { key: 'Reserved', label: 'Reserved' },
  { key: 'Sold', label: 'Sold' },
  { key: 'Draft', label: 'Drafts' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'views', label: 'Most viewed' },
];

const typeChipClass = (category: string): string => {
  if (category === 'Service') return 'chip-service';
  if (category === 'Food') return 'chip-food';
  return 'chip-product';
};

const TypeIcon: React.FC<{ category: string; className?: string }> = ({ category, className = 'w-3 h-3' }) => {
  if (category === 'Service') return <Briefcase className={className} />;
  if (category === 'Food') return <Utensils className={className} />;
  return <ShoppingBag className={className} />;
};

export const MyListingsScreen: React.FC<MyListingsScreenProps> = ({
  onBack,
  onNavigateToSell,
  onSelectListing,
  onEditListing,
  onListingsChanged,
}) => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [tab, setTab] = useState<TabKey>('Available');
  const [sort, setSort] = useState<SortKey>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [soldTarget, setSoldTarget] = useState<Listing | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    if (openMenuId) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const load = async () => {
    setLoading(true);
    const res = await api.listings.getMyListings();
    setError(res.error || null);
    setListings(res.listings || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const refresh = async () => {
    await load();
    onListingsChanged?.();
  };

  const changeStatus = async (listing: Listing, status: 'ACTIVE' | 'RESERVED') => {
    setOpenMenuId(null);
    const res = await api.listings.changeStatus(listing.id, status);
    if (res.success) {
      setNotice(`"${listing.title}" is now ${status === 'ACTIVE' ? 'available' : 'reserved'}.`);
      refresh();
    } else {
      setError(res.error || 'Could not update the status.');
    }
  };

  const requestDelete = async (listing: Listing) => {
    setOpenMenuId(null);
    setDeleteTarget(listing);
    setDeleteWarning(null);
    /*
     * A probe, not a delete. The server refuses every unconfirmed call, so
     * nothing is destroyed until confirmDelete runs; all this asks for is the
     * conversation count, which decides how strongly the dialog warns.
     */
    const res = await api.listings.delete(listing.id, false);
    if (res.code === 'CONFIRM_REQUIRED') {
      if (res.conversationCount) {
        setDeleteWarning(
          `You have ${res.conversationCount} active conversation(s) about this item. Deleting it can't be undone.`,
        );
      }
      return;
    }
    // Anything else is a real failure - no such listing, not yours, offline.
    setDeleteWarning(res.error || 'Could not delete this listing.');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await api.listings.delete(deleteTarget.id, true);
    setDeleting(false);
    if (res.success) {
      setNotice(`"${deleteTarget.title}" was removed.`);
      setDeleteTarget(null);
      refresh();
    } else {
      setDeleteWarning(res.error || 'Could not delete this listing.');
    }
  };

  const counts = TABS.reduce<Record<string, number>>((acc, t) => {
    acc[t.key] = listings.filter((l) => l.badgeText === t.key).length;
    return acc;
  }, {});

  const totalViews = listings.reduce((s, l) => s + (l.viewsCount || 0), 0);
  const totalSaves = listings.reduce((s, l) => s + (l.likesCount || 0), 0);
  const totalMessages = listings.reduce((s, l) => s + (l.messagesCount || 0), 0);

  const filtered = listings.filter((l) => l.badgeText === tab);
  const visible = [...filtered].sort((a, b) => {
    if (sort === 'views') return (b.viewsCount || 0) - (a.viewsCount || 0);
    if (sort === 'oldest') return (a.createdAt || '').localeCompare(b.createdAt || '');
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  const isDraft = tab === 'Draft';

  /* ------------------------------------------------------------------ */
  /*  Skeleton                                                           */
  /* ------------------------------------------------------------------ */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] pb-28">
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#c3c6d7]/60 px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-200 rounded-full animate-pulse" />
              <div className="w-28 h-6 bg-slate-200 rounded-lg animate-pulse" />
            </div>
            <div className="w-28 h-9 bg-slate-200 rounded-xl animate-pulse" />
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
          <div className="hidden lg:grid grid-cols-3 gap-4 mb-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#e5eeff] p-4 shadow-card space-y-2">
                <div className="w-12 h-6 bg-slate-200 rounded-lg animate-pulse" />
                <div className="w-20 h-3 bg-slate-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
          <div className="flex gap-6 mb-6 border-b border-[#c3c6d7]/60 pb-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="w-20 h-5 bg-slate-200 rounded-lg animate-pulse" />
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-[#e5eeff] shadow-card divide-y divide-[#e5eeff]">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <div className="w-14 h-14 bg-slate-200 rounded-xl animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="w-44 h-4 bg-slate-200 rounded-lg animate-pulse" />
                  <div className="flex gap-2">
                    <div className="w-16 h-4 bg-slate-200 rounded-full animate-pulse" />
                    <div className="w-14 h-4 bg-slate-200 rounded-full animate-pulse" />
                  </div>
                </div>
                <div className="w-16 h-5 bg-slate-200 rounded-lg animate-pulse hidden sm:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Fatal error                                                        */
  /* ------------------------------------------------------------------ */
  if (error && listings.length === 0) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-lg font-bold text-red-700 mb-2">Can't load your listings</h2>
          <p className="text-sm text-red-600 mb-6">{error}</p>
          <button onClick={onBack} className="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Empty state per tab                                                */
  /* ------------------------------------------------------------------ */
  const renderEmptyState = () => {
    if (tab === 'Available') {
      return (
        <div className="bg-white border border-[#e5eeff] rounded-3xl p-16 text-center shadow-card">
          <div className="w-16 h-16 bg-[#eff4ff] text-[#2563eb] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-[#0b1c30] mb-2">You don't have any active listings yet</h2>
          <p className="text-[#737686] max-w-sm mx-auto mb-8 text-sm">
            Publish your first item to start selling on campus. It only takes a minute.
          </p>
          <button
            onClick={onNavigateToSell}
            className="px-8 py-3 bg-[#2563eb] text-white font-semibold rounded-xl hover:bg-[#004ac6] shadow-sm transition-colors"
          >
            Create Your First Listing
          </button>
        </div>
      );
    }
    if (tab === 'Reserved') {
      return (
        <div className="bg-white border border-[#e5eeff] rounded-2xl p-12 text-center shadow-card">
          <Clock className="w-8 h-8 text-[#c3c6d7] mx-auto mb-3" />
          <p className="text-sm text-[#737686]">Nothing reserved right now.</p>
        </div>
      );
    }
    if (tab === 'Sold') {
      return (
        <div className="bg-white border border-[#e5eeff] rounded-2xl p-12 text-center shadow-card">
          <CheckCircle2 className="w-8 h-8 text-[#c3c6d7] mx-auto mb-3" />
          <p className="text-sm text-[#737686]">You haven't sold anything yet — once you do, it'll show up here.</p>
        </div>
      );
    }
    return (
      <div className="bg-white border border-[#e5eeff] rounded-2xl p-12 text-center shadow-card">
        <FileEdit className="w-8 h-8 text-[#c3c6d7] mx-auto mb-3" />
        <p className="text-sm text-[#737686]">No drafts saved.</p>
      </div>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Status badge                                                       */
  /* ------------------------------------------------------------------ */
  const renderStatusBadge = (item: Listing) => {
    const s = item.badgeText;
    if (s === 'Available') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold whitespace-nowrap">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
          Active
        </span>
      );
    }
    if (s === 'Reserved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold whitespace-nowrap">
          <Clock className="w-3 h-3" />
          Reserved
        </span>
      );
    }
    if (s === 'Sold') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold whitespace-nowrap">
          Sold
        </span>
      );
    }
    if (s === 'Draft') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-slate-500 border border-dashed border-slate-300 text-[11px] font-bold whitespace-nowrap">
          Draft
        </span>
      );
    }
    return null;
  };

  /* ------------------------------------------------------------------ */
  /*  Three-dot dropdown (mobile/tablet)                                 */
  /* ------------------------------------------------------------------ */
  const renderDropdownMenu = (item: Listing) => {
    if (openMenuId !== item.id) return null;
    const isActive = item.badgeText === 'Available';
    const isReserved = item.badgeText === 'Reserved';
    const canMarkSold = isActive || isReserved;

    return (
      <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-[#e5eeff] shadow-modal z-40 py-1 animate-fade-in">
        <button
          onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onEditListing(item); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#0b1c30] hover:bg-[#eff4ff] transition-colors"
        >
          <Pencil className="w-3.5 h-3.5 text-[#737686]" /> Edit
        </button>
        {isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); changeStatus(item, 'RESERVED'); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#0b1c30] hover:bg-[#eff4ff] transition-colors"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" /> Reserve
          </button>
        )}
        {isReserved && (
          <button
            onClick={(e) => { e.stopPropagation(); changeStatus(item, 'ACTIVE'); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#0b1c30] hover:bg-[#eff4ff] transition-colors"
          >
            <Tag className="w-3.5 h-3.5 text-[#2563eb]" /> Make available
          </button>
        )}
        {canMarkSold && (
          <button
            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setSoldTarget(item); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#0b1c30] hover:bg-[#eff4ff] transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Mark as sold
          </button>
        )}
        <div className="border-t border-[#e5eeff] my-1" />
        <button
          onClick={(e) => { e.stopPropagation(); requestDelete(item); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Single listing row                                                 */
  /* ------------------------------------------------------------------ */
  const renderRow = (item: Listing) => {
    const isActive = item.badgeText === 'Available';
    const isReserved = item.badgeText === 'Reserved';
    const canMarkSold = isActive || isReserved;
    const isItemDraft = item.badgeText === 'Draft';

    return (
      <div
        key={item.id}
        onClick={() => isItemDraft ? onEditListing(item) : onSelectListing(item)}
        className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 cursor-pointer transition-colors hover:bg-[#f8f9ff]/80 group ${
          isItemDraft ? 'opacity-60' : ''
        }`}
      >
        {/* Thumbnail */}
        {item.image ? (
          <img
            src={item.image}
            alt={item.title}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover shrink-0 border border-[#e5eeff]"
          />
        ) : (
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#eff4ff] border border-[#dbe1ff] flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-[#b4c5ff]" />
          </div>
        )}

        {/* Title + type + contextual details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-bold text-sm text-[#0b1c30] truncate">{item.title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={typeChipClass(item.category)}>
              <TypeIcon category={item.category} />
              {item.category}
            </span>
            {renderStatusBadge(item)}
            {item.category === 'Food' && item.pickupWindow && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold whitespace-nowrap">
                <Clock className="w-2.5 h-2.5" />
                {item.pickupWindow}
              </span>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="shrink-0 text-right">
          <p className="text-sm sm:text-base font-extrabold text-[#2563eb] whitespace-nowrap">
            ${item.price}{item.priceUnit || ''}
          </p>
        </div>

        {/* Mini stats — hidden on small screens */}
        <div className="hidden md:flex items-center gap-3 text-[#737686] shrink-0">
          <span className="flex items-center gap-1 text-xs" title="Views">
            <Eye className="w-3.5 h-3.5" />
            {item.viewsCount || 0}
          </span>
          <span className="flex items-center gap-1 text-xs" title="Saves">
            <Heart className="w-3.5 h-3.5" />
            {item.likesCount || 0}
          </span>
          <span className="flex items-center gap-1 text-xs" title="Messages">
            <MessageCircle className="w-3.5 h-3.5" />
            {item.messagesCount || 0}
          </span>
        </div>

        {/* Draft: "Finish Listing" button instead of normal actions */}
        {isItemDraft ? (
          <button
            onClick={(e) => { e.stopPropagation(); onEditListing(item); }}
            className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#2563eb] text-white hover:bg-[#004ac6] transition-colors whitespace-nowrap"
          >
            <span className="hidden sm:inline">Finish Listing</span>
            <span className="sm:hidden"><FileEdit className="w-3.5 h-3.5" /></span>
          </button>
        ) : (
          <>
            {/* Desktop inline action buttons */}
            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onEditListing(item); }}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-[#434655] hover:bg-[#eff4ff] hover:text-[#2563eb] transition-colors"
              >
                Edit
              </button>
              {isActive && (
                <button
                  onClick={(e) => { e.stopPropagation(); changeStatus(item, 'RESERVED'); }}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-amber-700 hover:bg-amber-50 transition-colors"
                >
                  Reserve
                </button>
              )}
              {isReserved && (
                <button
                  onClick={(e) => { e.stopPropagation(); changeStatus(item, 'ACTIVE'); }}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-[#2563eb] hover:bg-[#eff4ff] transition-colors"
                >
                  Unreserve
                </button>
              )}
              {canMarkSold && (
                <button
                  onClick={(e) => { e.stopPropagation(); setSoldTarget(item); }}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-emerald-700 hover:bg-emerald-50 transition-colors"
                >
                  Mark sold
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); requestDelete(item); }}
                className="px-2 py-1.5 text-xs rounded-lg text-[#737686] hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Mobile/tablet three-dot menu */}
            <div className="lg:hidden relative shrink-0" ref={openMenuId === item.id ? menuRef : undefined}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(openMenuId === item.id ? null : item.id);
                }}
                className="p-1.5 rounded-lg hover:bg-[#eff4ff] text-[#737686] hover:text-[#0b1c30] transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {renderDropdownMenu(item)}
            </div>
          </>
        )}
      </div>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Main render                                                        */
  /* ------------------------------------------------------------------ */
  return (
    <div className="min-h-screen bg-[#f8f9ff] pb-28">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#c3c6d7]/60 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-2 rounded-full hover:bg-[#eff4ff] text-[#434655] hover:text-[#2563eb] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold text-[#0b1c30]">My Listings</h1>
          </div>
          <button
            onClick={onNavigateToSell}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2563eb] hover:bg-[#004ac6] text-white font-semibold rounded-xl text-sm shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Listing</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
        {/* Desktop stats bar */}
        <div className="hidden lg:grid grid-cols-3 gap-4 mb-6">
          {[
            { value: counts['Available'] || 0, label: 'Active listings', icon: <Tag className="w-4 h-4 text-emerald-600" /> },
            { value: totalViews, label: 'Total views', icon: <Eye className="w-4 h-4 text-[#2563eb]" /> },
            { value: totalMessages, label: 'Messages received', icon: <MessageCircle className="w-4 h-4 text-violet-600" /> },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-[#e5eeff] p-4 shadow-card flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#f8f9ff] flex items-center justify-center shrink-0">
                {stat.icon}
              </div>
              <div>
                <p className="text-xl font-bold text-[#0b1c30]">{stat.value}</p>
                <p className="text-[11px] text-[#737686] font-medium">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Notices */}
        <ErrorBanner message={error} />
        {notice && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs text-emerald-800 font-medium">{notice}</p>
          </div>
        )}

        {/* Status tabs */}
        <div
          data-onboarding="listings-tabs"
          className="flex items-center gap-1 sm:gap-6 border-b border-[#c3c6d7]/60 mb-1 overflow-x-auto no-scrollbar"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-3 px-1 font-semibold text-sm whitespace-nowrap transition-all ${
                tab === t.key
                  ? 'text-[#2563eb] border-b-2 border-[#2563eb]'
                  : 'text-[#737686] hover:text-[#0b1c30]'
              }`}
            >
              {t.label}
              <span
                className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full font-bold ${
                  tab === t.key
                    ? 'bg-[#2563eb] text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {counts[t.key] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        {filtered.length > 1 && (
          <div className="flex justify-end py-3">
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium text-[#434655] bg-white border border-[#c3c6d7]/60 rounded-lg hover:border-[#737686] focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/20 cursor-pointer outline-none transition-colors"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737686] pointer-events-none" />
            </div>
          </div>
        )}

        {/* Content */}
        {visible.length === 0 ? (
          renderEmptyState()
        ) : (
          <div className={`bg-white rounded-2xl border border-[#e5eeff] shadow-card divide-y divide-[#e5eeff] ${filtered.length <= 1 ? 'mt-4' : ''}`}>
            {visible.map((item) => renderRow(item))}
          </div>
        )}
      </div>

      {/* Mark sold modal */}
      {soldTarget && (
        <MarkSoldModal
          isOpen={!!soldTarget}
          onClose={() => setSoldTarget(null)}
          listingId={soldTarget.id}
          listingTitle={soldTarget.title}
          listingPrice={soldTarget.price}
          onSold={refresh}
        />
      )}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete this listing?"
        subtitle={deleteTarget?.title}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setDeleteTarget(null)} className="btn-ghost !rounded-xl !text-sm">
              Keep it
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete anyway
            </button>
          </div>
        }
      >
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 font-medium">
            {deleteWarning || "This can't be undone."}
          </p>
        </div>
        <p className="text-xs text-[#737686]">
          Past conversations and deal history keep a reference to it, shown as "Listing removed".
        </p>
      </Modal>
    </div>
  );
};
