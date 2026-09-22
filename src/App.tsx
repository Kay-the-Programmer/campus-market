/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
  Listing, ViewType, SellerProfile, AuthSession, AddToCartOptions,
  SearchFilters, EMPTY_SEARCH_FILTERS, CAMPUS_ZONES,
} from './types';
import { TopNav, FeedType, CategoryLink } from './components/nav/TopNav';
import { BottomNav } from './components/nav/BottomNav';
import { SiteFooter } from './components/nav/SiteFooter';
import { AdminSidebar, AdminHeader, AdminTab } from './components/nav/AdminNav';
import { AuthModal } from './components/AuthModal';
import { BrowseScreen } from './components/BrowseScreen';
import { SearchScreen } from './components/SearchScreen';
import { DetailScreen } from './components/DetailScreen';
import { SellScreen } from './components/SellScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { SavedScreen } from './components/SavedScreen';
import { CategoriesScreen } from './components/CategoriesScreen';
import { MessagesScreen } from './components/MessagesScreen';
import { SupportScreen } from './components/SupportScreen';
import { CartScreen } from './components/CartScreen';
import { DealsScreen } from './components/DealsScreen';
import { NotificationsScreen } from './components/NotificationsScreen';
import { MyListingsScreen } from './components/MyListingsScreen';
import { OrdersScreen } from './components/OrdersScreen';
import { BecomeSellerModal } from './components/shared/BecomeSellerModal';
import { OnboardingProvider } from './hooks/useOnboarding';
import { OnboardingHost } from './components/onboarding/OnboardingHost';
import { canSell } from './components/nav/navShared';

/*
 * Split out of the main bundle.
 *
 * The admin console is reachable by a handful of accounts and pulls in the
 * listing manager, promo editor and offers editor behind it; the legal pages
 * are long, static, and read once if ever. Everyone was paying for all of it
 * on first load to render a feed that needs none of it.
 *
 * The rest of the screens stay eager on purpose - they are what an ordinary
 * session actually moves between, and a spinner between the feed and a listing
 * would be a worse trade than the bytes.
 */
const AdminScreen = lazy(() =>
  import('./components/AdminScreen').then((m) => ({ default: m.AdminScreen })));
const LegalScreen = lazy(() =>
  import('./components/LegalScreen').then((m) => ({ default: m.LegalScreen })));

/**
 * Shown while a split screen's chunk is in flight.
 *
 * <p>Deliberately plain. On a fast connection it is visible for a few frames,
 * and anything more elaborate would flash - the cost of a skeleton that
 * disappears immediately is worse than a spinner nobody sees.
 */
const ScreenLoading: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="Loading">
    <div className="w-8 h-8 rounded-full border-2 border-[#e5eeff] border-t-[#2563eb] animate-spin" />
  </div>
);
import { NotFoundScreen } from './components/NotFoundScreen';
import { DetailSkeleton, DetailUnavailable } from './components/DetailSkeleton';
import { RoleSwitcherBar } from './components/RoleSwitcherBar';
import { AuthMode } from './components/AuthModal';
import { useToast } from './components/shared/ToastProvider';
import { useOrderToasts } from './hooks/useOrderToasts';
import { useLiveCounts } from './hooks/useLiveCounts';
import { api } from './services/api';
import { completeGoogleRedirect } from './firebase';
import { onForegroundPush, onNotificationClick, refreshToken } from './services/push';
import { recordRecentlyViewed, mergeGuestHistory } from './services/recentlyViewed';
import { mergeGuestIntent } from './services/intent';
import { getGuestSaves, toggleGuestSave, takeGuestSaves } from './services/guestSaves';

// URL Routing Helpers
function parsePathname(pathname: string): {
  view: ViewType; listingId?: string; sellerId?: string; orderId?: string;
} {
  const path = pathname.replace(/\/$/, '') || '/';

  // Before the bare /orders case below, so the id is not swallowed by it.
  if (path.startsWith('/orders/')) {
    return { view: 'orders', orderId: path.replace('/orders/', '') };
  }

  /*
   * /offers is the feed with one filter already on, not a screen of its own.
   *
   * A separate deals page would be a second grid to keep in step with the
   * first - its own paging, its own zone filter, its own empty state - and the
   * moment someone wanted "cheap textbooks" rather than "cheap anything" they
   * would have to leave it. Routing it into browse means the deals view is the
   * feed, and every way of narrowing the feed still works from inside it.
   */
  if (path === '/' || path === '/browse' || path === '/offers') {
    return { view: 'browse' };
  }
  if (path.startsWith('/listing/')) {
    const id = path.replace('/listing/', '');
    return { view: 'detail', listingId: id };
  }
  if (path.startsWith('/profile/')) {
    const id = path.replace('/profile/', '');
    return { view: 'profile', sellerId: id };
  }
  // Landing targets for the emailed verification / reset links. They resolve to
  // Home; the token itself is handled on mount below.
  if (path === '/verify-email' || path === '/reset-password') return { view: 'browse' };
  if (path === '/sell') return { view: 'sell' };
  if (path === '/profile') return { view: 'profile' };
  if (path === '/saved') return { view: 'saved' };
  if (path === '/messages') return { view: 'messages' };
  if (path === '/search') return { view: 'search' };
  if (path === '/cart') return { view: 'cart' };
  if (path === '/orders') return { view: 'orders' };
  if (path === '/deals') return { view: 'deals' };
  if (path === '/notifications') return { view: 'notifications' };
  if (path === '/my-listings') return { view: 'my-listings' };
  if (path === '/admin') return { view: 'admin' };
  if (path === '/support' || path === '/help') return { view: 'support' };
  if (path === '/legal') return { view: 'legal' };
  if (path === '/categories') return { view: 'categories' };

  return { view: 'notFound' };
}

function buildPathname(
  view: ViewType, listingId?: string, sellerId?: string, orderId?: string,
): string {
  if (view === 'orders' && orderId) return `/orders/${orderId}`;
  switch (view) {
    case 'browse': return '/browse';
    case 'detail': return listingId ? `/listing/${listingId}` : '/browse';
    case 'sell': return '/sell';
    case 'profile': return sellerId ? `/profile/${sellerId}` : '/profile';
    case 'saved': return '/saved';
    case 'messages': return '/messages';
    case 'search': return '/search';
    case 'cart': return '/cart';
    case 'orders': return '/orders';
    case 'deals': return '/deals';
    case 'notifications': return '/notifications';
    case 'my-listings': return '/my-listings';
    case 'admin': return '/admin';
    case 'support': return '/support';
    case 'legal': return '/legal';
    case 'categories': return '/categories';
    case 'notFound': return '/404';
    default: return '/browse';
  }
}

// Views that require a logged-in session (guest cannot access)
/*
 * Saved is no longer here.
 *
 * A guest's saves are kept on the device (services/guestSaves), so there is
 * now something real to show them - and a shortlist they can look at is the
 * thing most likely to bring them back and, eventually, sign up. Everything
 * else on this list genuinely needs an account: there is no such thing as a
 * guest's orders, messages or listings.
 */
const GUEST_PROTECTED_VIEWS: ViewType[] = [
  'sell', 'messages', 'profile', 'my-listings', 'cart', 'notifications', 'deals', 'orders'
];

/*
 * Views that admins cannot access.
 *
 * Admins may now sell, so the seller-side surfaces (sell, my-listings, orders,
 * messages, deals) are open to them - a seller who cannot list, see orders or
 * answer a buyer is not really a seller. What stays shut is the BUYING side:
 * an admin acquiring things through a marketplace they also police is the
 * conflict the original separation existed to prevent.
 */
const ADMIN_BLOCKED_VIEWS: ViewType[] = ['saved', 'cart'];

