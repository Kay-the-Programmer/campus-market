import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Heart, ShoppingBag, Briefcase, Utensils, MapPin, Sparkles, X,
  ArrowUpDown, Images, ShieldCheck, Layers, Loader2, Tag,
  ChevronLeft, ChevronRight, ChevronDown, Pause, Play, SlidersHorizontal,
  Check,
} from 'lucide-react';
import {
  AddToCart, AuthSession, CampusZone, CAMPUS_ZONES, Listing, ListingCategory,
  PromoSlot, PROMO_THEME_GRADIENT, PROMO_THEME_TILE, zoneLabel,
} from '../types';
import { api } from '../services/api';
import { getRecentlyViewed } from '../services/recentlyViewed';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatPrice } from '../utils/currency';
import { SpecialOffers } from './browse/SpecialOffers';
import { PriceRangeSlider, DEFAULT_PRICE_CEILING, niceCeiling } from './search/PriceRangeSlider';
import { FilterPill } from './search/FilterPill';
import { ListingImage } from './shared/ListingImage';

interface BrowseScreenProps {
  listings: Listing[];
  onSelectListing: (listing: Listing) => void;
  onToggleSave: (listingId: string, e: React.MouseEvent) => void;
  onNavigateToSell: () => void;
  /** Used by the Special Offers shelf, which buys in one tap. The rest of the
   *  feed still routes through the listing detail. */
  onAddToCart?: AddToCart;
  /** Opens the chat thread for a listing - the shelf's "ask about it" action. */
  onOpenChat?: (listing: Listing, conversationId?: string) => void;
  currentUser?: AuthSession;

  /*
   * Search and category filters are owned by App because the nav's search box
   * and category strip drive the same values. The feed renders them below lg,
   * where the nav has no room for a category row.
   */
  searchQuery: string;
  onSearchChange: (value: string) => void;
  feedType: CoreType;
  onFeedTypeChange: (type: CoreType) => void;
  categoryId: string;
  onCategoryChange: (id: string) => void;
}

const PAGE_SIZE = 24;

/**
 * The single promo slot. Set to `null` to remove the banner entirely - the
 * design calls for omitting the section when there is nothing real to say,
 * rather than filling it with generic content.
 */
const HOME_PROMO: { id: string; title: string; body: string } | null = {
  // Bumping the id re-shows the banner to everyone who dismissed the old one.
  id: 'safety-2026-08',
  title: 'Meet safely on campus',
  body: 'Trade in busy, public spots like the Student Center and keep payment until you have the item in hand.',
};

/*
 * Carousel slides and "Special offers" tiles are admin-editable and come from
 * GET /api/promos. These constants are the fallback used only when that call
 * fails - the home page is the first thing a visitor sees, and rendering it
 * empty because one request timed out would be worse than showing last known
 * good copy. They mirror what the V5 migration seeds.
 */
const FALLBACK_PROMOS: PromoSlot[] = [
  {
    id: 'fallback-welcome', placement: 'CAROUSEL', theme: 'BLUE', wide: false,
    active: true, sortOrder: 0, imageOverlay: 40,
    title: 'Welcome to Campus Market',
    subtitle: 'Buy, sell & trade with students you can actually meet.',
    ctaLabel: 'Explore listings', ctaLink: '/browse',
  },
  {
    id: 'fallback-fees', placement: 'CAROUSEL', theme: 'GREEN', wide: false,
    active: true, sortOrder: 1, imageOverlay: 40,
    title: 'Zero platform fees',
    subtitle: 'Keep 100% of your sale. We only connect you — you trade in person.',
    ctaLabel: 'Start selling', ctaLink: '/sell',
  },
  {
    id: 'fallback-services', placement: 'CAROUSEL', theme: 'DARK', wide: false,
    active: true, sortOrder: 2, imageOverlay: 40,
    title: 'Need a tutor or a ride?',
    subtitle: 'Services from students, for students. No awkward Venmo guessing.',
    ctaLabel: 'Find services', ctaLink: '/browse?type=Service',
  },
  {
    id: 'fallback-new', placement: 'BENTO', theme: 'GREEN', wide: false,
    active: true, sortOrder: 0, imageOverlay: 40,
    title: 'Just Listed', subtitle: 'Fresh drops in the last 24h.',
    badge: 'New', ctaLink: '/browse',
  },
  {
    id: 'fallback-tutors', placement: 'BENTO', theme: 'PURPLE', wide: false,
    active: true, sortOrder: 1, imageOverlay: 40,
    title: 'Student Services', subtitle: 'Tutors, movers, designers.',
    ctaLink: '/browse?type=Service',
  },
  {
    id: 'fallback-food', placement: 'BENTO', theme: 'AMBER', wide: true,
    active: true, sortOrder: 2, imageOverlay: 40,
    title: 'Meal Deals', subtitle: 'Home-cooked & campus food near you.',
    badge: 'Hot', ctaLink: '/browse?type=Food',
  },
];

/** Tile icon, chosen from the link so admins never have to pick one. */
const iconForLink = (link?: string): React.ReactNode => {
  if (!link) return <Sparkles className="w-6 h-6" />;
  if (link.includes('type=Service')) return <Briefcase className="w-6 h-6" />;
  if (link.includes('type=Food')) return <Utensils className="w-6 h-6" />;
  if (link.startsWith('/sell')) return <Tag className="w-6 h-6" />;
  return <ShoppingBag className="w-6 h-6" />;
};

/*
 * "Best match" needs a term to be relevant to, so it is offered only while the
 * feed is being searched. It is also what an untouched sort becomes the moment
 * someone types - see `effectiveSort` below.
 */
const SORTS = [
  { value: 'relevance', label: 'Best match', needsQuery: true },
  { value: 'newest', label: 'Newest', needsQuery: false },
  { value: 'popular', label: 'Most popular', needsQuery: false },
  { value: 'price_asc', label: 'Price: Low to High', needsQuery: false },
  { value: 'price_desc', label: 'Price: High to Low', needsQuery: false },
] as const;

type CoreType = 'All' | 'Product' | 'Service' | 'Food';

const TYPE_PARAM: Record<CoreType, string | undefined> = {
  All: undefined,
  Product: 'PRODUCT',
  Service: 'SERVICE',
  Food: 'FOOD',
};

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  listingCount: number;
}

/** Read the opening filter state out of the URL so a shared link reproduces it. */
function readUrlFilters() {
  const p = new URLSearchParams(window.location.search);
  const type = p.get('type');
  const zone = p.get('campusZone') || '';
  return {
    q: p.get('q') || '',
    coreType: (['Product', 'Service', 'Food'].includes(type || '') ? type : 'All') as CoreType,
    categoryId: p.get('categoryId') || '',
    sort: p.get('sort') || 'newest',
    // Distinguishes "the link said newest" from "nobody has chosen yet".
    sortParam: p.get('sort'),
    campusZone: (CAMPUS_ZONES.some((z) => z.value === zone) ? zone : '') as CampusZone | '',
    // Price was the one filter the URL did not carry, so a link to "phones
    // under K200" came back as every phone. It is a filter like any other.
    minPrice: p.get('minPrice') || '',
    maxPrice: p.get('maxPrice') || '',
  };
}

