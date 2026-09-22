import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Clock, X, Layers, ShoppingBag, Briefcase, Utensils, Loader2, TrendingUp, Tag,
} from 'lucide-react';
import { Suggestion } from '../../types';
import { api } from '../../services/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getRecentSearches, removeRecentSearch, clearRecentSearches } from '../../services/recentSearches';
import { formatPrice } from '../../utils/currency';
import { ListingImage } from '../shared/ListingImage';

const MIN_QUERY = 2;

/** How many busiest categories to offer someone who has not typed yet. */
const POPULAR_LIMIT = 5;

/**
 * The last-resort starters.
 *
 * <p>Only reached when the categories call fails - a brand new visitor opening
 * an empty panel would otherwise be shown nothing at all, which reads as a
 * broken search box rather than an empty one. Everything above this comes from
 * the catalogue itself.
 */
const FALLBACK_TERMS = ['textbook', 'desk lamp', 'tutor', 'bike', 'lunch'];

interface PopularCategory {
  id: string;
  name: string;
  listingCount: number;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  PRODUCT: <ShoppingBag className="w-3 h-3" />,
  SERVICE: <Briefcase className="w-3 h-3" />,
  FOOD: <Utensils className="w-3 h-3" />,
};

interface SearchSuggestionsProps {
  query: string;
  userId: string;
  open: boolean;
  onClose: () => void;
  /** Run a full-text search for this term. */
  onSearch: (term: string) => void;
  onSelectListing: (listingId: string) => void;
  onSelectCategory: (categoryId: string, label: string) => void;
  /**
   * Jumps straight to the reduced listings.
   *
   * <p>The panel is open before anything has been typed, which is the one
   * moment someone is deciding what to look for rather than looking for
   * something - so it is the right place to offer the answer a lot of them
   * actually want. Optional: without it the row is simply not drawn.
   */
  onShowDeals?: () => void;
}

/**
 * The dropdown under the nav search box.
 *
 * Two modes, decided by whether anything has been typed: recent searches when
 * the box is empty, live suggestions once there are two characters. Both are
 * one flat keyboard list, because arrow keys crossing an invisible boundary
 * between two lists is the fastest way to make a combobox feel broken.
 */