export default function App() {
  const toast = useToast();
  const initialRoute = parsePathname(window.location.pathname);
  // On initial load, default to browse for protected routes until session resolves
  const [currentView, setCurrentView] = useState<ViewType>(
    GUEST_PROTECTED_VIEWS.includes(initialRoute.view) ? 'browse' : initialRoute.view
  );
  /*
   * Empty until the API answers.
   *
   * This used to be seeded from a fixture file, so a cold load rendered four
   * invented listings - real-looking titles, prices and sellers that nobody
   * could buy - and then swapped them for the catalogue a moment later. When
   * the API was down they did not swap at all: the app looked like a working
   * marketplace stocked entirely with things that do not exist.
   */
  const [listings, setListings] = useState<Listing[]>([]);
  /*
   * Null until the real listing arrives. This used to fall back to
   * initialListings[0], so opening a shared link to any listing the demo data
   * did not contain rendered a different, fictional item - the wrong price,
   * the wrong seller, presented as though it were the thing you clicked.
   * Nothing is a far better answer than the wrong something.
   */
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  /*
   * The listing behind the current URL could not be fetched at all - as
   * distinct from not existing, which is a 404 and routes to NotFound. Only
   * this case gets a "try again", because only this case might work next time.
   */
  const [detailUnreachable, setDetailUnreachable] = useState(false);
  // Present -> SellScreen renders in edit mode for this listing; absent -> create mode.
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  /*
   * Which Orders tab to land on, when the route into it says what the person
   * is looking for. Only set by callers with that context - checkout's "Track
   * my orders" - and cleared on the way out, so it never colours a later,
   * unprompted visit to Orders.
   */
  const [ordersInitialSide, setOrdersInitialSide] =
    useState<'all' | 'incoming' | 'placed' | undefined>(undefined);
  // Track the originally-requested protected route so we can redirect after login
  const [pendingRoute, setPendingRoute] = useState<ViewType | null>(
    GUEST_PROTECTED_VIEWS.includes(initialRoute.view) ? initialRoute.view : null
  );
  const [selectedSellerId, setSelectedSellerId] = useState<string | undefined>(initialRoute.sellerId);
  /** Set when a URL or a notification names one order; opens its detail view. */
  const [selectedOrderId, setSelectedOrderId] = useState<string | undefined>(initialRoute.orderId);
  /*
   * The order id this tab was opened on, kept because the address bar cannot be
   * trusted to still hold it. A protected route renders the feed while the
   * session resolves, and the feed writes its own filters into the URL - so by
   * the time the real route is restored, /orders/:id has already become
   * /browse and the id is only still knowable from here.
   */
  const landingOrderId = React.useRef(initialRoute.orderId);
  // Opening Messages should land on the conversations, not the deal archive.
  const [messagesTab, setMessagesTab] = useState<'history' | 'chat'>('chat');
  // Which thread the inbox should open with, when we arrived from a listing.
  const [openConversationId, setOpenConversationId] = useState<string | undefined>(undefined);
  // Reuses AdminTab so adding a console section can't drift out of sync here.
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>('dashboard');
  const [cartCount, setCartCount] = useState<number>(0);
  // Saved items come from the server rather than being derived from whatever
  // happens to be loaded in the feed, so the Saved page is complete and survives
  // a refresh (workflow 11).
  const [savedListings, setSavedListings] = useState<Listing[]>([]);
  // Real badge counts from the session payload, rather than a placeholder.
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  /*
   * Feed search + category filters live here rather than inside BrowseScreen,
   * because the nav also drives them. One owner means the header search box and
   * the feed can never disagree about what is being filtered.
   */
  const initialFeed = (() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('type');
    return {
      q: p.get('q') || '',
      type: (['Product', 'Service', 'Food'].includes(t || '') ? t : 'All') as FeedType,
      categoryId: p.get('categoryId') || '',
      /* /offers is an entry point, not a screen - see parsePathname. It is
         read here as well as from ?deals=1 so the link works whether someone
         typed the friendly URL or shared a filtered feed. */
      deals: p.get('deals') === '1' || window.location.pathname === '/offers',
    };
  })();
  const [feedQuery, setFeedQuery] = useState(initialFeed.q);
  const [feedType, setFeedType] = useState<FeedType>(initialFeed.type);
  const [feedCategoryId, setFeedCategoryId] = useState(initialFeed.categoryId);
  /*
   * "Only reduced items" is owned here for the same reason the search term and
   * the category are: the nav offers a Deals link, and a link that set a piece
   * of BrowseScreen's private state would do nothing at all when pressed from
   * the feed itself, which is exactly where it will be pressed most.
   */
  const [feedDealsOnly, setFeedDealsOnly] = useState(initialFeed.deals);
  const [navCategories, setNavCategories] = useState<CategoryLink[]>([]);
  const [pendingReports, setPendingReports] = useState(0);
  const [pendingSellers, setPendingSellers] = useState(0);
  const [heldOrders, setHeldOrders] = useState(0);
  const [authModalMode, setAuthModalMode] = useState<AuthMode>('login');
  const [resetToken, setResetToken] = useState<string | undefined>(undefined);

  /**
   * A Google ID token from a redirect sign-in, waiting for the modal to
   * exchange it. Set on the one page load that is the return leg from Google
   * and cleared the moment the modal has used it.
   */
  const [pendingGoogleToken, setPendingGoogleToken] = useState<string | null>(null);

  /*
   * Is this page load the browser coming back from Google?
   *
   * The popup path never needs this - the modal stays mounted and finishes
   * the sign-in itself. The redirect path unloads the whole page, so the only
   * place the result can be collected is here, on the load that follows. Null
   * on every ordinary load, which is nearly all of them, and Firebase answers
   * that from local state without a request.
   */
  useEffect(() => {
    completeGoogleRedirect()
      .then((token) => {
        if (!token) return;
        setPendingGoogleToken(token);
        setAuthModalMode('login');
        setIsAuthModalOpen(true);
      })
      .catch((err: any) => {
        // A failed return leg is a real sign-in failure the person would
        // otherwise never see - they clicked, left, and came back to nothing.
        toast.error(err?.message || 'Could not complete Google sign-in.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * How many entries this app has pushed onto the history stack. A "Back"
   * button that always lands on the feed is not what Back means anywhere else
   * on the web - it should return you to the page you came from, which is
   * whatever history is already holding. The counter is what tells us there IS
   * such a page: someone who opened a shared /listing/x link directly has no
   * previous page of ours to go back to, and calling history.back() would take
   * them off the site entirely.
   */
  const pushedEntries = React.useRef(0);

  // Push or replace URL in browser address bar
  const updateUrl = (
    view: ViewType, listingId?: string, sellerId?: string, replace = false, orderId?: string,
  ) => {
    const url = buildPathname(view, listingId, sellerId, orderId);
    if (window.location.pathname !== url) {
      if (replace) {
        window.history.replaceState({ view, listingId, sellerId, orderId }, '', url);
      } else {
        window.history.pushState({ view, listingId, sellerId, orderId }, '', url);
        pushedEntries.current += 1;
      }
    }
  };

  /** The universal "Back": real history when we have it, Home when we don't. */
  const handleBack = () => {
    if (pushedEntries.current > 0) {
      window.history.back();
      return;
    }
    handleNavigate('browse');
  };

  // RBAC Server-Confirmed Session State
  const [currentUser, setCurrentUser] = useState<AuthSession>({
    id: 'guest',
    name: 'Guest Visitor',
    email: '',
    avatar: '',
    role: 'guest',
    accountType: 'BUYER',
    sellerApprovalStatus: 'NOT_REQUESTED',
    canSell: false,
    hasActiveListings: false
  });

  /**
   * True once the server has answered "who is this?", either way.
   *
   * Onboarding waits on it. Every visitor starts as the guest placeholder
   * above, so a tour that starts on first paint teaches a signed-in seller the
   * guest flow for the second it takes the session to arrive.
   */
  const [sessionResolved, setSessionResolved] = useState(false);

  /** Buyer tried to reach Sell - offer the in-place upgrade instead. */
  const [isBecomeSellerOpen, setIsBecomeSellerOpen] = useState(false);

  /*
   * Search results state, seeded from the URL so a shared /search?q=… link
   * reproduces the exact result set. Kept here rather than in SearchScreen
   * because the nav search box also writes to it.
   */
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(() => {
    const p = new URLSearchParams(window.location.search);
    const type = p.get('type');
    const zone = p.get('campusZone') || '';
    const condition = p.get('condition') || '';
    const q = p.get('q') || '';
    /*
     * A link carrying a term but no sort is a search, and a search leads with
     * its best answers - the same default the nav's own search box applies and
     * the same one the server picks. Without this, the exact case that matters
     * most (a results link pasted into a group chat) came back date-ordered
     * while a search typed in the box did not.
     */
    const sort = p.get('sort') || (q.trim() ? 'relevance' : 'newest');
    return {
      ...EMPTY_SEARCH_FILTERS,
      q,
      type: (['Product', 'Service', 'Food'].includes(type || '') ? type : 'All') as SearchFilters['type'],
      categoryId: p.get('categoryId') || '',
      campusZone: (CAMPUS_ZONES.some((z) => z.value === zone) ? zone : '') as SearchFilters['campusZone'],
      condition: (['New', 'Like New', 'Good', 'Fair'].includes(condition)
        ? condition : '') as SearchFilters['condition'],
      minPrice: p.get('minPrice') || '',
      maxPrice: p.get('maxPrice') || '',
      sort,
    };
  });

  /** Mirrors the current filters into the address bar without adding history. */
  const syncSearchUrl = (f: SearchFilters) => {
    const params = new URLSearchParams();
    if (f.q.trim()) params.set('q', f.q.trim());
    if (f.type !== 'All') params.set('type', f.type);
    if (f.categoryId) params.set('categoryId', f.categoryId);
    if (f.campusZone) params.set('campusZone', f.campusZone);
    if (f.condition) params.set('condition', f.condition);
    if (f.minPrice) params.set('minPrice', f.minPrice);
    if (f.maxPrice) params.set('maxPrice', f.maxPrice);
    if (f.sort !== 'newest') params.set('sort', f.sort);
    const qs = params.toString();
    window.history.replaceState({}, '', qs ? `/search?${qs}` : '/search');
  };

  /** Opens the results page for a term typed or picked in the nav. */
  const handleSubmitSearch = (term: string) => {
    // Someone who typed a term wants what best answers it, not what happens to
    // be newest - ordering by date is what made a query for "iphone" lead with
    // whatever was posted an hour ago and merely mentions one.
    const next = { ...EMPTY_SEARCH_FILTERS, q: term, sort: 'relevance' };
    setSearchFilters(next);
    setCurrentView('search');
    // Push before the query string goes on: searching is a navigation, and
    // replacing here would consume the page you searched from, so Back out of
    // the results would skip straight past it.
    updateUrl('search');
    syncSearchUrl(next);
  };

  /** A category suggestion browses that category rather than text-searching it. */
  const handleSearchCategory = (categoryId: string) => {
    const next = { ...EMPTY_SEARCH_FILTERS, categoryId };
    setSearchFilters(next);
    setFeedQuery('');
    setCurrentView('search');
    updateUrl('search');
    syncSearchUrl(next);
  };

  /**
   * Show the reduced listings.
   *
   * Lands on the feed rather than the results page, because the deals view IS
   * the feed with one filter on - see parsePathname. Anything else narrowing
   * the feed is cleared first: someone asking for deals from the search box
   * means "show me the deals", not "show me the deals among the shoes I was
   * looking at twenty minutes ago".
   */
  const handleShowDeals = () => {
    setFeedQuery('');
    setFeedType('All');
    setFeedCategoryId('');
    setFeedDealsOnly(true);
    setCurrentView('browse');
    updateUrl('browse');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * Turns the filters currently on screen into a standing alert.
   *
   * <p>Resolves to whether it stuck, so the button confirms what happened
   * rather than assuming. "Already saved" is reported as success: the person
   * asked to be told when one appears, and they will be - saying so is more
   * useful than an error about a duplicate they cannot see.
   */
  const handleSaveSearch = async (filters: {
    query?: string; type?: string; categoryId?: string;
    campusZone?: string; minPrice?: number; maxPrice?: number;
  }): Promise<boolean> => {
    const res = await api.savedSearches.create(filters);
    if (res.success) {
      toast.success("We'll notify you when something matches.", { title: 'Search saved' });
      return true;
    }
    if (res.code === 'ALREADY_SAVED') {
      toast.info("You're already watching this search.", { title: 'Already saved' });
      return true;
    }
    toast.error(res.error || 'Could not save that search.');
    return false;
  };

  /** Suggestion rows jump straight to the listing, skipping the results page. */
  const handleOpenListingById = async (listingId: string) => {
    const existing = listings.find((l) => l.id === listingId);
    if (existing) {
      handleSelectListing(existing);
      return;
    }
    const res = await api.listings.getById(listingId);
    if (res.listing) handleSelectListing(res.listing);
  };

  /** Resolves to whether a real session came back, so callers can skip the
   *  signed-in-only fetches rather than firing them and eating a 401. */
  /**
   * @param registerPush re-register this device's FCM token as well. Belongs to
   *        arriving and to signing in, NOT to the routine count refresh:
   *        registering is a write, every write announces itself so the counts
   *        can catch up, and a refresh that writes would call itself forever.
   */
  const loadServerSession = async (
    { registerPush = false }: { registerPush?: boolean } = {},
  ): Promise<AuthSession | null> => {
    try {
      const res = await api.auth.getMe();
      if (res.user) {
        setCurrentUser(res.user);
        setUnreadMessages(res.raw?.unreadMessages ?? 0);
        setUnreadNotifications(res.raw?.unreadNotifications ?? 0);
        if (res.isAuthenticated) {
          // Silent re-registration: FCM rotates tokens on its own schedule, and
          // a stale one means notifications stop arriving with no visible cause.
          // No-ops unless this device already has permission.
          if (registerPush) refreshToken();

          /*
           * Fulfil the route this load was actually for.
           *
           * A protected URL opens on the feed while the session resolves,
           * because until it does we cannot know whether the visitor may see
           * it. That was only ever meant to be a holding position, but nothing
           * released it unless a login modal happened to complete - so an
           * already-signed-in person following a link to /cart, /orders or
           * /messages, or simply refreshing one of those pages, silently
           * landed on the home feed instead.
           */
          setPendingRoute((route) => {
            if (!route) return null;
            const blockedForAdmin =
              res.user.role === 'admin' && ADMIN_BLOCKED_VIEWS.includes(route);
            if (!blockedForAdmin) {
              setCurrentView(route);
              // replace, not push: this IS the entry the browser already has.
              // The id comes from the landing ref rather than the address bar,
              // which the feed has already overwritten by now.
              updateUrl(route, undefined, undefined, true, landingOrderId.current);
            }
            return null;
          });
        }
        return res.isAuthenticated ? res.user : null;
      }
    } catch (e) {
      console.error('Failed to load session from server', e);
    } finally {
      // Resolved covers "no session", not just "a session": a guest whose
      // request 401s has still been identified, and is owed the guest tour.
      setSessionResolved(true);
    }
    return null;
  };

  /**
   * Sends a notification's link somewhere the router understands. Notifications
   * are the one place in the app where a link can point at anything - a thread,
   * an order, a listing that may since have been removed - so the parsing lives
   * here rather than in each screen that renders one.
   */
  const handleNotificationLink = (link: string) => {
    // Message links carry a conversation id the inbox resolves itself.
    const path = link.startsWith('/messages/') ? '/messages' : link;
    const parsed = parsePathname(path);

    if (parsed.view === 'detail' && parsed.listingId) {
      handleOpenListingById(parsed.listingId);
      return;
    }
    if (parsed.view === 'notFound') {
      handleNavigate('notifications');
      return;
    }
    if (parsed.sellerId) setSelectedSellerId(parsed.sellerId);
    // An order notification names its order, so it opens that order rather
    // than dropping the reader into a list to go and find it themselves.
    if (parsed.orderId) {
      handleOpenOrder(parsed.orderId);
      return;
    }
    handleNavigate(parsed.view);
  };

  /** Opens one order's detail view, from a notification or from the list. */
  const handleOpenOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    if (currentUser.role === 'guest') {
      setPendingRoute('orders');
      setIsAuthModalOpen(true);
      return;
    }
    setCurrentView('orders');
    updateUrl('orders', undefined, undefined, false, orderId);
  };

  const loadServerListings = async () => {
    const route = parsePathname(window.location.pathname);
    try {
      const res = await api.listings.getAll();
      if (res.listings && res.listings.length > 0) {
        setListings(res.listings);
      }

      /*
       * Resolving the routed listing is NOT conditional on the feed having
       * come back with something. It used to sit inside that check, so a
       * shared link opened against an empty or unreachable catalogue skipped
       * the lookup entirely and left the detail view with nothing to render -
       * for good, since nothing retried.
       */
      if (route.listingId) {
        const match = res.listings?.find((l) => l.id === route.listingId);
        if (match) {
          setSelectedListing(match);
          setDetailUnreachable(false);
          return;
        }
        /*
         * The feed is one page of active listings, so a perfectly good link -
         * a sold item, something on page three, a listing shared from a
         * search - is routinely not in it. Fetch it by id rather than
         * treating "not in the feed" as "does not exist".
         */
        const single = await api.listings.getById(route.listingId);
        if (single.listing) {
          setSelectedListing(single.listing);
          setDetailUnreachable(false);
        } else if (single.status === 404) {
          handleNavigate('notFound');
        } else {
          /*
           * Anything else - a dead connection, a 500, the 502 a proxy returns
           * when the API is down - says nothing about whether this listing
           * exists. Only a 404 does. Answering "page not found" to a
           * perfectly good shared link because the backend was restarting is
           * a lie that sends people away for good.
           */
          setDetailUnreachable(true);
        }
        return;
      }

      if (!selectedListing && res.listings && res.listings.length > 0) {
        setSelectedListing(res.listings[0]);
      }
    } catch (e) {
      console.error('Failed to load listings', e);
      if (route.listingId) setDetailUnreachable(true);
    }
  };

  const loadServerCart = async () => {
    try {
      const res = await api.cart.getAll();
      setCartCount(res.count ?? 0);
    } catch (e) {
      setCartCount(0);
    }
  };

  const loadSavedListings = async () => {
    try {
      const res = await api.saved.getAll();
      setSavedListings(res.saved ?? []);
    } catch (e) {
      setSavedListings([]);
    }
  };

  /**
   * Fills a guest's saved page.
   *
   * <p>There is no server-side list to fetch for someone with no account, so
   * the ids held on the device are resolved one by one - the same approach the
   * feed's "Continue browsing" row takes for recently-viewed. Deliberately not
   * filtered out of the loaded catalogue instead: that is one page of active
   * listings, so a save made last week, or one now on page three, would
   * silently vanish from a list that is supposed to be everything they kept.
   *
   * <p>Anything since removed or sold is dropped rather than rendered as a
   * broken row, and the ids stay on the device - a listing that is merely
   * unreachable right now is not the same as one the person unsaved.
   */
  const loadGuestSaves = async () => {
    const ids = getGuestSaves();
    if (ids.length === 0) {
      setSavedListings([]);
      return;
    }
    const results = await Promise.all(ids.map((id) => api.listings.getById(id)));
    setSavedListings(
      results.map((r) => r.listing).filter((l): l is Listing => !!l).map((l) => ({ ...l, isSaved: true })),
    );
  };

  /**
   * Hands a guest's device-held saves to the account that just appeared.
   *
   * <p>Runs once per sign-in, before the saved list is loaded, so the Saved
   * page's first render already includes them rather than filling in a moment
   * later. `api.saved.toggle` is a toggle, so anything the account had already
   * saved is skipped - blindly toggling would UN-save exactly the items most
   * likely to be in both lists.
   *
   * <p>Failures are deliberately quiet. Losing a device-held shortlist is a
   * disappointment, not an error the person can do anything about, and a red
   * banner on the first screen after signing up is a worse first impression
   * than a shortlist that is one item short.
   */
  const mergeGuestSaves = async () => {
    const pending = takeGuestSaves();
    if (pending.length === 0) return;
    try {
      const existing = await api.saved.getAll();
      const already = new Set((existing.saved ?? []).map((l: Listing) => l.id));
      await Promise.all(
        pending.filter((id) => !already.has(id)).map((id) => api.saved.toggle(id)),
      );
    } catch {
      /* The saves are gone either way; nothing here is recoverable. */
    }
  };

  // Consumes ?token= from an emailed verification or reset link, then scrubs it
  // out of the address bar so the token is not left sitting in history.
  const consumeEmailLinkToken = async () => {
    const path = window.location.pathname.replace(/\/$/, '');
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;

    if (path === '/verify-email') {
      const res = await api.auth.verifyEmail(token);
      window.history.replaceState({}, '', '/browse');
      if (res.ok) {
        await loadServerSession({ registerPush: true });
        await loadServerListings();
        // Verifying by email is a sign-in like any other, so anything hearted
        // before the account existed comes across here too.
        await mergeGuestSaves();
        await loadSavedListings();
        await loadServerCart();
      } else {
        setAuthModalMode('verify');
        setIsAuthModalOpen(true);
      }
    } else if (path === '/reset-password') {
      window.history.replaceState({}, '', '/browse');
      setResetToken(token);
      setAuthModalMode('reset');
      setIsAuthModalOpen(true);
    }
  };

  useEffect(() => {
    /*
     * The cart and the saved list belong to a session, so they wait for one.
     * Firing them alongside the session check meant every guest page load made
     * two requests that could only ever come back 401, and logged two console
     * errors for a state that is perfectly normal - not being signed in.
     */
    // Independent of the session check: a guest's saves are on the device, so
    // there is nothing to wait for and the list should be there the moment
    // they open it.
    if (getGuestSaves().length > 0) loadGuestSaves();

    loadServerSession({ registerPush: true }).then((session) => {
      /*
       * Signed in is not enough: an admin has no cart and no saved list by
       * design, so loading a page as one asked for both and collected a 403
       * apiece. The session we just fetched already says which kind of
       * account this is - no need to ask again.
       */
      if (!session || session.role === 'admin') return;
      loadServerCart();
      loadSavedListings();
    });
    loadServerListings();
    consumeEmailLinkToken();
    // Category links for the desktop nav strip. Only ones with listings behind
    // them - an empty chip is a dead end.
    api.categories.getAll().then((res) => {
      const list = (res.categories as (CategoryLink & { listingCount: number })[]) || [];
      setNavCategories(list.filter((c) => c.listingCount > 0).slice(0, 6));
    });

    const handlePopState = () => {
      // One of ours was consumed. Never below zero: a forward navigation
      // undercounts, which only means Back falls through to Home - the safe
      // direction to be wrong in, since the alternative leaves the site.
      pushedEntries.current = Math.max(0, pushedEntries.current - 1);
      const parsed = parsePathname(window.location.pathname);
      // Re-use handleNavigate to enforce RBAC on back/forward navigation.
      // We read currentUser from the ref so we always have the latest value.
      handleNavigateRef.current(parsed.view, true);
      if (parsed.sellerId) setSelectedSellerId(parsed.sellerId);
      // Back out of an order's detail view returns to the list, so the id has
      // to be cleared as well as set.
      setSelectedOrderId(parsed.orderId);
      if (parsed.listingId) {
        setListings((latest) => {
          const found = latest.find((l) => l.id === parsed.listingId);
          if (found) {
            setSelectedListing(found);
          } else {
            /*
             * Not in the loaded feed. Leaving `selectedListing` alone would
             * render the PREVIOUS listing under this listing's URL - the exact
             * wrong-item-at-the-right-address failure the initial load already
             * guards against. Clearing it first hands the page to the skeleton
             * for the length of the fetch, which is honest about not knowing
             * yet rather than briefly asserting the wrong thing.
             */
            setSelectedListing(null);
            setDetailUnreachable(false);
            api.listings.getById(parsed.listingId!).then((res) => {
              if (res.listing) setSelectedListing(res.listing);
              // Same rule as the initial load: only a 404 means "gone".
              else if (res.status === 404) handleNavigateRef.current('notFound');
              else setDetailUnreachable(true);
            });
          }
          return latest;
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Drives the queue badges in the admin sidebar. One stats call covers all
  // three, so it refetches per view change rather than polling three endpoints.
  useEffect(() => {
    if (currentUser.role !== 'admin') {
      setPendingReports(0);
      setPendingSellers(0);
      setHeldOrders(0);
      return;
    }
    api.admin.getStats().then((res) => {
      setPendingReports(res.pendingReports ?? 0);
      setPendingSellers(res.pendingSellers ?? 0);
      setHeldOrders(res.heldOrders ?? 0);
    });
  }, [currentUser.role, currentView, activeAdminTab]);

  /**
   * Re-reads every number the chrome displays.
   *
   * <p>The session payload carries unread messages, unread notifications and
   * the seller's open-order count; the admin queues come from one stats call;
   * cart and saved are their own lists. Which of those are fetched depends on
   * who is looking - an admin has no cart to count, and asking for one would
   * be a guaranteed 403 every thirty seconds.
   */
  const refreshCounts = async () => {
    if (currentUser.role === 'guest') return;

    await loadServerSession();

    if (currentUser.role === 'admin') {
      const res = await api.admin.getStats();
      setPendingReports(res.pendingReports ?? 0);
      setPendingSellers(res.pendingSellers ?? 0);
      setHeldOrders(res.heldOrders ?? 0);
      return;
    }
    loadServerCart();
    loadSavedListings();
  };

  useLiveCounts({
    enabled: currentUser.role !== 'guest',
    refresh: refreshCounts,
  });

  const handleSessionChange = (newSession: AuthSession) => {
    setCurrentUser(newSession);
    loadServerListings();

    /*
     * Cart and saved belong to a shopping account, so only one is asked for
     * them. This used to fetch both for whoever had just signed in: a guest
     * got two 401s, and an admin - who has no cart by design - got two 403s,
     * every single time the session changed. Same rule the routine refresh
     * already follows.
     */
    if (newSession.role !== 'guest' && newSession.role !== 'admin') {
      loadServerCart();
      // Sequential on purpose: the merge has to finish before the list is
      // read, or the Saved page renders without the items this person
      // hearted moments ago as a guest and looks like it lost them.
      mergeGuestSaves().then(loadSavedListings);
      /* The trail that brought them here comes too. Signing up should not
         empty "Continue browsing" as its first act. */
      mergeGuestHistory(newSession.id);
      mergeGuestIntent(newSession.id);
    }
    // Signing in is the other moment this device's push token should be
    // (re)registered, now that the routine refresh no longer does it.
    if (newSession.role !== 'guest') refreshToken();
    if (newSession.role === 'admin') {
      setCurrentView('admin');
      updateUrl('admin');
    } else if (currentView === 'admin') {
      // If user had a pending protected route, redirect there after login
      const target = pendingRoute || 'browse';
      setPendingRoute(null);
      setCurrentView(target);
      updateUrl(target);
    } else if (pendingRoute) {
      // Logged-in as customer: fulfil the pending route
      setCurrentView(pendingRoute);
      updateUrl(pendingRoute);
      setPendingRoute(null);
    }
  };

  const handleAddToCart = async (listing: Listing, options?: AddToCartOptions) => {
    options?.event?.stopPropagation();
    const quantity = Math.max(1, Math.floor(options?.quantity ?? 1));

    if (currentUser.role === 'guest') {
      setIsAuthModalOpen(true);
      return;
    }

    if (currentUser.role === 'admin') {
      toast.info('Admins do not have a cart. Use a customer account to shop.', {
        title: 'Not available for admins',
      });
      return;
    }

    try {
      // Only the listing id travels: price, title and seller are resolved
      // server-side so a tampered client cannot invent a cheaper line item.
      const res = await api.cart.add({ listingId: listing.id, quantity });

      if (res.success) {
        await loadServerCart();
        toast.success(`${quantity > 1 ? `${quantity} × ` : ''}"${listing.title}" added to your cart.`, {
          action: { label: 'View cart', onClick: () => handleNavigate('cart') },
        });
        return true;
      }
      toast.error(res.error || 'Could not add that item to your cart.');
      return false;
    } catch (err) {
      console.error('Add to cart failed', err);
      toast.error('Could not add that item to your cart.');
      return false;
    }
  };

  // Toggle Save item (heart icon)
  const handleToggleSave = async (listingId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    /*
     * A guest's saves live on the device until there is an account to put them
     * on. Opening the login modal here used to be the entire response, which
     * asked someone to commit to an account at the moment they were still
     * deciding whether anything here was worth having - and threw away the
     * shortlist that would have been the reason to come back. They are handed
     * over on sign-in; see mergeGuestSaves.
     */
    if (currentUser.role === 'guest') {
      const nowSaved = toggleGuestSave(listingId);
      setListings((prev) =>
        prev.map((item) => (item.id === listingId ? { ...item, isSaved: nowSaved } : item)),
      );
      if (selectedListing && selectedListing.id === listingId) {
        setSelectedListing({ ...selectedListing, isSaved: nowSaved });
      }
      // Resolved from the device list rather than patched in place, so the
      // saved page is right even for a listing the loaded catalogue does not
      // happen to contain.
      loadGuestSaves();
      if (nowSaved) {
        toast.info('Saved on this device. Sign in to keep it.', { title: 'Saved' });
      }
      return;
    }

    // Enforce Rule: Admin cannot silently act as customer
    if (currentUser.role === 'admin') {
      toast.info('Admins cannot save listings. Use a customer account instead.', {
        title: 'Not available for admins',
      });
      return;
    }

    // Optimistic flip, then reconcile against what the server actually stored.
    setListings((prev) =>
      prev.map((item) => (item.id === listingId ? { ...item, isSaved: !item.isSaved } : item))
    );
    if (selectedListing && selectedListing.id === listingId) {
      setSelectedListing({ ...selectedListing, isSaved: !selectedListing.isSaved });
    }

    const res = await api.saved.toggle(listingId);
    if (!res.success) {
      // Roll the optimistic change back if the server refused it.
      setListings((prev) =>
        prev.map((item) => (item.id === listingId ? { ...item, isSaved: !item.isSaved } : item))
      );
      if (selectedListing && selectedListing.id === listingId) {
        setSelectedListing({ ...selectedListing, isSaved: !selectedListing.isSaved });
      }
      return;
    }

    setListings((prev) =>
      prev.map((item) => (item.id === listingId ? { ...item, isSaved: res.isSaved } : item))
    );
    await loadSavedListings();
  };

  /**
   * Move a cart line to Saved.
   *
   * `api.saved.toggle` is a toggle, so calling it blindly would UN-save an item
   * the person had already hearted - "save for later" quietly doing the exact
   * opposite. The saved list is already loaded here for the Saved page, so this
   * checks it first and only writes when there is something to write.
   *
   * Returns whether the item is saved afterwards, which is what the cart needs
   * to know before it removes the row.
   */
  const handleSaveForLater = async (listingId: string): Promise<boolean> => {
    if (savedListings.some((l) => l.id === listingId)) return true;
    const res = await api.saved.toggle(listingId);
    if (!res.success) return false;
    await loadSavedListings();
    // A toggle that came back "not saved" means we raced someone and undid it.
    return res.isSaved;
  };

  // Publish new listing from SellScreen. The payload is already in API shape;
  // the server assigns the seller from the session, never from the client.
  const handlePublishListing = async (payload: Record<string, unknown>) => {
    const res = await api.listings.create(payload);
    if (res.success && res.listing) {
      setListings((prev) => [res.listing!, ...prev]);
      setSelectedListing(res.listing!);
      setEditingListing(null);
      setCurrentView('detail');
      updateUrl('detail', res.listing!.id);
      // Re-check session from server so hasActiveListings updates immediately to unlock Seller Nav
      await loadServerSession();
    } else {
      toast.error(res.error || 'Could not publish your listing.');
    }
  };

  const handleSaveEditedListing = async (id: string, payload: Record<string, unknown>) => {
    const res = await api.listings.update(id, payload);
    if (res.success && res.listing) {
      setListings((prev) => prev.map((l) => (l.id === id ? res.listing! : l)));
      setSelectedListing(res.listing!);
      setEditingListing(null);
      toast.success('Listing updated.');

      // An admin is working through a catalogue, not admiring one listing;
      // send them back to the list they were moderating from.
      if (currentUser.role === 'admin') {
        setActiveAdminTab('listings');
        handleNavigate('admin');
        return;
      }
      setCurrentView('detail');
      updateUrl('detail', id);
    } else {
      toast.error(res.error || 'Could not save your changes.');
    }
  };

  const handleEditListing = (listing: Listing) => {
    setEditingListing(listing);
    setCurrentView('sell');
    updateUrl('sell');
  };

  // Open listing detail screen
  const handleSelectListing = (listing: Listing) => {
    // Feeds the Home page's "Continue browsing" row. Recorded here rather than
    // in the detail screen so every route into a listing counts.
    recordRecentlyViewed(currentUser.id, listing.id);
    setSelectedListing(listing);
    setCurrentView('detail');
    updateUrl('detail', listing.id);
  };

  // Open Seller Profile view
  const handleViewSellerProfile = (sellerId: string) => {
    setSelectedSellerId(sellerId);
    setCurrentView('profile');
    updateUrl('profile', undefined, sellerId);
  };

  /*
   * Open Chat from a listing.
   *
   * The caller has usually just created (or found) the conversation and knows
   * its id, so it travels with the request. Without it the inbox opens whatever
   * thread happens to sort first, which is the wrong seller as soon as you have
   * more than one - "Chat Seller" has to open THAT seller.
   */
  const handleOpenChat = (listing: Listing, conversationId?: string) => {
    if (currentUser.role === 'guest') {
      setIsAuthModalOpen(true);
      return;
    }
    if (currentUser.role === 'admin') {
      toast.info('Admins cannot message as a customer. Use a customer account instead.', {
        title: 'Not available for admins',
      });
      return;
    }
    setOpenConversationId(conversationId);
    setMessagesTab('chat');
    setCurrentView('messages');
    updateUrl('messages');
  };

  /*
   * Route & Navigation access check handler (Page/Route Access Matrix).
   *
   * `fromHistory` marks the call as coming from a back/forward press, where the
   * browser has ALREADY set the address bar. Writing to it again from here
   * pushed a fresh entry built from the state we were leaving, so Back moved
   * the page one step while the URL stayed put (and grew the stack instead of
   * consuming it). History navigations read the URL; they never write it.
   */
  const handleNavigate = (targetView: ViewType, fromHistory = false) => {
    // 1. Guest Restrictions -> Show modal prompt, remember pending route
    if (currentUser.role === 'guest' && GUEST_PROTECTED_VIEWS.includes(targetView)) {
      setPendingRoute(targetView);
      setIsAuthModalOpen(true);
      return;
    }

    // 2. Admin Restrictions -> Rule 5: Admins cannot silently act as customers
    if (currentUser.role === 'admin' && ADMIN_BLOCKED_VIEWS.includes(targetView)) {
      toast.info('That section is for customer accounts. The Admin Console is over here.', {
        title: 'Not available for admins',
      });
      // Restore the URL to the admin view since the blocked navigation didn't happen
      updateUrl('admin', undefined, undefined, true);
      return;
    }

    // 3. Not (yet) allowed to sell. The modal covers all three cases - never
    //    applied, waiting on an admin, previously refused - and explains which
    //    one they are in rather than silently refusing.
    if (targetView === 'sell' && !canSell(currentUser)) {
      setIsBecomeSellerOpen(true);
      return;
    }

    // On a history navigation the seller id comes from the URL, and the
    // popstate handler sets it - clearing it here would blank the profile the
    // person just pressed Back onto.
    if (targetView === 'profile' && !fromHistory) {
      setSelectedSellerId(undefined);
    }

    /*
     * Navigating to Sell always means "list something new".
     *
     * Only handleEditListing puts the screen into edit mode, and it sets the
     * view itself rather than coming through here. Without this, an edit left
     * by any route other than the screen's own Back button stayed pending: tap
     * Edit on a listing, tap Sell in the nav, and the form came up holding
     * that listing's photos, title and price, still in edit mode. It read as a
     * blank new listing, and saving it overwrote the one being edited.
     *
     * Safe on a history navigation too - the /sell URL carries no listing id,
     * so there is no edit for Back to land on.
     */
    if (targetView === 'sell') {
      setEditingListing(null);
    }

    // Leaving Orders spends the hint the caller set on the way in. Anyone who
    // comes back later, by their own route, gets the ordinary default again.
    if (targetView !== 'orders') {
      setOrdersInitialSide(undefined);
    }
    setCurrentView(targetView);
    if (fromHistory) return;
    updateUrl(targetView, selectedListing?.id, targetView === 'profile' ? selectedSellerId : undefined);
  };

  // Stable ref so the popstate handler always calls the latest handleNavigate
  // without needing to re-register the event listener.
  const handleNavigateRef = React.useRef(handleNavigate);
  React.useEffect(() => {
    handleNavigateRef.current = handleNavigate;
  });

  const handleNotificationLinkRef = React.useRef(handleNotificationLink);
  React.useEffect(() => {
    handleNotificationLinkRef.current = handleNotificationLink;
  });

  /**
   * Push while the app is open, and taps on push while it is not.
   *
   * The service worker only renders notifications that arrive in the background.
   * With the tab in front, an OS banner over a window the user is already
   * looking at is noise, so the same payload becomes a toast with the badge
   * counts refreshed behind it. Registered once - the handlers reach the latest
   * state through refs rather than re-subscribing on every render.
   */
  useEffect(() => {
    const stopForeground = onForegroundPush((push) => {
      loadServerSession();
      // Claim the id first: the poller runs on its own clock and would
      // otherwise announce this same notification again moments later.
      markNotificationSeenRef.current(push.notificationId);
      toast.info(push.body, {
        title: push.title,
        action: { label: 'View', onClick: () => handleNotificationLinkRef.current(push.link) },
      });
    });
    const stopClick = onNotificationClick((link) => handleNotificationLinkRef.current(link));
    return () => {
      stopForeground();
      stopClick();
    };
  }, []);

  /**
   * Order notifications toast whether or not push is switched on.
   *
   * Push covers the case where the browser has permission and a live token;
   * this covers everyone else, which in practice is most sellers. Both paths
   * share one set of already-seen ids, so an order announces itself once.
   */
  const { markSeen: markNotificationSeen } = useOrderToasts({
    enabled: currentUser.role !== 'guest',
    onNotification: (n) => {
      setUnreadNotifications((c) => c + 1);
      toast.info(n.message, {
        title: n.title,
        duration: 8000,
        action: {
          label: 'View order',
          onClick: () => handleNotificationLinkRef.current(n.link || '/orders'),
        },
      });
    },
  });

  const markNotificationSeenRef = React.useRef(markNotificationSeen);
  React.useEffect(() => {
    markNotificationSeenRef.current = markNotificationSeen;
  });

  const handleLogout = async () => {
    await api.auth.logout();
    setCurrentUser({
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
    setSavedListings([]);
    setCartCount(0);
    setCurrentView('browse');
    updateUrl('browse');
    loadServerListings();
  };

  return (
    <OnboardingProvider
      user={currentUser}
      view={currentView}
      cartCount={cartCount}
      savedCount={savedListings.length}
      ready={sessionResolved}
    >
      <div className="min-h-screen bg-[#f8f9ff] text-slate-800 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
        {/* Dev/Test RBAC Role Banner & Instant Tester Switcher */}
        {/* <RoleSwitcherBar
        currentUser={currentUser}
        onSessionChange={handleSessionChange}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      /> */}

        {/*
        Two entirely separate shells rather than one bar that mutates. Admin gets
        a desaturated sidebar tool; everyone else gets the shopping chrome. They
        never blend, so the current mode is unmistakable (design principle 4).
        items-start keeps the sidebar at its own height so it can stick.
      */}
        <div className="flex flex-1 items-start">
          {currentUser.role === 'admin' && (
            <AdminSidebar
              activeTab={activeAdminTab}
              onTabChange={(tab) => { setActiveAdminTab(tab); handleNavigate('admin'); }}
              onExitAdmin={handleLogout}
              currentUser={currentUser}
              pendingReports={pendingReports}
              pendingSellers={pendingSellers}
              heldOrders={heldOrders}
              unreadChats={unreadMessages}
            />
          )}

          <div className="flex-1 min-w-0 min-h-screen flex flex-col">
            {currentUser.role === 'admin' ? (
              <AdminHeader
                activeTab={activeAdminTab}
                onTabChange={(tab) => { setActiveAdminTab(tab); handleNavigate('admin'); }}
                onExitAdmin={handleLogout}
                currentUser={currentUser}
                pendingReports={pendingReports}
                pendingSellers={pendingSellers}
                heldOrders={heldOrders}
                unreadChats={unreadMessages}
              />
            ) : (
              <TopNav
                currentView={currentView}
                onNavigate={handleNavigate}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
                onLogout={handleLogout}
                currentUser={currentUser}
                savedCount={savedListings.length}
                cartCount={cartCount}
                unreadMessagesCount={unreadMessages}
                unreadNotificationsCount={unreadNotifications}
                searchQuery={feedQuery}
                onSearchChange={setFeedQuery}
                feedType={feedType}
                onFeedTypeChange={setFeedType}
                categoryId={feedCategoryId}
                onCategoryChange={setFeedCategoryId}
                categories={navCategories}
                onSubmitSearch={handleSubmitSearch}
                onOpenListingById={handleOpenListingById}
                onSearchCategory={handleSearchCategory}
                onShowDeals={handleShowDeals}
              />
            )}

            {/* Main Content Area */}
            <main className="flex-1">
              {currentView === 'search' && (
                <SearchScreen
                  filters={searchFilters}
                  onFiltersChange={(next) => { setSearchFilters(next); syncSearchUrl(next); }}
                  onSelectListing={handleSelectListing}
                  onToggleSave={handleToggleSave}
                  onBack={handleBack}
                  currentUser={currentUser}
                  onAddToCart={handleAddToCart}
                  listings={listings}
                  onGoHome={() => handleNavigate('browse')}
                />
              )}

              {currentView === 'browse' && (
                <BrowseScreen
                  listings={listings}
                  onSelectListing={handleSelectListing}
                  onToggleSave={handleToggleSave}
                  onNavigateToSell={() => handleNavigate('sell')}
                  onAddToCart={handleAddToCart}
                  onOpenChat={handleOpenChat}
                  currentUser={currentUser}
                  searchQuery={feedQuery}
                  onSearchChange={setFeedQuery}
                  feedType={feedType}
                  onFeedTypeChange={setFeedType}
                  categoryId={feedCategoryId}
                  onCategoryChange={setFeedCategoryId}
                  dealsOnly={feedDealsOnly}
                  onDealsOnlyChange={setFeedDealsOnly}
                  onBrowseCategories={() => handleNavigate('categories')}
                  /* Withheld from guests: an alert needs an account to be
                     delivered to, so the button is simply not offered rather
                     than offered and then refused. */
                  onSaveSearch={currentUser.role === 'customer' ? handleSaveSearch : undefined}
                />
              )}

              {/* A shared link lands here with nothing loaded yet. The page has
                to say so - it used to render as a blank band between the nav
                and the footer for as long as the fetch took. */}
              {currentView === 'detail' && !selectedListing && (
                detailUnreachable ? (
                  <DetailUnavailable
                    onRetry={() => { setDetailUnreachable(false); loadServerListings(); }}
                    onGoHome={() => handleNavigate('browse')}
                  />
                ) : (
                  <DetailSkeleton />
                )
              )}

              {currentView === 'detail' && selectedListing && (
                <DetailScreen
                  listing={selectedListing}
                  similarListings={listings}
                  onBack={handleBack}
                  onToggleSave={handleToggleSave}
                  onSelectSimilar={handleSelectListing}
                  onOpenChat={handleOpenChat}
                  onViewSellerProfile={handleViewSellerProfile}
                  currentUser={currentUser}
                  onOpenAuthModal={() => setIsAuthModalOpen(true)}
                  onListingDeleted={() => {
                    loadServerListings();
                    // Not handleBack: the page behind might be this same listing,
                    // and going back to something that no longer exists is worse
                    // than going somewhere that does.
                    setSelectedListing(null);
                    handleNavigate('browse');
                  }}
                  onAddToCart={handleAddToCart}
                  onEditListing={handleEditListing}
                  onGoHome={() => handleNavigate('browse')}
                  onViewAllSimilar={(item) => {
                    // The narrowest true description of "more like this": its own
                    // category when it has one, otherwise its type.
                    const next: SearchFilters = {
                      ...EMPTY_SEARCH_FILTERS,
                      categoryId: item.categoryId || '',
                      type: item.categoryId ? 'All' : (item.category as SearchFilters['type']),
                    };
                    setSearchFilters(next);
                    setCurrentView('search');
                    updateUrl('search');
                    syncSearchUrl(next);
                  }}
                />
              )}

              {currentView === 'sell' && (
                <SellScreen
                  /*
                   * Every field is seeded from `editingListing` in a useState
                   * initialiser, which runs once. Keying on the listing forces a
                   * fresh form whenever the target changes - including edit ->
                   * new, which happens in place when Sell is tapped from the
                   * nav while an edit is already open and so never unmounts.
                   */
                  key={editingListing?.id ?? 'new'}
                  onBack={() => {
                    setEditingListing(null);
                    // An admin came from the catalogue screen and should land back
                    // on it, not be dropped into the shopper's feed mid-task.
                    if (currentUser.role === 'admin') {
                      setActiveAdminTab('listings');
                      handleNavigate('admin');
                      return;
                    }
                    if (editingListing) {
                      setCurrentView('detail');
                      updateUrl('detail', editingListing.id);
                      return;
                    }
                    handleNavigate('browse');
                  }}
                  onPublishListing={handlePublishListing}
                  onSaveEdit={handleSaveEditedListing}
                  editingListing={editingListing}
                  currentUser={currentUser}
                  onListingDeleted={() => {
                    setEditingListing(null);
                    setSelectedListing(null);
                    loadServerListings();
                    handleNavigate('browse');
                  }}
                />
              )}

              {currentView === 'profile' && (
                <ProfileScreen
                  listings={listings}
                  onBack={handleBack}
                  onSelectListing={handleSelectListing}
                  onNavigateToSell={() => handleNavigate('sell')}
                  onOpenChatWithSeller={() => {
                    setOpenConversationId(undefined);
                    setMessagesTab('chat');
                    handleNavigate('messages');
                  }}
                  initialSellerId={selectedSellerId}
                  currentUser={currentUser}
                  onOpenAuthModal={() => setIsAuthModalOpen(true)}
                  onNavigateToSaved={() => handleNavigate('saved')}
                  onNavigateToOrders={() => handleNavigate('orders')}
                  onProfileUpdated={loadServerSession}
                  onLogout={handleLogout}
                />
              )}

              {currentView === 'saved' && (
                <SavedScreen
                  savedListings={savedListings}
                  onSelectListing={handleSelectListing}
                  onRemoveSaved={(id) => handleToggleSave(id)}
                  onBrowseMore={() => handleNavigate('browse')}
                  onAddToCart={handleAddToCart}
                  currentUser={currentUser}
                  onSignIn={() => setIsAuthModalOpen(true)}
                />
              )}

              {currentView === 'categories' && (
                <CategoriesScreen
                  onBack={handleBack}
                  onSelectCategory={(id) => {
                    /* Straight into the feed with that category applied, rather
                       than a category-shaped screen of its own: one grid to
                       maintain, and every other filter still works from there. */
                    setFeedQuery('');
                    setFeedType('All');
                    setFeedDealsOnly(false);
                    setFeedCategoryId(id);
                    handleNavigate('browse');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onSelectType={(type) => {
                    setFeedQuery('');
                    setFeedCategoryId('');
                    setFeedDealsOnly(false);
                    setFeedType(type);
                    handleNavigate('browse');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              )}

              {currentView === 'messages' && (
                <MessagesScreen
                  initialTab={messagesTab}
                  initialConversationId={openConversationId}
                  onBack={handleBack}
                  onViewListing={handleOpenListingById}
                />
              )}

              {currentView === 'admin' && (
                <Suspense fallback={<ScreenLoading />}>
                  <AdminScreen
                    currentUser={currentUser}
                    activeTab={activeAdminTab}
                    onTabChange={setActiveAdminTab}
                    onNavigateToSell={() => { setEditingListing(null); handleNavigate('sell'); }}
                    onViewListing={handleSelectListing}
                    onEditListing={handleEditListing}
                    onExitAdmin={() => handleNavigate('browse')}
                  />
                </Suspense>
              )}

              {currentView === 'support' && (
                <SupportScreen
                  onBackToBrowse={handleBack}
                  currentUser={currentUser}
                />
              )}

              {currentView === 'cart' && (
                <CartScreen
                  onBack={handleBack}
                  onExplore={() => handleNavigate('browse')}
                  onCartUpdated={loadServerCart}
                  onGoToMessages={() => handleNavigate('messages')}
                  onGoToOrders={() => {
                    // They just checked out, so it is the order they placed
                    // they want - not the ones they have received.
                    setOrdersInitialSide('placed');
                    handleNavigate('orders');
                  }}
                  onSaveForLater={handleSaveForLater}
                  onGoToSaved={() => handleNavigate('saved')}
                  onGoToProfile={() => handleNavigate('profile')}
                  currentUser={currentUser}
                />
              )}

              {currentView === 'deals' && (
                <DealsScreen
                  onBack={handleBack}
                  onExplore={() => handleNavigate('browse')}
                />
              )}

              {currentView === 'notifications' && (
                <NotificationsScreen
                  onBack={handleBack}
                  onNavigateToLink={handleNotificationLink}
                />
              )}

              {currentView === 'my-listings' && (
                <MyListingsScreen
                  onBack={handleBack}
                  onNavigateToSell={() => handleNavigate('sell')}
                  onSelectListing={handleSelectListing}
                  onEditListing={handleEditListing}
                  onListingsChanged={() => {
                    loadServerListings();
                    loadServerSession();
                  }}
                />
              )}

              {currentView === 'orders' && (
                <OrdersScreen
                  initialSide={ordersInitialSide}
                  selectedOrderId={selectedOrderId}
                  onOpenOrder={handleOpenOrder}
                  onCloseOrder={() => {
                    setSelectedOrderId(undefined);
                    updateUrl('orders');
                  }}
                  onBack={handleBack}
                  onExplore={() => handleNavigate('browse')}
                  onOpenMessages={() => handleNavigate('messages')}
                  currentUser={currentUser}
                  onOrdersChanged={() => {
                    // Refreshes the open-order badge and any listing that just
                    // flipped to sold by completing an order.
                    loadServerSession();
                    loadServerListings();
                  }}
                />
              )}

              {currentView === 'legal' && (
                <Suspense fallback={<ScreenLoading />}>
                  <LegalScreen
                    onBack={handleBack}
                  />
                </Suspense>
              )}

              {currentView === 'notFound' && (
                <NotFoundScreen
                  onBackHome={() => handleNavigate('browse')}
                />
              )}
            </main>

            {/* Admins get the console shell, which has its own chrome and no
              use for marketplace links. */}
            {currentUser.role !== 'admin' && (
              <SiteFooter
                currentView={currentView}
                onNavigate={handleNavigate}
                onOpenAuthModal={() => setIsAuthModalOpen(true)}
                isGuest={currentUser.role === 'guest'}
              />
            )}
          </div>
        </div>

        {/* Bottom nav for phone and tablet. Rule 4 returns null for admin. */}
        <BottomNav
          currentView={currentView}
          onNavigate={handleNavigate}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          savedCount={savedListings.length}
          cartCount={cartCount}
          unreadMessagesCount={unreadMessages}
          currentUser={currentUser}
        />

        {/* Login & Sign Up Modal */}
        <AuthModal
          isOpen={isAuthModalOpen}
          initialMode={authModalMode}
          resetToken={resetToken}
          pendingGoogleToken={pendingGoogleToken}
          onPendingGoogleTokenConsumed={() => setPendingGoogleToken(null)}
          onClose={() => {
            setIsAuthModalOpen(false);
            setAuthModalMode('login');
            setResetToken(undefined);
            // If user dismissed without logging in, clear the pending route
            setPendingRoute(null);
          }}
          onLoginSuccess={async () => {
            const session = await api.auth.getMe();
            await loadServerListings();
            // handleSessionChange fetches cart and saved for the accounts that
            // have them; doing it here as well made an admin login ask for both
            // and collect a pair of 403s on the way in.
            handleSessionChange(session.user);
          }}
        />

        {/* Shown when a buying-only account reaches for Sell. */}
        <BecomeSellerModal
          isOpen={isBecomeSellerOpen}
          onClose={() => setIsBecomeSellerOpen(false)}
          currentUser={currentUser}
          onUpgraded={(user) => {
            setCurrentUser(user);
            // Applying no longer grants access - an admin decides - so this must
            // not drop them into the Sell form they would only be bounced out of.
            if (user.canSell) {
              toast.success('Your account can now post listings.', { title: "You're a seller" });
              setCurrentView('sell');
              updateUrl('sell');
            } else {
              toast.success('An admin will review it shortly.', {
                title: 'Application submitted',
              });
            }
          }}
        />

        {/* Last child on purpose: it draws over the chrome it points at, and the
          modals above it own the screen outright while they are open. */}
        {!isAuthModalOpen && !isBecomeSellerOpen && <OnboardingHost />}
      </div>
    </OnboardingProvider>
  );
}
