import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, SlidersHorizontal, X, Heart, MapPin, Images, ChevronDown,
  ShoppingBag, Briefcase, Utensils, Loader2, ArrowLeft, Layers,
} from 'lucide-react';
import {
  AddToCart, AuthSession, Listing, ListingCategory, ListingCondition,
  SearchFilters, CampusZone, CAMPUS_ZONES,
} from '../types';
import { api } from '../services/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { PriceRangeSlider, DEFAULT_PRICE_CEILING, niceCeiling } from './search/PriceRangeSlider';
import { FilterPill } from './search/FilterPill';
import { formatPrice } from '../utils/currency';
import { Breadcrumbs, Crumb } from './shared/Breadcrumbs';

const PAGE_SIZE = 24;

const TYPE_PARAM: Record<string, string | undefined> = {
  All: undefined, Product: 'PRODUCT', Service: 'SERVICE', Food: 'FOOD',
};

const TYPE_STYLE: Record<ListingCategory, { chip: string; icon: React.ReactNode }> = {
  Product: { chip: 'chip-product', icon: <ShoppingBag className="w-3 h-3" /> },
  Service: { chip: 'chip-service', icon: <Briefcase className="w-3 h-3" /> },
  Food: { chip: 'chip-food', icon: <Utensils className="w-3 h-3" /> },
};

/*
 * "Best match" only exists when there is something to match against, so it is
 * offered - and defaulted to - only once a term has been typed. Sorting a bare
 * category browse by relevance would rank every row identically and quietly
 * mean "newest" anyway, which is a control that lies about what it did.
 */
const SORTS = [
  { value: 'relevance', label: 'Best match', needsQuery: true },
  { value: 'newest', label: 'Newest', needsQuery: false },
  { value: 'popular', label: 'Most popular', needsQuery: false },
  { value: 'price_asc', label: 'Price: Low to High', needsQuery: false },
  { value: 'price_desc', label: 'Price: High to Low', needsQuery: false },
] as const;

const CONDITIONS: ListingCondition[] = ['New', 'Like New', 'Good', 'Fair'];

const CONDITION_PARAM: Record<string, string> = {
  New: 'NEW', 'Like New': 'LIKE_NEW', Good: 'GOOD', Fair: 'FAIR',
};

interface CategoryOption {
  id: string;
  name: string;
  listingCount: number;
}

interface SearchScreenProps {
  filters: SearchFilters;
  onFiltersChange: (next: SearchFilters) => void;
  onSelectListing: (listing: Listing) => void;
  onToggleSave: (listingId: string, e: React.MouseEvent) => void;
  onBack: () => void;
  currentUser?: AuthSession;
  /** Quick add straight from a result card, as on the browse feed. */
  onAddToCart?: AddToCart;
  /** Kept in sync so hearts reflect saves made elsewhere. */
  listings: Listing[];
  /** Breadcrumb "Home". */
  onGoHome?: () => void;
}

/**
 * Dedicated search results.
 *
 * Separate from the browse feed on purpose: browse is for discovery and leads
 * with promos and categories, whereas someone who typed a query wants results
 * and the controls to narrow them. Every filter is mirrored into the URL, so a
 * result set can be shared or reloaded and come back the same.
 */