export const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
  query,
  userId,
  open,
  onClose,
  onSearch,
  onSelectListing,
  onSelectCategory,
  onShowDeals,
}) => {
  const [listings, setListings] = useState<Suggestion[]>([]);
  const [categories, setCategories] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [popular, setPopular] = useState<PopularCategory[]>([]);
  const [cursor, setCursor] = useState(-1);

  const trimmed = query.trim();
  const typing = trimmed.length >= MIN_QUERY;

  /*
   * Suggestions are fetched for the SETTLED query, not the live one, so a
   * whole word costs one request rather than one per character. The panel
   * still reflects the live text immediately - only the network call waits.
   */
  const settledQuery = useDebouncedValue(trimmed);
  const settled = settledQuery.trim();

  // Re-read on open rather than once on mount, so a search made a moment ago
  // is already there the next time the box is focused.
  useEffect(() => {
    if (open) {
      setRecent(getRecentSearches(userId));
      setCursor(-1);
    }
  }, [open, userId, query]);

  /*
   * What the campus actually has, in place of five words chosen by whoever
   * wrote this component.
   *
   * The old starter list was static, so a new visitor was told to search for a
   * "desk lamp" whether or not a single lamp had ever been listed - and the
   * busiest category on the site went unmentioned. Ordering by listing count
   * and dropping the empties means nothing offered here leads to a page with
   * nothing on it.
   *
   * Fetched once per mount rather than per open: category volumes move over
   * days, not between two taps on a search box.
   */
  useEffect(() => {
    let cancelled = false;
    api.categories.getAll().then((res) => {
      if (cancelled) return;
      const list = ((res.categories as PopularCategory[]) || [])
        .filter((c) => c.listingCount > 0)
        .sort((a, b) => b.listingCount - a.listingCount)
        .slice(0, POPULAR_LIMIT);
      setPopular(list);
    });
    return () => { cancelled = true; };
  }, []);

  /* ── Fetch once typing settles; in-flight calls are cancelled ────────── */
  useEffect(() => {
    if (!open || settled.length < MIN_QUERY) {
      setListings([]);
      setCategories([]);
      setLoading(false);
      return;
    }
    // Aborting rather than just ignoring the response means a superseded
    // query stops costing the server anything the moment it is superseded.
    const controller = new AbortController();
    setLoading(true);

    api.listings.suggestions(settled, 6, controller.signal).then((res) => {
      if (res.aborted) return;
      setListings(res.listings || []);
      setCategories(res.categories || []);
      setLoading(false);
    });

    return () => controller.abort();
  }, [settled, open]);

  /* Show the spinner the moment they type, not only once the fetch starts,
     so a settling query never looks like a finished empty one. */
  const pending = typing && settled !== trimmed;

  /*
   * One flat list of everything selectable, in visual order. The keyboard
   * handler walks this rather than the individual sections, so there is a
   * single definition of "what is item 3" for both rendering and Enter.
   */
  /** Real categories when we have them; the static words only if we do not. */
  const starterTerms = popular.length > 0 ? [] : FALLBACK_TERMS;

  const rows = useMemo(() => {
    const out: { key: string; run: () => void }[] = [];
    if (typing) {
      out.push({ key: `search:${trimmed}`, run: () => onSearch(trimmed) });
      listings.forEach((s) => out.push({ key: `l:${s.id}`, run: () => onSelectListing(s.id) }));
      categories.forEach((s) =>
        out.push({ key: `c:${s.id}`, run: () => onSelectCategory(s.id, s.label) }));
    } else {
      /* Visual order, exactly: deals, then recents, then the popular
         categories, then the fallback words if there are no categories. The
         arrow keys walk this list, so any disagreement with the markup below
         makes Enter open the wrong row. */
      if (onShowDeals) out.push({ key: 'deals', run: onShowDeals });
      recent.forEach((t) => out.push({ key: `r:${t}`, run: () => onSearch(t) }));
      popular.forEach((c) =>
        out.push({ key: `p:${c.id}`, run: () => onSelectCategory(c.id, c.name) }));
      starterTerms.forEach((t) => out.push({ key: `s:${t}`, run: () => onSearch(t) }));
    }
    return out;
  }, [typing, trimmed, listings, categories, recent, popular, starterTerms, onShowDeals,
    onSearch, onSelectListing, onSelectCategory]);

  /* ── Keyboard: arrows move, Enter picks, Escape closes ───────────────── */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (rows.length === 0) return;
        e.preventDefault();
        setCursor((c) => {
          const next = e.key === 'ArrowDown' ? c + 1 : c - 1;
          // Wraps, so holding an arrow never dead-ends at either edge.
          if (next < 0) return rows.length - 1;
          if (next >= rows.length) return 0;
          return next;
        });
        return;
      }
      if (e.key === 'Enter' && cursor >= 0 && cursor < rows.length) {
        // Only intercept Enter when something is actively highlighted; plain
        // Enter belongs to the form, which searches for what was typed.
        e.preventDefault();
        rows[cursor].run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, rows, cursor, onClose]);

  if (!open) return null;

  const rowCls = (index: number) =>
    `w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
      cursor === index ? 'bg-[#eff4ff]' : 'hover:bg-[#f8f9ff]'
    }`;

  let index = -1;

  return (
    <div
      role="listbox"
      className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-2xl border border-[#e5eeff] shadow-modal overflow-hidden py-1 max-h-[70vh] overflow-y-auto animate-fade-in"
    >
      {/* ---------------------------------------------- empty box: recents */}
      {!typing && (
        <>
          {/* Deals first, before anything they have to read and choose between.
              It is the one row that is an answer rather than a prompt. */}
          {onShowDeals && (() => {
            index += 1;
            const i = index;
            return (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={onShowDeals}
                onMouseEnter={() => setCursor(i)}
                className={`${rowCls(i)} border-b border-[#f1f2f7]`}
              >
                <span className="w-7 h-7 rounded-lg bg-[#ffe8ec] flex items-center justify-center shrink-0">
                  <Tag className="w-3.5 h-3.5 text-[#b3123c]" />
                </span>
                <span className="text-sm font-semibold text-[#0b1c30] truncate">
                  Today's deals
                </span>
                <span className="ml-auto text-[11px] font-bold text-[#b3123c] shrink-0">
                  Reduced prices
                </span>
              </button>
            );
          })()}

          {recent.length > 0 && (
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <span className="text-[10px] font-bold text-[#a0a3b1] uppercase tracking-wider">
              Recent searches
            </span>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { clearRecentSearches(userId); setRecent([]); }}
              className="text-[11px] font-semibold text-[#737686] hover:text-[#0b1c30]"
            >
              Clear
            </button>
          </div>
          )}

          {recent.map((term) => {
            index += 1;
            const i = index;
            return (
              <div key={term} className={`group relative ${cursor === i ? 'bg-[#eff4ff]' : ''}`}>
                <button
                  // mousedown would blur the input and close the panel before
                  // click ever fires, so selection is suppressed here.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSearch(term)}
                  onMouseEnter={() => setCursor(i)}
                  className={rowCls(i)}
                >
                  <Clock className="w-4 h-4 text-[#a0a3b1] shrink-0" />
                  <span className="text-sm text-[#0b1c30] truncate">{term}</span>
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    removeRecentSearch(userId, term);
                    setRecent(getRecentSearches(userId));
                  }}
                  aria-label={`Remove ${term} from recent searches`}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-[#a0a3b1] hover:text-[#0b1c30] hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}

          {/* ── What the campus is actually selling ─────────────────────── */}
          {popular.length > 0 && (
            <div className={`px-4 pt-2 pb-1 ${recent.length > 0 ? 'border-t border-[#f1f2f7] mt-1' : ''}`}>
              <span className="text-[10px] font-bold text-[#a0a3b1] uppercase tracking-wider">
                Popular right now
              </span>
            </div>
          )}
          {popular.map((c) => {
            index += 1;
            const i = index;
            return (
              <button
                key={c.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelectCategory(c.id, c.name)}
                onMouseEnter={() => setCursor(i)}
                className={rowCls(i)}
              >
                <TrendingUp className="w-4 h-4 text-[#a0a3b1] shrink-0" />
                <span className="text-sm text-[#0b1c30] truncate">{c.name}</span>
                {/* The count is the reason this row is worth tapping: it says
                    how much is waiting, so nothing here is a guess. */}
                <span className="ml-auto text-[11px] font-semibold text-[#a0a3b1] shrink-0">
                  {c.listingCount}
                </span>
              </button>
            );
          })}

          {/* Only when the catalogue could not be read at all. */}
          {starterTerms.length > 0 && (
            <div className="px-4 pt-2 pb-1">
              <span className="text-[10px] font-bold text-[#a0a3b1] uppercase tracking-wider">
                Try searching for
              </span>
            </div>
          )}
          {starterTerms.map((term) => {
            index += 1;
            const i = index;
            return (
              <button
                key={term}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSearch(term)}
                onMouseEnter={() => setCursor(i)}
                className={rowCls(i)}
              >
                <Search className="w-4 h-4 text-[#a0a3b1] shrink-0" />
                <span className="text-sm text-[#0b1c30] truncate">{term}</span>
              </button>
            );
          })}
        </>
      )}

      {/* ------------------------------------------------- typing: results */}
      {typing && (
        <>
          {(() => {
            index += 1;
            const i = index;
            return (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSearch(trimmed)}
                onMouseEnter={() => setCursor(i)}
                className={`${rowCls(i)} border-b border-[#f1f2f7]`}
              >
                <Search className="w-4 h-4 text-[#2563eb] shrink-0" />
                <span className="text-sm text-[#0b1c30] truncate">
                  Search for <span className="font-bold">{trimmed}</span>
                </span>
                {(loading || pending) && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#a0a3b1] ml-auto shrink-0" />
                )}
              </button>
            );
          })()}

          {listings.length > 0 && (
            <div className="px-4 pt-2 pb-1">
              <span className="text-[10px] font-bold text-[#a0a3b1] uppercase tracking-wider">
                Listings
              </span>
            </div>
          )}
          {listings.map((s) => {
            index += 1;
            const i = index;
            return (
              <button
                key={s.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelectListing(s.id)}
                onMouseEnter={() => setCursor(i)}
                className={rowCls(i)}
              >
                {s.image ? (
                  <ListingImage src={s.image} alt="" className="w-9 h-9 rounded-lg object-cover border border-[#e5eeff] shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-[#eff4ff] flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-4 h-4 text-[#b4c5ff]" />
                  </div>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[#0b1c30] truncate">{s.label}</span>
                  {s.detail && (
                    <span className="flex items-center gap-1 text-[11px] text-[#737686] mt-0.5">
                      {TYPE_ICON[s.detail]}
                      {s.detail.charAt(0) + s.detail.slice(1).toLowerCase()}
                    </span>
                  )}
                </span>
                {s.price != null && (
                  <span className="text-sm font-extrabold text-[#2563eb] shrink-0">
                    {formatPrice(Number(s.price))}
                  </span>
                )}
              </button>
            );
          })}

          {categories.length > 0 && (
            <div className="px-4 pt-2 pb-1 border-t border-[#f1f2f7] mt-1">
              <span className="text-[10px] font-bold text-[#a0a3b1] uppercase tracking-wider">
                Categories
              </span>
            </div>
          )}
          {categories.map((s) => {
            index += 1;
            const i = index;
            return (
              <button
                key={s.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelectCategory(s.id, s.label)}
                onMouseEnter={() => setCursor(i)}
                className={rowCls(i)}
              >
                <div className="w-9 h-9 rounded-lg bg-[#eff4ff] flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4 text-[#2563eb]" />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[#0b1c30] truncate">{s.label}</span>
                  <span className="block text-[11px] text-[#737686] mt-0.5">{s.detail}</span>
                </span>
              </button>
            );
          })}

          {/* Only claim "no matches" once a settled query has actually come
              back - saying it while still waiting is simply wrong. */}
          {!loading && !pending && listings.length === 0 && categories.length === 0 && (
            <p className="px-4 py-3 text-xs text-[#737686]">
              No matches yet — press Enter to search anyway.
            </p>
          )}
        </>
      )}
    </div>
  );
};
