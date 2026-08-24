import React, { useEffect, useState } from 'react';
import {
  Search, Loader2, Plus, Pencil, Trash2, Eye, Tag, AlertTriangle, PackageX,
} from 'lucide-react';
import { Listing } from '../../types';
import { api } from '../../services/api';
import { Modal, ErrorBanner } from '../shared/Modal';
import { formatPrice } from '../../utils/currency';

interface ListingManagerProps {
  onNotice: (message: string) => void;
  /** Opens the public listing page, so the admin sees what buyers see. */
  onViewListing: (listing: Listing) => void;
  /** Loads the listing into the same form sellers use. */
  onEditListing: (listing: Listing) => void;
  /** Starts a blank listing owned by the admin account. */
  onCreateListing: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RESERVED: 'bg-amber-50 text-amber-700 border-amber-200',
  SOLD: 'bg-slate-100 text-slate-600 border-slate-200',
  DRAFT: 'bg-blue-50 text-blue-700 border-blue-200',
};

/**
 * The catalogue, as an administrator sees it.
 *
 * <p>Deliberately shows everything - drafts, sold items, and removed rows on
 * request - because the whole reason to open this screen is to find a listing
 * that is not behaving, and the ones causing trouble are rarely the ones
 * public browse will show you.
 *
 * <p>Viewing and editing reuse the buyer's listing page and the seller's own
 * form rather than reimplementing either. An admin editing through the same
 * screen the seller used cannot produce a listing shape the seller's form
 * would reject.
 */
export const ListingManager: React.FC<ListingManagerProps> = ({
  onNotice,
  onViewListing,
  onEditListing,
  onCreateListing,
}) => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (search = query, removed = includeRemoved) => {
    setLoading(true);
    const res = await api.admin.getListings(search, removed);
    setError(res.error || null);
    setListings(res.listings);
    setLoading(false);
  };

  /* One effect, not two. A separate mount effect alongside this one fetched the
     whole catalogue a second time every time the screen opened - this already
     runs on mount, carrying the same empty query. */
  useEffect(() => { load(query, includeRemoved); }, [includeRemoved]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    // confirmed:true - the admin has already been shown what they are removing,
    // and a second "are you sure" from the API helps nobody here.
    const res = await api.listings.delete(deleteTarget.id, true);
    setBusy(false);

    if (res.success) {
      onNotice(`"${deleteTarget.title}" was removed.`);
      setDeleteTarget(null);
      load();
    } else {
      setError(res.error || 'Could not remove that listing.');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Listings</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            Every item in the catalogue. Edits you make to someone else's listing are recorded in
            the audit trail and the seller is notified.
          </p>
        </div>
        <button
          onClick={onCreateListing}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> New listing
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(query, includeRemoved)}
            placeholder="Search by title…"
            className="input-base text-sm !py-2 !pl-9"
          />
        </div>
        <button
          onClick={() => load(query, includeRemoved)}
          className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Search
        </button>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={includeRemoved}
            onChange={(e) => setIncludeRemoved(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300"
          />
          Show removed
        </label>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the catalogue…
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200/80">
          <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <PackageX className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-slate-900">
            {query.trim() ? `Nothing matched "${query.trim()}"` : 'No listings yet'}
          </h3>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
          {listings.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3 p-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors"
              >
                <img
                  src={l.image}
                  alt=""
                  className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 text-sm truncate">{l.title}</p>
                    {l.status && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold ${
                          STATUS_STYLE[l.status] ?? 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {l.status}
                      </span>
                    )}
                    {l.specialOffer && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#ffe8ec] text-[#b3123c] text-[10px] font-bold">
                        <Tag className="w-2.5 h-2.5" /> Offer
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {formatPrice(l.price)} · {l.seller?.name} · {l.location}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onViewListing(l)}
                    aria-label={`View ${l.title}`}
                    className="p-2 rounded-lg text-slate-500 hover:text-[#2563eb] hover:bg-blue-50 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onEditListing(l)}
                    aria-label={`Edit ${l.title}`}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(l)}
                    aria-label={`Remove ${l.title}`}
                    className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove this listing?"
        subtitle={deleteTarget?.title}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setDeleteTarget(null)} className="btn-ghost !rounded-xl !text-sm">
              Keep it
            </button>
            <button
              onClick={confirmDelete}
              disabled={busy}
              className="px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Remove listing
            </button>
          </div>
        }
      >
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 leading-relaxed">
            The listing disappears from browse and search straight away. Existing chats and deal
            history keep working and will show it as removed, so nobody's records break.
          </p>
        </div>
      </Modal>
    </div>
  );
};
