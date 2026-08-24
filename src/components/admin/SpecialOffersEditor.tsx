import React, { useEffect, useState } from 'react';
import { Tag, Loader2, Search, X, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Listing } from '../../types';
import { api } from '../../services/api';
import { Modal, ErrorBanner, Field } from '../shared/Modal';
import { formatPrice } from '../../utils/currency';

interface SpecialOffersEditorProps {
  onNotice: (message: string) => void;
}

/**
 * Curates the Special Offers shelf on the home feed.
 *
 * <p>Promoting an existing listing rather than creating a parallel "offer"
 * record is what keeps the shelf honest: the item on it is the item buyers
 * order, from the seller who has to hand it over. An admin who wants to sell
 * something themselves lists it the normal way first, then promotes it here.
 */
export const SpecialOffersEditor: React.FC<SpecialOffersEditorProps> = ({ onNotice }) => {
  const [offers, setOffers] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Listing[]>([]);
  const [searching, setSearching] = useState(false);

  const [target, setTarget] = useState<Listing | null>(null);
  const [wasPrice, setWasPrice] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await api.admin.getSpecialOffers();
    setError(res.error || null);
    setOffers(res.listings);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runSearch = async () => {
    setSearching(true);
    const res = await api.listings.search({ search: query.trim() || undefined, size: 20 });
    // Anything already on the shelf is filtered out - re-adding it is not a
    // thing anyone wants, and the "Remove" control lives on the shelf itself.
    setResults(res.listings.filter((l) => !offers.some((o) => o.id === l.id)));
    setSearching(false);
  };

  useEffect(() => {
    if (!picker) return;
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker]);

  const promote = async () => {
    if (!target) return;
    const parsed = wasPrice.trim() ? Number(wasPrice) : undefined;

    if (parsed !== undefined) {
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('The usual price must be a number above zero.');
        return;
      }
      // Checked here as well as server-side so the admin is corrected while
      // the form is still open, rather than after it closes.
      if (parsed <= target.price) {
        setError(`The usual price has to be more than the offer price of ${formatPrice(target.price)}.`);
        return;
      }
    }

    setBusyId(target.id);
    const res = await api.admin.setSpecialOffer(target.id, true, parsed);
    setBusyId(null);

    if (res.success) {
      setTarget(null);
      setWasPrice('');
      setPicker(false);
      setError(null);
      onNotice(`"${target.title}" is now on the offers shelf.`);
      load();
    } else {
      setError(res.error || 'Could not promote that listing.');
    }
  };

  const remove = async (listing: Listing) => {
    setBusyId(listing.id);
    const res = await api.admin.setSpecialOffer(listing.id, false);
    setBusyId(null);
    if (res.success) {
      onNotice(`"${listing.title}" removed from special offers.`);
      load();
    } else {
      setError(res.error || 'Could not remove that listing.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Special offers</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            The deals shelf at the top of the home feed. Promote a live listing, optionally with
            the price it usually goes for, and buyers see the saving.
          </p>
        </div>
        <button
          onClick={() => { setPicker(true); setQuery(''); setError(null); }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" /> Add a listing
        </button>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the shelf…
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200/80">
          <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Tag className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-slate-900">Nothing on the shelf</h3>
          <p className="text-sm text-slate-500 mt-1.5 max-w-sm mx-auto">
            The Special offers section stays hidden on the home feed until you add something.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {offers.map((o) => {
            const inactive = o.status && o.status !== 'ACTIVE';
            return (
              <div key={o.id} className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                <div className="relative aspect-[16/9] bg-slate-100">
                  <img src={o.image} alt="" className="w-full h-full object-cover" />
                  {typeof o.discountPercent === 'number' && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[#b3123c] text-white text-[11px] font-extrabold">
                      -{o.discountPercent}%
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-bold text-slate-900 text-sm truncate">{o.title}</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="font-extrabold text-[#b3123c]">{formatPrice(o.price)}</span>
                    {typeof o.compareAtPrice === 'number' && (
                      <span className="text-xs text-slate-400 line-through">
                        {formatPrice(o.compareAtPrice)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 truncate">by {o.seller?.name}</p>

                  {/* A sold or reserved item stays on the shelf until someone
                      clears it, so say so rather than letting it sit there
                      quietly advertising something nobody can buy. */}
                  {inactive && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {o.status === 'SOLD' ? 'Sold' : o.status} — buyers still see this
                    </p>
                  )}

                  <button
                    onClick={() => remove(o)}
                    disabled={busyId === o.id}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {busyId === o.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                    Remove from shelf
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Picker: find a listing to promote */}
      <Modal
        isOpen={picker && !target}
        onClose={() => setPicker(false)}
        title="Add a listing to special offers"
        subtitle="Search the catalogue, then set the usual price on the next step."
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="Search listings…"
              className="input-base text-sm !py-2 !pl-9"
            />
          </div>
          <button onClick={runSearch} className="btn-primary !rounded-xl !text-sm !h-10 !px-4">
            Search
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-2">
          {searching ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            /* "Nothing matched" is wrong when the catalogue is small and every
               live listing is already promoted - which is the state a new
               marketplace spends most of its time in. Say which it is. */
            <p className="text-sm text-slate-500 py-6 text-center">
              {query.trim()
                ? `Nothing matched "${query.trim()}".`
                : offers.length > 0
                  ? 'Every live listing is already on the shelf.'
                  : 'There are no live listings to promote yet.'}
            </p>
          ) : (
            results.map((l) => (
              <button
                key={l.id}
                onClick={() => { setTarget(l); setWasPrice(''); setError(null); }}
                className="w-full flex items-center gap-3 p-2 rounded-xl border border-slate-200 hover:border-slate-400 hover:bg-slate-50 text-left transition-colors"
              >
                <img src={l.image} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{l.title}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {formatPrice(l.price)} · {l.seller?.name}
                  </p>
                </div>
                <Plus className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            ))
          )}
        </div>
      </Modal>

      {/* Confirm: set the was-price */}
      <Modal
        isOpen={!!target}
        onClose={() => { setTarget(null); setError(null); }}
        title={target ? `Promote "${target.title}"` : ''}
        subtitle={target ? `Selling at ${formatPrice(target.price)}` : undefined}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setTarget(null); setError(null); }}
              className="btn-ghost !rounded-xl !text-sm"
            >
              Cancel
            </button>
            <button
              onClick={promote}
              disabled={!!busyId}
              className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busyId && <Loader2 className="w-4 h-4 animate-spin" />}
              Add to shelf
            </button>
          </div>
        }
      >
        <ErrorBanner message={error} />
        <Field label="Usual price (K) — optional">
          <input
            type="number"
            min={0}
            value={wasPrice}
            onChange={(e) => setWasPrice(e.target.value)}
            placeholder={target ? String(Math.round(target.price * 1.3)) : ''}
            className="input-base text-sm"
          />
        </Field>
        <p className="mt-2 text-xs text-slate-500">
          Shown struck through next to the offer price, with the saving as a percentage. Leave it
          blank if there is no honest previous price — a made-up one is worse than none.
        </p>
      </Modal>
    </div>
  );
};