/* ── Per-type visual language, shared by chips and cards ───────────────── */
const TYPE_STYLE: Record<ListingCategory, { chip: string; solid: string; icon: React.ReactNode }> = {
  Product: {
    chip: 'chip-product',
    solid: 'bg-[#2563eb] text-white border-[#2563eb]',
    icon: <ShoppingBag className="w-3 h-3" />,
  },
  Service: {
    chip: 'chip-service',
    solid: 'bg-[#8455ef] text-white border-[#8455ef]',
    icon: <Briefcase className="w-3 h-3" />,
  },
  Food: {
    chip: 'chip-food',
    solid: 'bg-[#007d55] text-white border-[#007d55]',
    icon: <Utensils className="w-3 h-3" />,
  },
};

/** Core type tabs are static - built once rather than reallocated every render. */
const CORE_ITEMS: { key: string; label: string; icon: React.ReactNode; type?: ListingCategory }[] = [
  { key: 'all', label: 'All', icon: <Layers className="w-3.5 h-3.5" /> },
  { key: 'product', label: 'Products', icon: TYPE_STYLE.Product.icon, type: 'Product' },
  { key: 'service', label: 'Services', icon: TYPE_STYLE.Service.icon, type: 'Service' },
  { key: 'food', label: 'Food', icon: TYPE_STYLE.Food.icon, type: 'Food' },
];

/**
 * The one contextual detail shown under the price, chosen by listing type.
 * Returns null when the listing simply doesn't carry that information rather
 * than inventing a placeholder.
 */
function contextualDetail(item: Listing): string | null {
  if (item.category === 'Product') {
    return item.condition && item.condition !== 'N/A' ? item.condition : null;
  }
  if (item.category === 'Service') {
    // How you get it beats when they're free: "Walk in" tells someone they can
    // act on this right now, which is what makes them tap. The hours are on
    // the listing itself, one tap away.
    if (item.serviceMode === 'WALK_IN') {
      return item.availability?.trim()
        ? `Walk in · ${item.availability.trim()}`
        : 'Walk in - no booking';
    }
    return item.availability?.trim() || null;
  }
  return item.pickupWindow?.trim() || null;
}