export const SearchScreen: React.FC<SearchScreenProps> = ({
  filters,
  onFiltersChange,
  onSelectListing,
  onToggleSave,
  onBack,
  currentUser,
  onAddToCart,
  listings,
  onGoHome,
}) => {
  const [results, setResults] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  /** Which card's quick-add is in flight, so only that button spins. */
  const [addingId, setAddingId] = useState<string | null>(null);

  /* Price is held as local text so a half-typed "1" doesn't immediately
     filter everything out; it is committed to the shared filters on blur. */
  const [minDraft, setMinDraft] = useState(filters.minPrice);
  const [maxDraft, setMaxDraft] = useState(filters.maxPrice);
  useEffect(() => { setMinDraft(filters.minPrice); }, [filters.minPrice]);
  useEffect(() => { setMaxDraft(filters.maxPrice); }, [filters.maxPrice]);

  useEffect(() => {
    api.categories.getAll().then((res) => {
      const list = (res.categories as CategoryOption[]) || [];
      setCategories(list.filter((c) => c.listingCount > 0));
    });
  }, []);

  /* The slider scale comes from the catalogue itself: one listing sorted by
     price descending is the cheapest way to ask "what is the most anything
     costs here". Deliberately not re-fetched per search - a scale that resized
     with every filter would move the thumbs under the person using them. */
  const [priceCeiling, setPriceCeiling] = useState(DEFAULT_PRICE_CEILING);
  useEffect(() => {
    api.listings.search({ sort: 'price_desc', size: 1 }).then((res) => {
      const dearest = res.listings[0]?.price ?? 0;
      setPriceCeiling(niceCeiling(dearest));
    });
  }, []);

  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    onFiltersChange({ ...filters, [key]: value });

  /* Both ends move together, so they go in one update: setting them via two
     calls to `set` would drop the first, since both start from `filters`. */
  const setPriceRange = (min: string, max: string) =>
    onFiltersChange({ ...filters, minPrice: min, maxPrice: max });

  /* One pill for the whole band. Removing it clears both ends: a range is a
     single thing to have second thoughts about, so leaving half of it applied
     would be a surprise. */
  const priceLabel =
    filters.minPrice && filters.maxPrice
      ? `${formatPrice(filters.minPrice)} – ${formatPrice(filters.maxPrice)}`
      : filters.minPrice
        ? `${formatPrice(filters.minPrice)}+`
        : filters.maxPrice
          ? `Under ${formatPrice(filters.maxPrice)}`
          : '';

  // Price counts once however it was set. A band is one decision to the person
  // who made it, whether they dragged the slider or typed both boxes.
  const activeCount =
    (filters.type !== 'All' ? 1 : 0) +
    (filters.categoryId ? 1 : 0) +
    (filters.campusZone ? 1 : 0) +
    (filters.condition ? 1 : 0) +
    (filters.minPrice || filters.maxPrice ? 1 : 0);

  const clearFilters = () =>
    onFiltersChange({
      ...filters, type: 'All', categoryId: '', campusZone: '',
      condition: '', minPrice: '', maxPrice: '',
    });

  /* ── Query ──────────────────────────────────────────────────────────── */
  /*
   * Searches run against the SETTLED filter set. Price is typed, so it would
   * otherwise fire per digit; the rest are clicks, which this also coalesces
   * when someone sets three filters in quick succession. Serialising the
   * filters means one dependency covers every field without listing them.
   */
  const settledFilters = useDebouncedValue(JSON.stringify(filters));
  const abortRef = useRef<AbortController | null>(null);

  /*
   * Clearing the query strands a "Best match" selection with nothing to match.
   * The server falls back to newest in that case, so the screen agrees with it
   * rather than labelling a date-ordered list "Best match".
   */
  const effectiveSort =
    filters.sort === 'relevance' && !filters.q.trim() ? 'newest' : filters.sort;

  const runSearch = useCallback(
    async (nextPage: number, append: boolean) => {
      // Cancel whatever is in flight: a superseded search should stop costing
      // the server the moment it is superseded, not merely be discarded.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (append) setLoadingMore(true);
      else setLoading(true);

      const res = await api.listings.search({
        search: filters.q.trim() || undefined,
        type: TYPE_PARAM[filters.type],
        categoryId: filters.categoryId || undefined,
        campusZone: filters.campusZone || undefined,
        condition: filters.condition ? CONDITION_PARAM[filters.condition] : undefined,
        minPrice: filters.minPrice || undefined,
        maxPrice: filters.maxPrice || undefined,
        sort: effectiveSort !== 'newest' ? effectiveSort : undefined,
        page: nextPage,
        size: PAGE_SIZE,
      }, controller.signal);

      // A cancelled request has no results to show and no error to report.
      if (res.aborted) return;

      setError(res.error || null);
      setResults((prev) => {
        if (!append) return res.listings;
        const seen = new Set(prev.map((l) => l.id));
        return [...prev, ...res.listings.filter((l) => !seen.has(l.id))];
      });
      setTotal(res.totalItems);
      setTotalPages(res.totalPages);
      setPage(nextPage);
      setLoading(false);
      setLoadingMore(false);
    },
    [filters],
  );

  useEffect(() => {
    runSearch(0, false);
    // Keyed on the settled snapshot, not `runSearch`, which changes identity
    // on every keystroke and would defeat the debounce entirely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledFilters]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* Keep hearts in sync with saves made on other screens. */
  useEffect(() => {
    setResults((prev) =>
      prev.map((r) => {
        const fresh = listings.find((l) => l.id === r.id);
        return fresh ? { ...r, isSaved: fresh.isSaved } : r;
      }),
    );
  }, [listings]);

  const hasMore = page + 1 < totalPages;

  /* ── Filter controls, shared by the sidebar and the mobile drawer ────── */
  const filterPanel = (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold text-[#a0a3b1] uppercase tracking-wider mb-2">Type</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(['All', 'Product', 'Service', 'Food'] as const).map((t) => (
            <button
              key={t}
              onClick={() => set('type', t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                filters.type === t
                  ? 'bg-[#0b1c30] text-white border-[#0b1c30]'
                  : 'bg-white text-[#434655] border-[#c3c6d7] hover:border-[#737686]'
              }`}
            >
              {t === 'All' ? 'Anything' : t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold text-[#a0a3b1] uppercase tracking-wider mb-2">Price</p>
        <PriceRangeSlider
          min={filters.minPrice}
          max={filters.maxPrice}
          ceiling={priceCeiling}
          onCommit={setPriceRange}
        />
        {/* The boxes stay: a slider is quick but imprecise, and someone with a
            hard K60 budget should not have to hunt for it a step at a time. */}
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={minDraft}
            onChange={(e) => setMinDraft(e.target.value)}
            onBlur={() => set('minPrice', minDraft)}
            onKeyDown={(e) => e.key === 'Enter' && set('minPrice', minDraft)}
            placeholder="Min"
            className="input-base text-sm !py-2"
          />
          <span className="text-[#a0a3b1] text-sm shrink-0">–</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={maxDraft}
            onChange={(e) => setMaxDraft(e.target.value)}
            onBlur={() => set('maxPrice', maxDraft)}
            onKeyDown={(e) => e.key === 'Enter' && set('maxPrice', maxDraft)}
            placeholder="Max"
            className="input-base text-sm !py-2"
          />
        </div>
      </div>

      {/* Condition only applies to products, so it disappears rather than
          sitting there greyed out when the type filter rules it out. */}
      {(filters.type === 'All' || filters.type === 'Product') && (
        <div>
          <p className="text-[11px] font-bold text-[#a0a3b1] uppercase tracking-wider mb-2">
            Condition
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CONDITIONS.map((c) => (
              <button
                key={c}
                onClick={() => set('condition', filters.condition === c ? '' : c)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  filters.condition === c
                    ? 'bg-[#2563eb] text-white border-[#2563eb]'
                    : 'bg-white text-[#737686] border-[#c3c6d7] hover:border-[#737686]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] font-bold text-[#a0a3b1] uppercase tracking-wider mb-2">
          Campus zone
        </p>
        <div className="space-y-1.5">
          {CAMPUS_ZONES.map((z) => (
            <button
              key={z.value}
              onClick={() => set('campusZone', filters.campusZone === z.value ? '' : z.value)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                filters.campusZone === z.value
                  ? 'bg-[#eff4ff] border-[#2563eb] text-[#2563eb]'
                  : 'bg-white border-[#c3c6d7] text-[#434655] hover:border-[#737686]'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-semibold">{z.label}</span>
            </button>
          ))}
        </div>
      </div>

      {categories.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-[#a0a3b1] uppercase tracking-wider mb-2">
            Category
          </p>
          <div className="space-y-0.5 max-h-64 overflow-y-auto pr-1">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => set('categoryId', filters.categoryId === c.id ? '' : c.id)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                  filters.categoryId === c.id
                    ? 'bg-[#eff4ff] text-[#2563eb]'
                    : 'text-[#434655] hover:bg-[#f8f9ff]'
                }`}
              >
                <span className="text-xs font-medium truncate">{c.name}</span>
                <span className="text-[10px] font-bold text-[#737686] shrink-0">
                  {c.listingCount}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ── Result card ────────────────────────────────────────────────────── */
  /*
   * Same rule as the browse grid: goods that are actually for sale, and not
   * the viewer's own. A service is arranged with its seller rather than added
   * to a cart, so it keeps the plain card.
   */
  const canQuickAdd = (item: Listing) =>
    !!onAddToCart
    && item.category !== 'Service'
    && item.badgeText !== 'Sold'
    && item.badgeText !== 'Reserved'
    && currentUser?.role !== 'admin'
    && item.seller?.id !== currentUser?.id;

  const quickAdd = async (item: Listing, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onAddToCart) return;
    setAddingId(item.id);
    await onAddToCart(item, { event: e });
    setAddingId(null);
  };

  const renderCard = (item: Listing) => {
    const unavailable = item.badgeText === 'Sold' || item.badgeText === 'Reserved';
    return (
      <article
        key={item.id}
        onClick={() => onSelectListing(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectListing(item);
          }
        }}
        className="animate-card-in group bg-white rounded-2xl shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col cursor-pointer border border-[#e5eeff]/80 hover:border-[#b4c5ff]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2"
      >
        <div className="relative aspect-[4/3] w-full bg-[#e5eeff] overflow-hidden">
          <img
            src={item.image}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute top-2.5 left-2.5">
            <span className={TYPE_STYLE[item.category].chip}>
              {TYPE_STYLE[item.category].icon}
              {item.category}
            </span>
          </div>
          <button
            onClick={(e) => onToggleSave(item.id, e)}
            aria-label={item.isSaved ? 'Remove from saved' : 'Save listing'}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-[#434655] hover:text-red-500 flex items-center justify-center shadow-card transition-all duration-150"
          >
            <Heart className={`w-4 h-4 transition-all ${item.isSaved ? 'fill-red-500 text-red-500' : ''}`} />
          </button>
          {item.gallery && item.gallery.length > 1 && (
            <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#0b1c30]/60 backdrop-blur-sm">
              <Images className="w-3 h-3 text-white" />
              <span className="text-[10px] font-bold text-white">{item.gallery.length}</span>
            </div>
          )}
          {unavailable && (
            <div className="absolute inset-x-0 bottom-0 bg-[#0b1c30]/75 backdrop-blur-[2px] py-1.5">
              <span className="block text-center text-[11px] font-bold text-white uppercase tracking-widest">
                {item.badgeText}
              </span>
            </div>
          )}
        </div>
        <div className="p-3.5 flex-1 flex flex-col">
          <h3 className="font-medium text-[#0b1c30] text-sm truncate group-hover:text-[#2563eb] transition-colors duration-150">
            {item.title}
          </h3>
          <div className="text-[#2563eb] font-extrabold text-lg sm:text-xl mt-0.5 tracking-tight">
            {formatPrice(item.price)}
            {item.priceUnit && (
              <span className="text-xs font-semibold text-[#737686] ml-0.5">{item.priceUnit}</span>
            )}
          </div>
          <div className="mt-auto pt-2.5 flex items-center gap-1.5 text-[11px] text-[#737686] font-medium min-w-0">
            <MapPin className="w-3.5 h-3.5 text-[#b4c5ff] shrink-0" />
            <span className="truncate">{item.location}</span>
          </div>

          {canQuickAdd(item) && (
            <button
              onClick={(e) => quickAdd(item, e)}
              disabled={addingId === item.id}
              aria-label={`Add ${item.title} to cart`}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#eff4ff] hover:bg-[#2563eb] text-[#2563eb] hover:text-white text-[11px] font-bold transition-colors disabled:opacity-60 disabled:hover:bg-[#eff4ff] disabled:hover:text-[#2563eb]"
            >
              {addingId === item.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ShoppingBag className="w-3.5 h-3.5" />}
              Add to cart
            </button>
          )}
        </div>
      </article>
    );
  };

  const visibleSorts = SORTS.filter((s) => !s.needsQuery || filters.q.trim());
  const activeSortLabel = SORTS.find((s) => s.value === effectiveSort)?.label ?? 'Newest';

  /*
   * Home › Category, or Home › "term". Category wins when both are set: it is
   * the durable place, whereas the term is this particular question. The final
   * crumb restates what the results are - so a page reached by tapping a
   * category chip still says which category it landed in.
   */
  const crumbs: Crumb[] = [{ label: 'Home', onClick: onGoHome }];
  const activeCategoryName = filters.categoryId
    ? categories.find((c) => c.id === filters.categoryId)?.name
    : undefined;
  if (activeCategoryName) {
    crumbs.push({ label: activeCategoryName });
  } else if (filters.q.trim()) {
    crumbs.push({ label: `“${filters.q.trim()}”` });
  } else {
    crumbs.push({ label: 'All listings' });
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff] pb-28">
      {/* Header: what was searched for, and how many results */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#c3c6d7]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Breadcrumbs items={crumbs} className="mb-2" />
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-2 rounded-full hover:bg-[#eff4ff] text-[#434655] hover:text-[#2563eb] transition-colors shrink-0"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              {/* Reaching this page by tapping a category used to head it
                  "Browse all listings", which is the one thing it is not. */}
              <h1 className="text-lg font-bold text-[#0b1c30] truncate">
                {filters.q
                  ? <>Results for “{filters.q}”</>
                  : activeCategoryName || 'Browse all listings'}
              </h1>
              <p className="text-xs text-[#737686] mt-0.5">
                {loading ? 'Searching…' : `${total} listing${total !== 1 ? 's' : ''}`}
                {activeCount > 0 && ` · ${activeCount} filter${activeCount !== 1 ? 's' : ''}`}
              </p>
            </div>

            {/* Mobile filter trigger; the sidebar covers desktop. */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden shrink-0 relative flex items-center gap-1.5 h-9 px-3 rounded-full border border-[#c3c6d7] bg-white text-[#434655] text-xs font-semibold"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {activeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#2563eb] text-white text-[9px] font-bold flex items-center justify-center">
                  {activeCount}
                </span>
              )}
            </button>

            <div className="relative shrink-0">
              <button
                onClick={() => setSortOpen((o) => !o)}
                className="flex items-center gap-1.5 h-9 px-3 rounded-full border border-[#c3c6d7] bg-white text-[#434655] text-xs font-semibold hover:bg-[#eff4ff]"
              >
                <span className="hidden sm:inline">{activeSortLabel}</span>
                <span className="sm:hidden">Sort</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 mt-1.5 z-20 w-52 bg-white rounded-2xl border border-[#e5eeff] shadow-modal overflow-hidden py-1">
                    {visibleSorts.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => { set('sort', s.value); setSortOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-semibold transition-colors ${
                          effectiveSort === s.value
                            ? 'bg-[#eff4ff] text-[#2563eb]'
                            : 'text-[#434655] hover:bg-[#f8f9ff]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Applied filters, each individually removable. */}
          {activeCount > 0 && (
            <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar">
              {filters.type !== 'All' && (
                <FilterPill label={filters.type} onRemove={() => set('type', 'All')} />
              )}
              {filters.condition && (
                <FilterPill label={filters.condition} onRemove={() => set('condition', '')} />
              )}
              {filters.campusZone && (
                <FilterPill
                  label={CAMPUS_ZONES.find((z) => z.value === filters.campusZone)?.label || ''}
                  onRemove={() => set('campusZone', '')}
                />
              )}
              {filters.categoryId && (
                <FilterPill
                  label={categories.find((c) => c.id === filters.categoryId)?.name || 'Category'}
                  onRemove={() => set('categoryId', '')}
                />
              )}
              {priceLabel && (
                <FilterPill label={priceLabel} onRemove={() => setPriceRange('', '')} />
              )}
              <button
                onClick={clearFilters}
                className="shrink-0 text-[11px] font-bold text-[#2563eb] hover:text-[#004ac6] px-2"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex gap-6">
        {/* Desktop filter sidebar */}
        <aside className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-28 bg-white rounded-2xl border border-[#e5eeff] shadow-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#0b1c30]">Filters</h2>
              {activeCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-[11px] font-bold text-[#2563eb] hover:text-[#004ac6]"
                >
                  Clear
                </button>
              )}
            </div>
            {filterPanel}
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700 font-semibold">
              {error}
            </div>
          )}

          {loading ? (
            <SkeletonGrid count={8} />
          ) : results.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl shadow-card border border-[#e5eeff]">
              <div className="w-16 h-16 bg-[#eff4ff] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-[#2563eb]" />
              </div>
              <h3 className="text-lg font-bold text-[#0b1c30]">
                {filters.q ? <>Nothing matched “{filters.q}”</> : 'No listings match those filters'}
              </h3>
              <p className="text-sm text-[#737686] mt-1.5 max-w-sm mx-auto">
                {activeCount > 0
                  ? 'Try removing a filter, or search for something broader.'
                  : 'Try a different spelling, or a broader term.'}
              </p>
              {activeCount > 0 && (
                <button onClick={clearFilters} className="btn-primary !h-10 !px-5 !text-xs mt-5 !rounded-lg mx-auto">
                  Clear filters
                </button>
              )}

              {/* A dead end is where people leave. On a catalogue this small the
                  thing they searched for often genuinely is not here yet, so the
                  useful move is to show what IS - by category, with counts, so
                  nothing offered leads to another empty page. */}
              {categories.length > 0 && (
                <div className="mt-8 pt-6 border-t border-[#eff4ff] max-w-md mx-auto">
                  <p className="text-xs font-bold text-[#a0a3b1] uppercase tracking-wider mb-3">
                    Browse what's here instead
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {categories.slice(0, 6).map((c) => (
                      <button
                        key={c.id}
                        onClick={() =>
                          onFiltersChange({
                            ...filters, q: '', categoryId: c.id, type: 'All',
                            condition: '', minPrice: '', maxPrice: '',
                          })
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#c3c6d7] text-xs font-semibold text-[#434655] hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
                      >
                        {c.name}
                        <span className="text-[10px] font-bold text-[#a0a3b1]">{c.listingCount}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      onFiltersChange({
                        ...filters, q: '', categoryId: '', type: 'All',
                        campusZone: '', condition: '', minPrice: '', maxPrice: '',
                      })
                    }
                    className="mt-4 text-xs font-bold text-[#2563eb] hover:text-[#004ac6]"
                  >
                    See every listing
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
                {results.map(renderCard)}
              </div>

              {hasMore && (
                <div className="flex justify-center py-8">
                  <button
                    onClick={() => runSearch(page + 1, true)}
                    disabled={loadingMore}
                    className="px-5 py-2.5 rounded-full border border-[#c3c6d7] bg-white hover:bg-[#eff4ff] text-[#434655] text-xs font-semibold shadow-card transition-colors flex items-center gap-2 disabled:opacity-60"
                  >
                    {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Load more
                  </button>
                </div>
              )}
              {!hasMore && results.length >= PAGE_SIZE && (
                <p className="text-center text-xs text-[#737686] py-8">That's every match.</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          <div
            className="absolute inset-0 bg-[#213145]/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-full bg-white rounded-t-3xl max-h-[85vh] flex flex-col animate-slide-up">
            <div className="flex items-center justify-between p-5 pb-3 border-b border-[#e5eeff]">
              <h2 className="text-lg font-bold text-[#0b1c30]">Filters</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close filters"
                className="p-2 -mr-2 rounded-full text-[#737686] hover:bg-[#f8f9ff]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">{filterPanel}</div>
            <div className="p-5 pt-3 border-t border-[#e5eeff] grid grid-cols-2 gap-3">
              <button onClick={clearFilters} className="btn-ghost !rounded-xl !text-sm">
                Clear all
              </button>
              <button
                onClick={() => setDrawerOpen(false)}
                className="btn-primary !rounded-xl !text-sm"
              >
                Show {total} result{total !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SkeletonGrid: React.FC<{ count: number }> = ({ count }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-white rounded-2xl border border-[#e5eeff]/80 overflow-hidden animate-pulse">
        <div className="aspect-[4/3] bg-[#e5eeff]" />
        <div className="p-3.5 space-y-2">
          <div className="h-3 bg-[#e5eeff] rounded w-3/4" />
          <div className="h-5 bg-[#dce9ff] rounded w-1/3" />
          <div className="h-2.5 bg-[#eff4ff] rounded w-2/3 mt-3" />
        </div>
      </div>
    ))}
  </div>
);