export const BrowseScreen: React.FC<BrowseScreenProps> = ({
  listings,
  onSelectListing,
  onToggleSave,
  onNavigateToSell,
  onAddToCart,
  onOpenChat,
  currentUser,
  searchQuery,
  onSearchChange,
  feedType: coreType,
  onFeedTypeChange: setCoreType,
  categoryId,
  onCategoryChange: setCategoryId,
}) => {
  // Sort stays local - it's a property of the feed, not of the navigation.
  const [sort, setSort] = useState(readUrlFilters().sort);
  const [sortOpen, setSortOpen] = useState(false);
  /* Whether the sort showing is a choice or just the default. A link that
     carried one counts as a choice; nothing else has been picked yet. */
  const [sortTouched, setSortTouched] = useState(() => !!readUrlFilters().sortParam);
  // Zone is a feed filter too. Empty means "anywhere", which stays the default:
  // opening the app pre-filtered to one zone would silently hide most of it.
  const [zone, setZone] = useState<CampusZone | ''>(readUrlFilters().campusZone);

  /* Price lives here as strings for the same reason the search screen holds it
     that way: '' means "no bound", which 0 cannot express. */
  const [minPrice, setMinPrice] = useState(readUrlFilters().minPrice);
  const [maxPrice, setMaxPrice] = useState(readUrlFilters().maxPrice);
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceCeiling, setPriceCeiling] = useState(DEFAULT_PRICE_CEILING);
  const priceMenuRef = useRef<HTMLDivElement>(null);
  /** Top of the result count + grid, so a filter change can scroll back to it. */
  const resultsRef = useRef<HTMLDivElement>(null);

  /* Scale comes from the catalogue's dearest listing so the thumbs span what
     actually exists. Fetched once - a scale that moved with every filter would
     shift the handles under the person dragging them. */
  useEffect(() => {
    api.listings.search({ sort: 'price_desc', size: 1 }).then((res) => {
      const dearest = res.listings[0]?.price ?? 0;
      setPriceCeiling(niceCeiling(dearest));
    });
  }, []);

  /* Click-away, so the panel behaves like the sort menu next to it. */
  useEffect(() => {
    if (!priceOpen) return;
    const onDown = (e: MouseEvent) => {
      if (priceMenuRef.current && !priceMenuRef.current.contains(e.target as Node)) {
        setPriceOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [priceOpen]);

  const priceButtonLabel =
    minPrice && maxPrice ? `${formatPrice(minPrice)} – ${formatPrice(maxPrice)}`
      : minPrice ? `${formatPrice(minPrice)}+`
        : maxPrice ? `Under ${formatPrice(maxPrice)}`
          : 'Any price';

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [results, setResults] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Which card's quick-add is in flight, so only that button shows a spinner. */
  const [addingId, setAddingId] = useState<string | null>(null);
  /** Which card's quick-add just succeeded, so it can flash a confirmation. */
  const [addedId, setAddedId] = useState<string | null>(null);

  const [promoDismissed, setPromoDismissed] = useState(
    () => !HOME_PROMO || sessionStorage.getItem(`cm_promo_dismissed:${HOME_PROMO.id}`) === '1',
  );
  const [recent, setRecent] = useState<Listing[]>([]);

  const isGuest = !currentUser || currentUser.role === 'guest';

  /** Skip transitions/autoplay for anyone who has asked the OS to reduce motion. */
  const prefersReducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  /* ── Admin-editable home-page panels ──────────────────────────────────── */
  const [promos, setPromos] = useState<PromoSlot[]>(FALLBACK_PROMOS);

  useEffect(() => {
    api.promos.getActive().then((res) => {
      // Only replace the fallback on a real answer. An empty array is a real
      // answer - an admin who hid every panel meant to hide every panel.
      if (!res.error && Array.isArray(res.promos)) {
        setPromos(res.promos);
      }
    });
  }, []);

  const carouselSlides = useMemo(
    () => promos.filter((p) => p.placement === 'CAROUSEL').sort((a, b) => a.sortOrder - b.sortOrder),
    [promos],
  );
  const bentoItems = useMemo(
    () => promos.filter((p) => p.placement === 'BENTO').sort((a, b) => a.sortOrder - b.sortOrder),
    [promos],
  );

  /* ── Carousel State ───────────────────────────────────────────────────── */
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false); // Hover state
  const [userPaused, setUserPaused] = useState(false);         // Explicit toggle state
  const carouselRef = useRef<HTMLDivElement>(null);
  // Full touch gesture state (position + time), so a slow drag or a mostly
  // vertical scroll over the banner never gets misread as a swipe.
  const carouselTouch = useRef<{ x: number; y: number; time: number } | null>(null);
  const AUTOPLAY_MS = 5000;

  /* ── Category strip scroll state (mobile) ─────────────────────────────── */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ canLeft: false, canRight: false });
  const [headerScrolled, setHeaderScrolled] = useState(false);

  /* ── Categories strip state (desktop) ─────────────────────────────── */
  // The mega menu has been replaced by a simple horizontal strip.

  useEffect(() => {
    api.categories.getAll().then((res) => {
      const list = (res.categories as CategoryOption[]) || [];
      // Only surface categories that actually have something in them - an empty
      // chip is a dead end.
      setCategories(list.filter((c) => c.listingCount > 0));
    });
  }, []);

  /* ── "Continue browsing": literally the listings this user opened ──────── */
  useEffect(() => {
    if (isGuest || !currentUser) {
      setRecent([]);
      return;
    }
    const ids = getRecentlyViewed(currentUser.id);
    if (ids.length === 0) {
      setRecent([]);
      return;
    }
    let cancelled = false;
    Promise.all(ids.slice(0, 10).map((id) => api.listings.getById(id))).then((res) => {
      if (cancelled) return;
      // Silently drop anything since removed or sold out from under them.
      setRecent(res.map((r) => r.listing).filter((l): l is Listing => !!l));
    });
    return () => { cancelled = true; };
  }, [currentUser?.id, isGuest]);

  /* ── Carousel Auto-play ───────────────────────────────────────────────── */
  // `setCarouselIndex` uses a functional update, so the tick itself doesn't
  // need `carouselIndex` in the dependency list - keeping it there was
  // tearing the interval down and rebuilding it on every single advance.
  useEffect(() => {
    if (carouselPaused || userPaused || prefersReducedMotion || carouselSlides.length < 2) return;
    const timer = setInterval(() => {
      setCarouselIndex((i) => (i + 1) % carouselSlides.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carouselPaused, userPaused, prefersReducedMotion, carouselSlides.length]);

  // An admin deleting slides can leave the index past the end.
  useEffect(() => {
    if (carouselIndex >= carouselSlides.length) setCarouselIndex(0);
  }, [carouselSlides.length, carouselIndex]);

  /* ── Scroll detection for category strip arrows & header shadow ─────── */
  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const canLeft = el.scrollLeft > 4;
    const canRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
    setScrollState({ canLeft, canRight });
  }, []);

  const scrollBy = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -220 : 220, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    return () => el.removeEventListener('scroll', checkScroll);
  }, [categories.length, checkScroll]);

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /*
   * The sort actually applied, as opposed to the one held in state.
   *
   * Typing into the feed's search box turns it into a query, and a query wants
   * its best answers first - so an untouched "Newest" becomes "Best match"
   * rather than leading with whatever was posted most recently and happens to
   * contain the word. Clearing the box hands it back, since relevance to
   * nothing is just newest wearing a different label. An explicit choice is
   * never overridden either way.
   */
  const effectiveSort = (() => {
    if (!searchQuery.trim()) return sort === 'relevance' ? 'newest' : sort;
    if (!sortTouched && sort === 'newest') return 'relevance';
    return sort;
  })();

  /* ── Query the feed. Filtering, sorting and paging are all server-side ── */
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const runSearch = useCallback(
    async (nextPage: number, append: boolean) => {
      const mine = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);

      // Cancel any in-flight query so a superseded one stops costing the
      // server, rather than completing only to be thrown away.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await api.listings.search({
        search: searchQuery.trim() || undefined,
        type: TYPE_PARAM[coreType],
        categoryId: categoryId || undefined,
        campusZone: zone || undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        sort: effectiveSort !== 'newest' ? effectiveSort : undefined,
        page: nextPage,
        size: PAGE_SIZE,
      }, controller.signal);

      // A cancelled request has nothing to render and no error to report.
      if (res.aborted) return;
      // Belt and braces for any response that still arrives out of order.
      if (mine !== requestId.current) return;

      setError(res.error || null);
      setResults((prev) => {
        if (!append) return res.listings;
        // Guard against a duplicate id slipping in if rows shift between pages.
        const seen = new Set(prev.map((l) => l.id));
        return [...prev, ...res.listings.filter((l) => !seen.has(l.id))];
      });
      setTotal(res.totalItems);
      setTotalPages(res.totalPages);
      setPage(nextPage);
      setLoading(false);
      setLoadingMore(false);
    },
    [searchQuery, coreType, categoryId, zone, effectiveSort, minPrice, maxPrice],
  );

  /*
   * The feed re-queries only once typing has settled. The nav search box
   * writes here on every keystroke, so without this a ten-character query
   * costs ten requests; with it, one.
   */
  const settledFeed = useDebouncedValue(
    JSON.stringify({
      q: searchQuery.trim(), coreType, categoryId, zone,
      sort: effectiveSort, minPrice, maxPrice,
    }),
  );

  useEffect(() => {
    runSearch(0, false);

    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (coreType !== 'All') params.set('type', coreType);
    if (categoryId) params.set('categoryId', categoryId);
    if (zone) params.set('campusZone', zone);
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);
    if (effectiveSort !== 'newest') params.set('sort', effectiveSort);
    const qs = params.toString();
    window.history.replaceState({}, '', qs ? `/browse?${qs}` : '/browse');
    // Keyed on the settled snapshot only - `runSearch` changes identity on
    // every keystroke and would defeat the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledFeed]);

  /*
   * A new filter is a new set of results, and they start at the top.
   *
   * Infinite scroll makes this matter: after loading four pages you are
   * thousands of pixels down, and picking a category there replaced the grid
   * underneath you while leaving you deep in a page that is now much shorter -
   * often past its end, staring at the footer. Skipped on the first run, which
   * is a page load rather than a change of mind.
   */
  const firstFeedRender = useRef(true);
  useEffect(() => {
    if (firstFeedRender.current) {
      firstFeedRender.current = false;
      return;
    }
    const el = resultsRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 120;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }, [settledFeed]);

  /* ── Infinite scroll ──────────────────────────────────────────────────── */
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = page + 1 < totalPages;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) runSearch(page + 1, true);
      },
      // Start fetching before the user actually hits the bottom.
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, page, runSearch]);

  /* Keep saved-heart state in sync when the parent reconciles a save toggle. */
  useEffect(() => {
    setResults((prev) =>
      prev.map((r) => {
        const fresh = listings.find((l) => l.id === r.id);
        return fresh ? { ...r, isSaved: fresh.isSaved } : r;
      }),
    );
  }, [listings]);

  const dismissPromo = () => {
    if (HOME_PROMO) sessionStorage.setItem(`cm_promo_dismissed:${HOME_PROMO.id}`, '1');
    setPromoDismissed(true);
  };

  /* Every filter, including the price band, which "Clear" used to leave
     applied - so clearing appeared to do nothing on a feed narrowed by price. */
  const resetToHome = () => {
    onSearchChange('');
    setCoreType('All');
    setCategoryId('');
    setZone('');
    setMinPrice('');
    setMaxPrice('');
    setSort('newest');
    // Back to a feed nobody has expressed a preference about.
    setSortTouched(false);
  };

  /**
   * Drop every narrowing filter except one chosen category.
   *
   * The way out of an empty feed: rather than clearing to everything and
   * leaving someone to find their way back in, this lands them somewhere that
   * is known to have listings in it. Sort is deliberately left alone - which
   * shelf you are on and how it is ordered are separate preferences.
   */
  const browseCategoryOnly = (id: string) => {
    onSearchChange('');
    setCoreType('All');
    setZone('');
    setMinPrice('');
    setMaxPrice('');
    setCategoryId(id);
  };

  /**
   * Buy straight from the grid.
   *
   * Offered on goods only: a service is arranged with its seller and a cart
   * line for one would be a promise the app cannot keep. Anything sold or
   * reserved is excluded too, and so is the seller's own listing - it stops
   * the press that was only ever going to come back as an error.
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
    // Brief confirmation before the button reverts, so a tap gets a clear
    // "that worked" instead of silently returning to its resting state.
    setAddedId(item.id);
    setTimeout(() => setAddedId((current) => (current === item.id ? null : current)), 1400);
  };

  /** Anything narrowing the feed right now - what "Clear" would undo. */
  const hasActiveFilters = Boolean(
    searchQuery.trim() || coreType !== 'All' || categoryId || zone || minPrice || maxPrice,
  );

  const activeSortLabel = useMemo(
    () => SORTS.find((s) => s.value === effectiveSort)?.label ?? 'Newest',
    [effectiveSort],
  );

  const visibleSorts = useMemo(
    () => SORTS.filter((s) => !s.needsQuery || searchQuery.trim()),
    [searchQuery],
  );

  const showRecentRow = !isGuest && recent.length > 0 && !searchQuery.trim()
    && coreType === 'All' && !categoryId;

  const isCoreActive = (type?: CoreType) => {
    if (type === undefined) return coreType === 'All' && !categoryId;
    return coreType === type && !categoryId;
  };

  const categoriesActive = coreType !== 'All' || !!categoryId;

  const pickCore = (type?: CoreType) => {
    setCoreType(type ?? 'All');
    setCategoryId('');
  };

  const pickCategory = (id: string) => {
    setCategoryId(id === categoryId ? '' : id);
    setCoreType('All');
  };

  /**
   * Applies an admin-entered promo link.
   *
   * Filters are applied in-place rather than by navigating, so the feed
   * re-queries without a reload; only a genuinely different route (/sell,
   * /listing/x) hands off to the router. The server already guarantees the
   * value is an internal path, so this never has to consider an external URL.
   */
  const followPromoLink = (link?: string) => {
    if (!link) return;

    const [path, query] = link.split('?');
    const params = new URLSearchParams(query || '');

    if (path === '/sell') {
      onNavigateToSell();
      return;
    }
    if (path === '/browse' || path === '/' || path === '') {
      onSearchChange(params.get('q') || '');
      const type = params.get('type');
      setCoreType((['Product', 'Service', 'Food'].includes(type || '') ? type : 'All') as CoreType);
      setCategoryId(params.get('categoryId') || '');
      const z = params.get('campusZone') || '';
      setZone((CAMPUS_ZONES.some((c) => c.value === z) ? z : '') as CampusZone | '');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Anything else (a specific listing, support, legal) is a real route.
    window.history.pushState({}, '', link);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  /* ── Carousel helpers ─────────────────────────────────────────────────── */
  const goToSlide = (i: number) => setCarouselIndex(i);
  const nextSlide = () => setCarouselIndex((i) => (i + 1) % carouselSlides.length);
  const prevSlide = () =>
    setCarouselIndex((i) => (i - 1 + carouselSlides.length) % carouselSlides.length);

  // Axis-locked, velocity-aware swipe - mirrors the bottom nav's gesture
  // handling so a vertical scroll over the banner never fires a slide change.
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    carouselTouch.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = carouselTouch.current;
    carouselTouch.current = null;
    if (!start) return;
    const end = e.changedTouches[0];
    const deltaX = end.clientX - start.x;
    const deltaY = end.clientY - start.y;
    const elapsed = Date.now() - start.time;
    const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.5;
    if (isHorizontal && elapsed <= 500 && Math.abs(deltaX) > 40) {
      deltaX > 0 ? prevSlide() : nextSlide();
    }
  };

  // Bento tiles route through the same admin-configured link as the carousel,
  // so there is one behaviour to reason about instead of a per-tile switch.

  return (
    <div className="min-h-screen bg-[#f8f9ff] pb-28">
      {/* Small, self-contained keyframes for the polish added below - kept
          local to this screen rather than touching the shared stylesheet.
          Every animation is skipped for prefers-reduced-motion. */}
      <style>{`
        @keyframes cm-shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
        .cm-shimmer { background-image: linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent); background-size: 300px 100%; background-repeat: no-repeat; animation: cm-shimmer 1.6s ease-in-out infinite; }
        @keyframes cm-progress { from { width: 0%; } to { width: 100%; } }
        @keyframes cm-dropdown-in { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .cm-dropdown-in { animation: cm-dropdown-in 0.14s cubic-bezier(0.22, 1, 0.36, 1); transform-origin: top right; }
        @keyframes cm-added-pop { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.06); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        .cm-added-pop { animation: cm-added-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
        @media (prefers-reduced-motion: reduce) {
          .cm-shimmer, .cm-dropdown-in, .cm-added-pop, .animate-card-in, .animate-fade-in, .animate-badge-pop, .animate-cart-bump { animation: none !important; }
        }
      `}</style>

      {/*
        The search box lives in the global nav, so the feed doesn't repeat it.
        Below lg, the nav has no room for its own category row, so the feed
        renders a horizontally-scrollable strip. At lg and up, that strip is
        replaced by a single "Categories" trigger that opens a hover mega menu,
        keeping the header compact.
      */}
      <div
        className={`sticky top-0 z-30 bg-[#f8f9ff]/95 backdrop-blur-md border-b border-[#c3c6d7]/40 transition-shadow duration-200 ${headerScrolled ? 'shadow-[0_4px_20px_-4px_rgba(11,28,48,0.08)]' : ''
          }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* ── Category strip (below lg only) ──────────────────────────── */}
          <div className="lg:hidden relative flex items-center">
            {/* Left fade + arrow */}
            <div
              className={`absolute left-0 top-0 bottom-0 z-10 flex items-center transition-opacity duration-200 ${scrollState.canLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
            >
              <div className="w-10 bg-gradient-to-r from-[#f8f9ff] to-transparent" />
              <button
                onClick={() => scrollBy('left')}
                aria-label="Scroll categories left"
                className="absolute left-0 ml-0.5 w-7 h-7 rounded-full bg-white/90 border border-[#e5eeff] shadow-sm flex items-center justify-center text-[#737686] hover:text-[#0b1c30] active:scale-90 transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right fade + arrow */}
            <div
              className={`absolute right-0 top-0 bottom-0 z-10 flex items-center transition-opacity duration-200 ${scrollState.canRight ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
            >
              <div className="w-10 bg-gradient-to-l from-[#f8f9ff] to-transparent" />
              <button
                onClick={() => scrollBy('right')}
                aria-label="Scroll categories right"
                className="absolute right-0 mr-0.5 w-7 h-7 rounded-full bg-white/90 border border-[#e5eeff] shadow-sm flex items-center justify-center text-[#737686] hover:text-[#0b1c30] active:scale-90 transition-all"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Scrollable track */}
            <div
              ref={scrollRef}
              className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory pt-3 pb-2.5 px-0.5"
              style={{
                maskImage:
                  scrollState.canLeft && scrollState.canRight
                    ? 'linear-gradient(to right, transparent 0px, black 32px, black calc(100% - 32px), transparent 100%)'
                    : scrollState.canLeft
                      ? 'linear-gradient(to right, transparent 0px, black 32px, black 100%)'
                      : scrollState.canRight
                        ? 'linear-gradient(to right, black calc(100% - 32px), transparent 100%)'
                        : 'none',
                WebkitMaskImage:
                  scrollState.canLeft && scrollState.canRight
                    ? 'linear-gradient(to right, transparent 0px, black 32px, black calc(100% - 32px), transparent 100%)'
                    : scrollState.canLeft
                      ? 'linear-gradient(to right, transparent 0px, black 32px, black 100%)'
                      : scrollState.canRight
                        ? 'linear-gradient(to right, black calc(100% - 32px), transparent 100%)'
                        : 'none',
              }}
            >
              {/* Core type tabs — larger, more prominent */}
              {CORE_ITEMS.map((item) => {
                const active = isCoreActive(item.type);
                return (
                  <button
                    key={item.key}
                    onClick={() => {
                      setCoreType(item.type ?? 'All');
                      setCategoryId('');
                    }}
                    style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                    className={`snap-start shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border transition-all duration-200 select-none ${active
                      ? item.type
                        ? `${TYPE_STYLE[item.type].solid} shadow-sm scale-[1.02]`
                        : 'bg-[#0b1c30] text-white border-[#0b1c30] shadow-sm scale-[1.02]'
                      : 'bg-white text-[#434655] border-[#c3c6d7] hover:border-[#737686] hover:bg-[#fafbff] active:scale-95'
                      }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}

              {/* Divider */}
              {categories.length > 0 && (
                <div className="snap-start shrink-0 w-px h-6 bg-[#c3c6d7]/50 mx-0.5" />
              )}

              {/* Subcategory pills — lighter, smaller, with count badges */}
              {categories.map((c) => {
                const active = categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCategoryId(c.id === categoryId ? '' : c.id);
                      setCoreType('All');
                    }}
                    className={`snap-start shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 select-none ${active
                      ? 'bg-[#434655] text-white border-[#434655] shadow-sm scale-[1.02]'
                      : 'bg-white text-[#737686] border-[#c3c6d7] hover:border-[#737686] hover:text-[#434655] active:scale-95'
                      }`}
                  >
                    <span className="truncate max-w-[120px]">{c.name}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-[#eff4ff] text-[#2563eb]'
                        }`}
                    >
                      {c.listingCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Categories strip (desktop only) ────────────── */}
          <div className="hidden lg:flex items-center gap-6 py-2.5 overflow-x-auto no-scrollbar whitespace-nowrap">
            {CORE_ITEMS.map((item) => {
              const active = isCoreActive(item.type);
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    pickCore(item.type);
                  }}
                  className={`text-[13px] transition-colors ${active ? 'font-bold text-[#0b1c30]' : 'text-[#434655] hover:text-[#2563eb] hover:underline underline-offset-4'
                    }`}
                >
                  {item.label}
                </button>
              );
            })}

            {categories.map((c) => {
              const active = categoryId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    pickCategory(c.id);
                  }}
                  className={`text-[13px] transition-colors ${active ? 'font-bold text-[#0b1c30]' : 'text-[#434655] hover:text-[#2563eb] hover:underline underline-offset-4'
                    }`}
                >
                  {c.name}
                </button>
              );
            })}

            {hasActiveFilters && (
              <button
                onClick={resetToHome}
                className="text-[13px] font-semibold text-[#2563eb] hover:text-[#004ac6] ml-auto"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
        {HOME_PROMO && !promoDismissed && (
          <div className="relative mb-5 rounded-2xl bg-gradient-to-r from-[#eff4ff] to-[#e9ddff]/40 border border-[#dbe1ff] p-4 pr-11 flex items-start gap-3 animate-fade-in">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-card">
              <ShieldCheck className="w-4.5 h-4.5 text-[#2563eb]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#0b1c30]">{HOME_PROMO.title}</h2>
              <p className="text-xs text-[#434655] mt-0.5 leading-relaxed">{HOME_PROMO.body}</p>
            </div>
            <button
              onClick={dismissPromo}
              aria-label="Dismiss"
              className="absolute top-3 right-3 p-1.5 rounded-full text-[#737686] hover:text-[#0b1c30] hover:bg-white/70"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ═══════════════════════ HERO CAROUSEL ═══════════════════════ */}
        {!searchQuery.trim() && coreType === 'All' && !categoryId && (
          <section
            className="mb-6 relative"
            onMouseEnter={() => setCarouselPaused(true)}
            onMouseLeave={() => setCarouselPaused(false)}
          >
            {/* ── Slide viewport ── */}
            <div className="relative rounded-3xl overflow-hidden shadow-[0_8px_32px_-8px_rgba(11,28,48,0.18)]">
              <div
                ref={carouselRef}
                className="flex transition-transform duration-500 ease-out"
                style={{
                  transform: `translateX(-${carouselIndex * 100}%)`,
                  willChange: 'transform',
                }}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                onTouchCancel={() => (carouselTouch.current = null)}
              >
                {carouselSlides.map((slide, slideIndex) => (
                  <div
                    key={slide.id}
                    className={`min-w-full bg-gradient-to-br ${PROMO_THEME_GRADIENT[slide.theme]} relative`}
                  >
                    {/* Decorative circles */}
                    <div className="absolute top-[-40px] right-[-40px] w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                    <div className="absolute bottom-[-20px] left-[20%] w-24 h-24 rounded-full bg-white/10 blur-xl pointer-events-none" />

                    {/* ── Slide inner: flex-col on mobile, flex-row on desktop ── */}
                    <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6 pt-4 sm:pt-5 lg:p-6">
                      {/* Left / Top: Text content */}
                      <div className="max-w-lg flex-1 min-w-0 px-4 sm:px-5 lg:px-0">
                        <h2
                          className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white leading-tight tracking-tight"
                          style={{ textWrap: 'balance' }}
                        >
                          {slide.title}
                        </h2>
                        {slide.subtitle && (
                          <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-white/85 leading-relaxed max-w-md">
                            {slide.subtitle}
                          </p>
                        )}
                        {slide.ctaLabel && (
                          <button
                            onClick={() => followPromoLink(slide.ctaLink)}
                            className="mt-3 sm:mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-[#0b1c30] text-xs sm:text-sm font-bold shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
                          >
                            {slide.ctaLabel}
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Right / Bottom: Image area */}
                      {slide.imageUrl ? (
                        <div className="w-full lg:w-1/2 shrink-0">
                          <div className="relative w-full lg:aspect-[16/9] lg:rounded-2xl overflow-hidden">
                            {/*
                              Banners are full-bleed at 1280px, so the
                              640px thumbnail would visibly blur here - this
                              is the one list where "full" is right. Only the
                              first slide is eager: it is the largest thing on
                              the busiest page and paints first; the rest sit
                              off-screen in the carousel and can wait.
                            */}
                            <ListingImage
                              src={slide.imageUrl}
                              alt=""
                              full
                              eager={slideIndex === 0}
                              className="block w-full h-auto lg:absolute lg:inset-0 lg:h-full object-contain"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="hidden lg:flex w-1/2 shrink-0 items-center justify-center">
                          <div className="w-24 h-24 xl:w-28 xl:h-28 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center rotate-3 hover:rotate-0 transition-transform duration-300">
                            <Sparkles className="w-10 h-10 xl:w-12 xl:h-12 text-white/90" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

            </div>

            {/* ── Controls: outside on mobile, absolute inside on desktop ── */}
            {carouselSlides.length > 1 && (
              <div className="mt-3.5 flex items-center justify-between lg:mt-0 lg:absolute lg:bottom-3 lg:left-4 lg:right-4 z-20">
                {/* Dot indicators, each doubling as a 5s progress bar for the
                    active slide so the wait to the next one is never a
                    surprise. */}
                <div className="flex items-center gap-1.5 px-2 lg:px-0">
                  {carouselSlides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goToSlide(i)}
                      aria-label={`Go to slide ${i + 1}`}
                      className={`relative h-1.5 rounded-full overflow-hidden transition-all duration-300 ${i === carouselIndex
                        ? 'w-6 bg-[#cdd5ea] lg:bg-white/30'
                        : 'w-1.5 bg-[#cdd5ea] hover:bg-[#aab5d6] lg:bg-white/50 lg:hover:bg-white/75'
                        }`}
                    >
                      {i === carouselIndex && !carouselPaused && !userPaused && !prefersReducedMotion && (
                        <span
                          key={carouselIndex}
                          className="absolute inset-y-0 left-0 bg-[#2563eb] lg:bg-white rounded-full"
                          style={{
                            animation: `cm-progress ${AUTOPLAY_MS}ms linear forwards`,
                          }}
                        />
                      )}
                    </button>
                  ))}
                </div>

                {/* Arrow & Play/Pause controls */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setUserPaused(!userPaused)}
                    className="w-7 h-7 rounded-full bg-white border border-[#cdd5ea] lg:border-white/20 lg:bg-white/20 lg:hover:bg-white/35 lg:backdrop-blur-sm flex items-center justify-center text-[#434655] lg:text-white transition-all active:scale-90 shadow-sm lg:shadow-none mr-1"
                    aria-label={userPaused ? 'Play' : 'Pause'}
                  >
                    {userPaused ? <Play className="w-3.5 h-3.5" fill="currentColor" /> : <Pause className="w-3.5 h-3.5" fill="currentColor" />}
                  </button>
                  <button
                    onClick={prevSlide}
                    className="w-7 h-7 rounded-full bg-white border border-[#cdd5ea] lg:border-white/20 lg:bg-white/20 lg:hover:bg-white/35 lg:backdrop-blur-sm flex items-center justify-center text-[#434655] lg:text-white transition-all active:scale-90 shadow-sm lg:shadow-none"
                    aria-label="Previous slide"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={nextSlide}
                    className="w-7 h-7 rounded-full bg-white border border-[#cdd5ea] lg:border-white/20 lg:bg-white/20 lg:hover:bg-white/35 lg:backdrop-blur-sm flex items-center justify-center text-[#434655] lg:text-white transition-all active:scale-90 shadow-sm lg:shadow-none"
                    aria-label="Next slide"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </section>
        )}



        {/* ────────────────────── Continue browsing row ───────────────────── */}
        {showRecentRow && (
          <section className="mb-6">
            <h2 className="text-sm font-bold text-[#0b1c30] mb-2.5">Continue browsing</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {recent.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectListing(item)}
                  className="shrink-0 w-32 text-left group"
                >
                  <div className="relative w-32 h-24 rounded-xl overflow-hidden bg-[#e5eeff] border border-[#e5eeff]">
                    <ListingImage
                      src={item.image}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    {!item.isAvailable && (
                      <div className="absolute inset-0 bg-[#0b1c30]/55 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                          {item.badgeText === 'Sold' ? 'Sold' : 'Reserved'}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-[#0b1c30] truncate mt-1.5">{item.title}</p>
                  <p className="text-xs font-extrabold text-[#2563eb]">{formatPrice(item.price)}</p>
                </button>
              ))}
            </div>
          </section>
        )}


        {/* Shown on the unfiltered feed only: someone who has already typed a
            search or picked a category is past needing the introduction. */}

        {/* ═════════════════════ SPECIAL OFFERS ═════════════════════ */}
        {/* Real listings an admin has promoted - priced, buyable, and shown
            only on the unfiltered feed, where "here is the whole shelf" is
            true. Under a category or a search it would be a fragment of one. */}
        {!searchQuery.trim() && coreType === 'All' && !categoryId && (
          <SpecialOffers
            onSelectListing={onSelectListing}
            onToggleSave={onToggleSave}
            onAddToCart={onAddToCart}
            onOpenChat={onOpenChat}
            currentUser={currentUser}
            listings={listings}
          />
        )}

        {/* ═══════════════════════ BENTO GRID ═══════════════════════ */}
        {!searchQuery.trim() && coreType === 'All' && !categoryId && bentoItems.length > 0 && (
          <section className="mb-7">
            <div className="flex items-center justify-between mb-3">
              {/* These panels are marketing routes into the catalogue, not
                  priced goods; the offers shelf above now owns that job. */}
              <h2 className="text-sm font-bold text-[#0b1c30]">Explore the marketplace</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 auto-rows-[110px] sm:auto-rows-[120px]">
              {bentoItems.map((item) => {
                const tile = PROMO_THEME_TILE[item.theme];
                return (
                  <button
                    key={item.id}
                    onClick={() => followPromoLink(item.ctaLink)}
                    className={`${item.wide ? 'col-span-2' : 'col-span-1'} row-span-1 relative rounded-2xl ${item.imageUrl ? 'bg-[#0b1c30]' : tile.bg
                      } border border-white/60 p-4 text-left overflow-hidden group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.98]`}
                  >
                    {item.imageUrl ? (
                      <>
                        <ListingImage
                          src={item.imageUrl}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div
                          className="absolute inset-0 bg-[#0b1c30]"
                          style={{ opacity: item.imageOverlay / 100 }}
                        />
                      </>
                    ) : (
                      <div className="absolute -right-3 -bottom-3 w-20 h-20 rounded-full bg-white/40 group-hover:scale-110 transition-transform duration-300" />
                    )}

                    <div className="relative z-10 flex flex-col h-full justify-between">
                      <div className="flex items-start justify-between">
                        <div
                          className={`p-2 rounded-xl backdrop-blur-sm ${item.imageUrl ? 'bg-white/20 text-white' : `bg-white/70 ${tile.text}`
                            }`}
                        >
                          {iconForLink(item.ctaLink)}
                        </div>
                        {item.badge && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 text-[#0b1c30] shadow-sm">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <div>
                        <h3
                          className={`text-sm font-bold leading-tight ${item.imageUrl ? 'text-white' : 'text-[#0b1c30]'
                            }`}
                        >
                          {item.title}
                        </h3>
                        {item.subtitle && (
                          <p
                            className={`text-[11px] mt-0.5 leading-snug line-clamp-2 ${item.imageUrl ? 'text-white/80' : 'text-[#737686]'
                              }`}
                          >
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Campus zone filter. Sits above the results rather than in the
             category menu because it cuts across every type - someone wants
             "food near me", not "food, then separately near me". ── */}
        {/*
          Two children, not one row.

          The price menu used to sit inside the scrolling strip, and an
          overflow-x container clips on BOTH axes - overflow-y resolves to auto
          the moment overflow-x is set - so the panel was cut off at the row's
          edge and appeared to vanish behind the results. No z-index can escape
          a clip, so the control moves out of the scroller instead.
        */}
        <div className="flex items-center gap-2 mb-4" data-onboarding="feed-zones">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 min-w-0">
            <span className="shrink-0 text-[11px] font-bold text-[#a0a3b1] uppercase tracking-wider">
              Zone
            </span>
            <button
              onClick={() => setZone('')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${zone === ''
                ? 'bg-[#0b1c30] text-white border-[#0b1c30]'
                : 'bg-white text-[#737686] border-[#c3c6d7] hover:border-[#737686] hover:text-[#434655]'
                }`}
            >
              Anywhere
            </button>
            {CAMPUS_ZONES.map((option) => {
              const active = zone === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setZone(active ? '' : option.value)}
                  title={option.hint}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${active
                    ? 'bg-[#2563eb] text-white border-[#2563eb]'
                    : 'bg-white text-[#737686] border-[#c3c6d7] hover:border-[#737686] hover:text-[#434655]'
                    }`}
                >
                  <MapPin className="w-3 h-3" />
                  {option.label}
                </button>
              );
            })}
          </div>

          {/* Price belongs on the same row as zone: both cut across every
              category, and it was previously only on the search results page -
              the one place people reach by typing, rather than the page they
              actually land on. */}
          <div className="relative shrink-0" ref={priceMenuRef}>
            <button
              onClick={() => setPriceOpen((o) => !o)}
              aria-expanded={priceOpen}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${minPrice || maxPrice
                  ? 'bg-[#2563eb] text-white border-[#2563eb]'
                  : 'bg-white text-[#737686] border-[#c3c6d7] hover:border-[#737686] hover:text-[#434655]'
                }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              {priceButtonLabel}
              <ChevronDown className="w-3 h-3" />
            </button>

            {priceOpen && (
              /* Anchored right, since this is now the rightmost control and a
                 left-anchored 288px panel would hang off a phone screen. z-40
                 clears the sticky category header, which is z-30. */
              <div className="cm-dropdown-in absolute right-0 mt-2 z-40 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-[#e5eeff] shadow-modal p-4">
                <p className="text-[11px] font-bold text-[#a0a3b1] uppercase tracking-wider mb-2">
                  Price
                </p>
                <PriceRangeSlider
                  min={minPrice}
                  max={maxPrice}
                  ceiling={priceCeiling}
                  onCommit={(lo, hi) => { setMinPrice(lo); setMaxPrice(hi); }}
                />
                <button
                  onClick={() => setPriceOpen(false)}
                  className="mt-3 w-full py-2 rounded-lg bg-[#0b1c30] text-white text-xs font-bold hover:bg-[#213145] transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>

        {/*
          Everything currently narrowing the feed, each removable on its own.

          Type and category are chosen up in the sticky header and price sits
          behind a dropdown, so a feed could be cut three ways by controls that
          are all scrolled past or collapsed - leaving "5 listings" looking like
          the whole catalogue. Undoing one of them meant "Clear", which threw
          away the other two as well.
        */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar">
            {searchQuery.trim() && (
              <FilterPill label={`“${searchQuery.trim()}”`} onRemove={() => onSearchChange('')} />
            )}
            {coreType !== 'All' && (
              <FilterPill label={coreType} onRemove={() => setCoreType('All')} />
            )}
            {categoryId && (
              <FilterPill
                label={categories.find((c) => c.id === categoryId)?.name || 'Category'}
                onRemove={() => setCategoryId('')}
              />
            )}
            {zone && <FilterPill label={zoneLabel(zone)} onRemove={() => setZone('')} />}
            {(minPrice || maxPrice) && (
              <FilterPill
                label={priceButtonLabel}
                onRemove={() => { setMinPrice(''); setMaxPrice(''); }}
              />
            )}
            <button
              onClick={resetToHome}
              className="shrink-0 text-[11px] font-bold text-[#2563eb] hover:text-[#004ac6] px-2"
            >
              Clear all
            </button>
          </div>
        )}

        {/* ─────────────────────────── Result count ───────────────────────── */}
        <div ref={resultsRef} className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-semibold text-[#434655] truncate">
              {loading ? 'Searching…' : `${total} listing${total !== 1 ? 's' : ''}`}
            </span>
            {/* "Clear all" lives on the filter pill row directly above, next to
                the individual filters it clears. */}
          </div>

          {/* Sort - small and unobtrusive, sitting at the top of the grid */}
          <div className="relative shrink-0">
            <button
              onClick={() => setSortOpen((o) => !o)}
              aria-label={`Sort: ${activeSortLabel}`}
              className="flex items-center gap-1.5 h-9 px-3 rounded-full border border-[#c3c6d7] bg-white hover:bg-[#eff4ff] text-[#434655] text-xs font-semibold shadow-card transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{activeSortLabel}</span>
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                <div className="cm-dropdown-in absolute right-0 mt-1.5 z-20 w-52 bg-white rounded-2xl border border-[#e5eeff] shadow-modal overflow-hidden py-1">
                  {visibleSorts.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => { setSort(s.value); setSortTouched(true); setSortOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-semibold transition-colors ${effectiveSort === s.value ? 'bg-[#eff4ff] text-[#2563eb]' : 'text-[#434655] hover:bg-[#f8f9ff]'
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

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700 font-semibold">
            {error}
          </div>
        )}

        {/* ────────────────────────────── Grid ────────────────────────────── */}
        {loading ? (
          <SkeletonGrid count={8} />
        ) : results.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl shadow-card my-4">
            <div className="w-16 h-16 bg-[#eff4ff] rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-[#2563eb]" />
            </div>
            <h3 className="text-lg font-bold text-[#0b1c30]">
              {searchQuery.trim() ? <>Nothing matched “{searchQuery.trim()}”</> : 'No listings found'}
            </h3>
            <p className="text-sm text-[#737686] mt-1.5 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'Try removing a filter, or search for something broader.'
                : 'Nothing has been listed here yet — check back soon.'}
            </p>
            {hasActiveFilters && (
              <button onClick={resetToHome} className="btn-primary !h-10 !px-5 !text-xs mt-5 !rounded-lg mx-auto">
                Clear filters
              </button>
            )}

            {/* An empty feed is where people leave. On a catalogue this small
                the thing they filtered for often genuinely is not here, so the
                useful move is to show what IS - by category, with counts, so
                nothing offered here leads to another empty page. */}
            {categories.length > 0 && (
              <div className="mt-8 pt-6 border-t border-[#eff4ff] max-w-md mx-auto">
                <p className="text-xs font-bold text-[#a0a3b1] uppercase tracking-wider mb-3">
                  Browse what's here instead
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {categories.slice(0, 6).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => browseCategoryOnly(c.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#c3c6d7] text-xs font-semibold text-[#434655] hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
                    >
                      {c.name}
                      <span className="text-[10px] font-bold text-[#a0a3b1]">{c.listingCount}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
              {results.map((item) => {
                const detail = contextualDetail(item);
                const unavailable = item.badgeText === 'Sold' || item.badgeText === 'Reserved';
                return (
                  <article
                    key={item.id}
                    onClick={() => onSelectListing(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      // Only when the card itself is focused - a Save or Add-to-cart
                      // button inside it handles its own Enter/Space, and this
                      // would otherwise also fire from the keydown bubbling up.
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectListing(item);
                      }
                    }}
                    className="animate-card-in group bg-white rounded-2xl shadow-card hover:shadow-card-hover hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 overflow-hidden flex flex-col cursor-pointer border border-[#e5eeff]/80 hover:border-[#b4c5ff]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2"
                  >
                    <div className="relative aspect-[4/3] w-full bg-[#e5eeff] overflow-hidden">
                      <ListingImage
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />

                      {/* Type tag - always visible, never behind a tap */}
                      <div className="absolute top-2.5 left-2.5">
                        <span className={TYPE_STYLE[item.category].chip}>
                          {TYPE_STYLE[item.category].icon}
                          {item.category}
                        </span>
                      </div>

                      {/* Save - the one part of the card that doesn't navigate */}
                      <button
                        onClick={(e) => onToggleSave(item.id, e)}
                        aria-label={item.isSaved ? 'Remove from saved' : 'Save listing'}
                        className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/95 hover:bg-white text-[#434655] hover:text-red-500 flex items-center justify-center shadow-card active:scale-90 transition-all duration-150"
                      >
                        <Heart className={`w-4 h-4 transition-all ${item.isSaved ? 'fill-red-500 text-red-500 scale-110' : ''}`} />
                      </button>

                      {/* More-photos hint, so extra images aren't hidden behind a tap */}
                      {item.gallery && item.gallery.length > 1 && (
                        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#0b1c30]/60 backdrop-blur-sm">
                          <Images className="w-3 h-3 text-white" />
                          <span className="text-[10px] font-bold text-white">{item.gallery.length}</span>
                        </div>
                      )}

                      {/* Unavailable items are skippable at a glance while scanning */}
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

                      {/* Price - the loudest text on the card */}
                      <div className="text-[#2563eb] font-extrabold text-lg sm:text-xl mt-0.5 tracking-tight">
                        {formatPrice(item.price)}
                        {item.priceUnit && (
                          <span className="text-xs font-semibold text-[#737686] ml-0.5">{item.priceUnit}</span>
                        )}
                      </div>

                      <div className="mt-auto pt-2.5 flex items-center gap-1.5 text-[11px] text-[#737686] font-medium min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-[#b4c5ff] shrink-0" />
                        <span className="truncate">{item.location}</span>
                        {detail && (
                          <>
                            <span className="text-[#c3c6d7] shrink-0">·</span>
                            <span className="truncate shrink-0 max-w-[45%] text-[#434655]">{detail}</span>
                          </>
                        )}
                      </div>

                      {/* One tap from the grid, as on any shop. It stops the
                          card's own navigation, so the row is a real choice
                          between "add it" and "look at it" rather than a
                          button that opens the page anyway. A short "Added"
                          confirmation replaces the spinner before the button
                          reverts, so the tap gets a clear result rather than
                          silently snapping back. */}
                      {canQuickAdd(item) && (
                        <button
                          onClick={(e) => quickAdd(item, e)}
                          disabled={addingId === item.id}
                          aria-label={`Add ${item.title} to cart`}
                          className={`mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-60 ${addedId === item.id
                              ? 'bg-[#007d55] text-white'
                              : 'bg-[#eff4ff] hover:bg-[#2563eb] text-[#2563eb] hover:text-white disabled:hover:bg-[#eff4ff] disabled:hover:text-[#2563eb]'
                            }`}
                        >
                          {addingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : addedId === item.id ? (
                            <span className="cm-added-pop flex items-center gap-1.5">
                              <Check className="w-3.5 h-3.5" />
                              Added
                            </span>
                          ) : (
                            <ShoppingBag className="w-3.5 h-3.5" />
                          )}
                          {addingId !== item.id && addedId !== item.id && 'Add to cart'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Infinite-scroll trigger + tail skeletons. The button is a
                deliberate fallback: scrolling is the primary path, but keyboard
                and screen-reader users need something focusable, and it also
                covers browsers where the observer is suspended. */}
            {hasMore && (
              <div ref={sentinelRef} className="pt-5">
                {loadingMore ? (
                  <SkeletonGrid count={4} />
                ) : (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={() => runSearch(page + 1, true)}
                      className="px-5 py-2.5 rounded-full border border-[#c3c6d7] bg-white hover:bg-[#eff4ff] text-[#434655] text-xs font-semibold shadow-card transition-colors"
                    >
                      Load more
                    </button>
                  </div>
                )}
              </div>
            )}
            {!hasMore && results.length >= PAGE_SIZE && (
              <p className="text-center text-xs text-[#737686] py-8">That's everything for now.</p>
            )}
          </>
        )}
      </div>


    </div>
  );
};

/** Grey placeholders matching the real card layout - never a blank screen,
 *  with a soft shimmer sweep instead of a flat pulse for a more premium feel. */
const SkeletonGrid: React.FC<{ count: number }> = ({ count }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-white rounded-2xl border border-[#e5eeff]/80 overflow-hidden">
        <div className="aspect-[4/3] bg-[#e5eeff] cm-shimmer" />
        <div className="p-3.5 space-y-2">
          <div className="h-3 bg-[#e5eeff] rounded w-3/4 cm-shimmer" />
          <div className="h-5 bg-[#dce9ff] rounded w-1/3 cm-shimmer" />
          <div className="h-2.5 bg-[#eff4ff] rounded w-2/3 mt-3 cm-shimmer" />
        </div>
      </div>
    ))}
  </div>
);