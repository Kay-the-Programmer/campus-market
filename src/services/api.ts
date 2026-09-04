import {
  AccountType,
  AuthSession,
  CampusZone,
  CartItem,
  Listing,
  ListingCategory,
  ListingCondition,
  NotificationItem,
  NotificationPreferences,
  Order,
  OrderAction,
  OrderItem,
  OrderStatus,
  PromoPlacement,
  PromoSlot,
  SellerApprovalStatus,
  SellerProfile,
  Suggestion,
} from '../types';
import { readStored, removeStored, writeStored } from '../utils/storage';

/**
 * Client for the Spring Boot API.
 *
 * The backend speaks its own DTO vocabulary (UUIDs, enum names, ISO instants).
 * The screens in this app were written against a flatter, display-oriented shape,
 * so translation happens here at the boundary rather than leaking enum names and
 * date parsing into twenty components.
 */

const TOKEN_KEY = 'cm_session_token';

/**
 * Fired after any successful write, so whatever displays a count can go and
 * fetch a fresh one. See {@link request}.
 */
export const DATA_CHANGED_EVENT = 'cm:data-changed';

/**
 * Announce that counts may have moved.
 *
 * <p>{@link request} raises this for every successful write. It is exported for
 * the handful of reads that also change state - opening a chat thread marks it
 * read, which is a GET that lowers the unread badge.
 */
export const notifyDataChanged = () =>
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));

export function getToken(): string | null {
  const token = readStored(TOKEN_KEY);
  return token && token !== 'guest' ? token : null;
}

export function setToken(token: string | null) {
  if (token) {
    writeStored(TOKEN_KEY, token);
  } else {
    removeStored(TOKEN_KEY);
  }
}

export interface ApiResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
  code?: string;
  fields?: Record<string, string>;
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    /*
     * Anything that changed server state may have changed a badge.
     *
     * Announced from the one place every request passes through, rather than
     * asking thirty call sites to remember to refresh afterwards - which is
     * how the counts came to be stale in the first place: accepting an order
     * or reading a thread updated the screen it happened on and nothing else,
     * so the number in the nav stayed wrong until a reload.
     *
     * Only successful writes. A GET changes nothing, and a failed write left
     * the counts exactly as they were.
     */
    const method = (options.method || 'GET').toUpperCase();
    if (res.ok && method !== 'GET') {
      window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? undefined : data?.error || 'Request failed.',
      code: data?.code,
      fields: data?.fields,
    };
  } catch (e: any) {
    // A superseded search is aborted on purpose, so it must not surface as a
    // network error and paint "cannot reach the server" over good results.
    if (e?.name === 'AbortError') {
      return { ok: false, status: 0, data: {} as T, code: 'ABORTED' };
    }
    // Network-level failure: surface it in the same shape so callers only ever
    // handle one error contract.
    return {
      ok: false,
      status: 0,
      data: {} as T,
      error: 'Cannot reach the server. Is the API running?',
      code: 'NETWORK_ERROR',
    };
  }
}

const get = <T = any>(path: string, signal?: AbortSignal) => request<T>(path, { signal });
const post = <T = any>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const put = <T = any>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del = <T = any>(path: string) => request<T>(path, { method: 'DELETE' });

// ---------------------------------------------------------------- adapters

const CONDITION_LABELS: Record<string, ListingCondition> = {
  NEW: 'New',
  LIKE_NEW: 'Like New',
  GOOD: 'Good',
  FAIR: 'Fair',
};

const TYPE_LABELS: Record<string, ListingCategory> = {
  PRODUCT: 'Product',
  SERVICE: 'Service',
  FOOD: 'Food',
};

const STATUS_BADGES: Record<string, string> = {
  ACTIVE: 'Available',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  DRAFT: 'Draft',
};

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

function joinedLabel(iso?: string): string {
  if (!iso) return 'Member';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Member';
  return `Joined ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
}

export function toSeller(dto: any): SellerProfile {
  return {
    id: dto?.id ?? '',
    name: dto?.name ?? 'Unknown',
    avatar: dto?.avatarUrl ?? '',
    verified: !!dto?.verified,
    department: dto?.department ?? '',
    year: dto?.year ?? '',
    rating: Number(dto?.ratingAvg ?? 0),
    reviewsCount: dto?.reviewsCount ?? 0,
    joinedDate: joinedLabel(dto?.joinedDate),
    bio: dto?.bio ?? undefined,
    // Present only when the API decided this viewer may see them; absent
    // entirely otherwise (backend strips, it does not blank out).
    email: dto?.contact?.email,
    phone: dto?.contact?.phone,
    privateAddress: dto?.contact?.privateAddress,
  };
}

export function toListing(dto: any): Listing {
  const images: string[] = dto?.images?.length ? dto.images : [];
  const stockInfo =
    dto?.quantity != null && dto?.pickupWindow
      ? `${dto.pickupWindow} • ${dto.quantity} left`
      : dto?.pickupWindow || undefined;

  return {
    id: dto?.id,
    title: dto?.title ?? '',
    price: Number(dto?.price ?? 0),
    priceUnit: dto?.priceUnit ?? undefined,
    category: TYPE_LABELS[dto?.type] ?? 'Product',
    condition: dto?.condition ? CONDITION_LABELS[dto.condition] ?? 'N/A' : 'N/A',
    brand: dto?.brand ?? undefined,
    location: dto?.location ?? '',
    image: images[0] ?? '',
    gallery: images,
    description: dto?.description ?? '',
    seller: toSeller(dto?.seller),
    postedAt: relativeTime(dto?.createdAt),
    isAvailable: !!dto?.available,
    isSaved: !!dto?.saved,
    badgeText: STATUS_BADGES[dto?.status] ?? undefined,
    stockInfo,
    pickupWindow: dto?.pickupWindow ?? undefined,
    availability: dto?.availability ?? undefined,
    quantity: dto?.quantity ?? undefined,
    dietaryTags: dto?.dietaryTags ?? undefined,
    categoryId: dto?.category?.id ?? undefined,
    categoryName: dto?.category?.name ?? undefined,
    rateType: dto?.rateType ?? undefined,
    serviceMode: dto?.serviceMode ?? undefined,
    campusZone: dto?.campusZone ?? undefined,
    status: dto?.status ?? undefined,
    viewsCount: dto?.viewsCount ?? 0,
    likesCount: dto?.likesCount ?? 0,
    messagesCount: dto?.messagesCount ?? 0,
    createdAt: dto?.createdAt ?? '',
    specialOffer: dto?.specialOffer ?? false,
    // Left undefined rather than defaulted: "no comparison price" and "the
    // usual price is zero" have to stay distinguishable at the render site.
    compareAtPrice: dto?.compareAtPrice ?? undefined,
    discountPercent: dto?.discountPercent ?? undefined,
    availableStock: dto?.availableStock ?? undefined,
  };
}

export function toSession(dto: any): AuthSession {
  return {
    id: dto?.id ?? 'guest',
    name: dto?.name ?? 'Guest Visitor',
    email: dto?.email ?? '',
    avatar: dto?.avatarUrl ?? '',
    role: dto?.role ?? 'guest',
    // Defaulting to BUYER is the safe direction: it grants nothing, so a
    // malformed session can never accidentally unlock selling.
    accountType: dto?.accountType === 'SELLER' ? 'SELLER' : 'BUYER',
    sellerApprovalStatus: dto?.sellerApprovalStatus ?? 'NOT_REQUESTED',
    sellerApprovalReason: dto?.sellerApprovalReason ?? undefined,
    // Server-computed. Never re-derived here: admins may sell without being
    // customers, which the accountType/role pair alone cannot express.
    canSell: !!dto?.canSell,
    campusZone: dto?.campusZone ?? undefined,
    hasActiveListings: !!dto?.hasActiveListings,
    phoneVerified: !!dto?.phoneVerified,
    phone: dto?.phone ?? undefined,
    activeListings: dto?.activeListings ?? 0,
    openOrders: dto?.openOrders ?? 0,
    isSuspended: dto?.status === 'SUSPENDED',
    isBanned: dto?.status === 'BANNED',
    department: dto?.department ?? undefined,
    year: dto?.year ?? undefined,
  };
}

function toOrderItem(dto: any): OrderItem {
  return {
    id: dto?.id,
    listingId: dto?.listingId ?? undefined,
    title: dto?.title ?? '',
    image: dto?.image ?? undefined,
    unitPrice: Number(dto?.unitPrice ?? 0),
    quantity: Number(dto?.quantity ?? 1),
    lineTotal: Number(dto?.lineTotal ?? 0),
  };
}

export function toOrder(dto: any): Order {
  return {
    id: dto?.id,
    reference: dto?.reference ?? '',
    counterparty: {
      id: dto?.counterparty?.id ?? '',
      name: dto?.counterparty?.name ?? 'Unknown',
      avatar: dto?.counterparty?.avatarUrl ?? undefined,
    },
    // Admins only; absent for the two trading parties, who have each other as
    // `counterparty`. Contact details ride along under the same RBAC rule that
    // governs every other profile the API hands an admin.
    buyer: dto?.buyer
      ? {
          id: dto.buyer.id ?? '',
          name: dto.buyer.name ?? 'Unknown',
          avatar: dto.buyer.avatarUrl ?? undefined,
          email: dto.buyer.contact?.email ?? undefined,
          phone: dto.buyer.contact?.phone ?? undefined,
        }
      : undefined,
    role: dto?.role === 'seller' ? 'seller' : 'buyer',
    status: (dto?.status ?? 'PENDING') as OrderStatus,
    total: Number(dto?.total ?? 0),
    meetupZone: dto?.meetupZone ?? undefined,
    buyerNote: dto?.buyerNote ?? undefined,
    sellerNote: dto?.sellerNote ?? undefined,
    adminNote: dto?.adminNote ?? undefined,
    fulfilledByAdminName: dto?.fulfilledByAdminName ?? undefined,
    items: (dto?.items ?? []).map(toOrderItem),
    itemCount: Number(dto?.itemCount ?? 0),
    // Trusted from the server: it owns the state machine, so the UI never has
    // to work out which buttons are legal.
    availableActions: (dto?.availableActions ?? []) as OrderAction[],
    respondedAt: dto?.respondedAt ?? undefined,
    completedAt: dto?.completedAt ?? undefined,
    createdAt: dto?.createdAt ?? '',
  };
}

function toCartItem(dto: any): CartItem {
  return {
    id: dto?.id,
    listingId: dto?.listing?.id,
    title: dto?.listing?.title ?? '',
    price: Number(dto?.listing?.price ?? 0),
    image: dto?.listing?.image ?? '',
    sellerName: dto?.seller?.name ?? '',
    sellerId: dto?.seller?.id ?? '',
    addedAt: relativeTime(dto?.addedAt),
    quantity: Math.max(1, Number(dto?.quantity ?? 1)),
  };
}

function toNotification(dto: any): NotificationItem {
  const typeMap: Record<string, NotificationItem['type']> = {
    MESSAGE: 'message',
    ORDER: 'order',
    SYSTEM: 'system',
    MODERATION: 'moderation',
    REVIEW: 'review',
    PRICE_DROP: 'price-drop',
  };
  return {
    id: dto?.id,
    userId: '',
    title: dto?.title ?? '',
    message: dto?.body ?? '',
    time: relativeTime(dto?.createdAt),
    read: !!dto?.read,
    type: typeMap[dto?.type] ?? 'system',
    // A dead link still renders, it just stops being navigable (workflow 18).
    link: dto?.linkValid ? dto?.link : undefined,
  };
}

// ------------------------------------------------------------------- api

export const api = {
  auth: {
    async getMe() {
      const res = await get('/api/auth/me');
      return {
        user: toSession(res.data?.user),
        isAuthenticated: !!res.data?.isAuthenticated,
        raw: res.data?.user,
      };
    },

    async login(email: string, password: string) {
      const res = await post('/api/auth/login', { email, password });
      if (res.ok && res.data?.token) {
        setToken(res.data.token);
      }
      return {
        ...res,
        user: res.ok ? toSession(res.data?.user) : undefined,
      };
    },

    async signup(payload: {
      name: string;
      email: string;
      password: string;
      accountType: AccountType;
      campusZone: CampusZone;
      phone?: string;
      department?: string;
      year?: string;
    }) {
      return post('/api/auth/signup', payload);
    },

    /**
     * "Continue with Google" - idToken comes from firebase.ts's signInWithGoogle().
     *
     * Two-leg by necessity: the popup has to run before we can ask which kind of
     * account they want, so the first call creates the account and answers
     * `needsProfile`, and the caller then repeats it with the answers filled in.
     */
    async google(
      idToken: string,
      profile?: { accountType?: AccountType; campusZone?: CampusZone; phone?: string },
    ) {
      const res = await post('/api/auth/google', {
        idToken,
        accountType: profile?.accountType,
        campusZone: profile?.campusZone,
        phone: profile?.phone,
      });
      if (res.ok && res.data?.token) {
        setToken(res.data.token);
      }
      return {
        ...res,
        user: res.ok ? toSession(res.data?.user) : undefined,
        isNewUser: !!res.data?.isNewUser,
        needsProfile: !!res.data?.needsProfile,
      };
    },

    /**
     * Files a seller application against the current account. Does NOT grant
     * selling - an admin still has to approve it, so the result is normally
     * `sellerApprovalStatus: 'PENDING'`.
     */
    async becomeSeller(campusZone?: CampusZone) {
      const res = await post('/api/auth/become-seller', { campusZone });
      return {
        success: res.ok,
        user: res.ok ? toSession(res.data?.user) : undefined,
        alreadySeller: !!res.data?.alreadySeller,
        sellerApprovalStatus: res.data?.sellerApprovalStatus as SellerApprovalStatus | undefined,
        message: res.data?.message,
        error: res.error,
        code: res.code,
        status: res.status,
      };
    },

    verifyEmail: async (token: string) => {
      const res = await post('/api/auth/verify-email', { token });
      // Verification signs the user straight in (workflow 2 step 3).
      if (res.ok && res.data?.token) {
        setToken(res.data.token);
      }
      return { ...res, user: res.ok ? toSession(res.data?.user) : undefined };
    },

    resendVerification: (email: string) => post('/api/auth/resend-verification', { email }),
    forgotPassword: (email: string) => post('/api/auth/forgot-password', { email }),
    /** Signed-in change, as opposed to the emailed reset flow. */
    async changePassword(currentPassword: string, newPassword: string, confirmPassword: string) {
      const res = await post('/api/auth/change-password', { currentPassword, newPassword, confirmPassword });
      return { success: res.ok, message: res.data?.message, error: res.error, code: res.code, status: res.status };
    },
    resetPassword: (token: string, password: string, confirmPassword: string) =>
      post('/api/auth/reset-password', { token, password, confirmPassword }),

    async logout() {
      // Before the session token goes: unregistering needs to be authenticated,
      // and a shared laptop must stop buzzing for an account that just signed
      // out. Imported lazily so api.ts does not depend on the push client that
      // depends on it, and awaited but never allowed to throw.
      try {
        const { disablePush } = await import('./push');
        await disablePush();
      } catch {
        // Logout proceeds regardless - see setToken(null) below.
      }

      const res = await post('/api/auth/logout');
      // Clear locally regardless: if the call failed the token simply expires
      // server-side, and the user still expects to be signed out (workflow 5).
      setToken(null);
      return res;
    },
  },

  listings: {
    async search(
      params: Record<string, string | number | undefined> = {},
      signal?: AbortSignal,
    ) {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          query.append(key, String(value));
        }
      });
      const res = await get(`/api/listings?${query.toString()}`, signal);
      // Annotated rather than mapped inline: res.data is `any`, and mapping over
      // an `any` produces `any` again - which erased Listing[] at every caller,
      // so `l` in their .filter/.map callbacks had no type at all.
      const items: unknown[] = res.data?.items ?? [];
      return {
        listings: items.map(toListing),
        page: res.data?.page ?? 0,
        totalItems: res.data?.totalItems ?? 0,
        totalPages: res.data?.totalPages ?? 0,
        // Lets callers ignore a cancelled request instead of clearing results.
        aborted: res.code === 'ABORTED',
        status: res.status,
        error: res.error,
      };
    },

    /** Reviews of this listing, with count and average. Distinct from the
     *  seller's overall rating - see DealService.reviewsForListing. */
    async reviews(listingId: string) {
      const res = await get(`/api/listings/${listingId}/reviews`);
      return {
        reviews: (res.data?.reviews ?? []) as any[],
        count: (res.data?.count ?? 0) as number,
        // Null when nobody has reviewed - not the same as zero stars.
        average: (res.data?.average ?? null) as number | null,
        error: res.error,
        status: res.status,
      };
    },

    /** Search-as-you-type. Fires per keystroke, so keep the caller debounced. */
    async suggestions(q: string, limit = 6, signal?: AbortSignal) {
      const res = await get(
        `/api/listings/suggestions?q=${encodeURIComponent(q)}&limit=${limit}`, signal);
      return {
        listings: (res.data?.listings ?? []) as Suggestion[],
        categories: (res.data?.categories ?? []) as Suggestion[],
        aborted: res.code === 'ABORTED',
        error: res.error,
        status: res.status,
      };
    },

    async getAll(params?: { category?: string; search?: string; sellerId?: string }) {
      const result = await api.listings.search({
        type: params?.category && params.category !== 'All' ? params.category : undefined,
        search: params?.search,
        sellerId: params?.sellerId,
        size: 60,
      });
      // status and error travel with it: "the catalogue is empty" and "the
      // catalogue could not be reached" are the same empty array otherwise,
      // and they call for very different screens.
      return { listings: result.listings, status: result.status, error: result.error };
    },

    async getById(id: string) {
      const res = await get(`/api/listings/${id}`);
      return {
        listing: res.ok ? toListing(res.data?.listing) : undefined,
        error: res.error,
        status: res.status,
      };
    },

    async create(payload: Record<string, unknown>) {
      const res = await post('/api/listings', payload);
      return {
        success: res.ok,
        listing: res.ok ? toListing(res.data?.listing) : undefined,
        error: res.error,
        code: res.code,
        status: res.status,
      };
    },

    async update(id: string, payload: Record<string, unknown>) {
      const res = await put(`/api/listings/${id}`, payload);
      return {
        success: res.ok,
        listing: res.ok ? toListing(res.data?.listing) : undefined,
        error: res.error,
        code: res.code,
        status: res.status,
      };
    },

    async changeStatus(id: string, status: string) {
      const res = await post(`/api/listings/${id}/status`, { status });
      return {
        success: res.ok,
        listing: res.ok ? toListing(res.data?.listing) : undefined,
        error: res.error,
        status: res.status,
      };
    },

    /**
     * Soft delete. The first call without `confirm` may come back 409 with
     * ACTIVE_CONVERSATIONS so the UI can warn before destroying the listing.
     */
    async delete(id: string, confirm = false) {
      const res = await del(`/api/listings/${id}?confirm=${confirm}`);
      return {
        success: res.ok,
        message: res.data?.message,
        error: res.error,
        code: res.code,
        conversationCount: res.data?.conversationCount,
        status: res.status,
      };
    },

    async getMyListings() {
      const res = await get('/api/my-listings');
      return {
        listings: (res.data?.listings ?? []).map(toListing),
        error: res.error,
        status: res.status,
      };
    },

    async candidateBuyers(id: string) {
      const res = await get(`/api/listings/${id}/buyers`);
      return { buyers: (res.data?.buyers ?? []).map(toSeller), error: res.error, status: res.status };
    },

    async markSold(
      id: string,
      payload: { buyerId: string; price: number; meetupLocation?: string; meetupTime?: string },
    ) {
      const res = await post(`/api/listings/${id}/mark-sold`, payload);
      return { success: res.ok, deal: res.data?.deal, error: res.error, code: res.code, status: res.status };
    },

    startChat: (listingId: string, body?: string) => post(`/api/listings/${listingId}/chat`, { body }),

    requestBooking: (listingId: string, preferredTime: string, note?: string) =>
      post(`/api/listings/${listingId}/booking`, { preferredTime, note }),
  },

  uploads: {
    /**
     * Uploads an already-compressed image and returns the URL that serves it.
     *
     * Bypasses {@link request}: that helper always sends JSON, and a multipart
     * body needs the browser to set its own Content-Type with the form
     * boundary - setting one by hand here would omit the boundary and the
     * server would fail to split the request back into its parts.
     */
    async image(blob: Blob, filename: string) {
      const form = new FormData();
      form.append('file', blob, filename);
      const headers: Record<string, string> = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      try {
        const res = await fetch('/api/uploads/image', { method: 'POST', body: form, headers });
        const data = await res.json().catch(() => ({}));
        return {
          ok: res.ok,
          url: data?.url as string | undefined,
          error: res.ok ? undefined : data?.error || 'Upload failed.',
        };
      } catch {
        return { ok: false, url: undefined, error: 'Cannot reach the server. Is the API running?' };
      }
    },
  },

  /** Admin-editable home-page panels. Reading is public. */
  promos: {
    async getActive() {
      const res = await get('/api/promos');
      return {
        promos: (res.data?.promos ?? []) as PromoSlot[],
        error: res.error,
        status: res.status,
      };
    },
  },

  categories: {
    async getAll() {
      const res = await get('/api/categories');
      /*
       * An error response is an object, not a list. `res.data ?? []` let that
       * object through as "the categories", and every caller does .filter on
       * what it gets back - so any failure here surfaced as a TypeError in the
       * caller rather than an empty category strip. The shape is promised
       * here, where the boundary is.
       */
      return {
        categories: Array.isArray(res.data) ? res.data : [],
        error: res.error,
        status: res.status,
      };
    },
  },

  saved: {
    async getAll() {
      const res = await get('/api/saved');
      return { saved: (res.data?.saved ?? []).map(toListing), error: res.error, status: res.status };
    },
    async toggle(listingId: string) {
      const res = await post(`/api/saved/${listingId}`);
      return { success: res.ok, isSaved: !!res.data?.saved, error: res.error, status: res.status };
    },
  },

  cart: {
    async getAll() {
      const res = await get('/api/cart');
      const cart: CartItem[] = (res.data?.items ?? []).map(toCartItem);
      return {
        cart,
        /*
         * Things in the cart, not rows in the cart. Three of one item is three
         * things to the person carrying them, and a badge reading "1" over a
         * cart holding three is the kind of small wrongness that makes someone
         * open it just to check.
         */
        count: cart.reduce((sum, item) => sum + item.quantity, 0),
        raw: res.data,
        subtotal: Number(res.data?.subtotal ?? 0),
        hasUnavailableItems: !!res.data?.hasUnavailableItems,
        error: res.error,
        status: res.status,
      };
    },
    async add(item: { listingId: string; quantity?: number }) {
      const res = await post('/api/cart', item);
      return { success: res.ok, error: res.error, code: res.code, status: res.status };
    },
    async updateQuantity(itemId: string, quantity: number) {
      const res = await put(`/api/cart/${itemId}`, { quantity });
      return { success: res.ok, error: res.error, status: res.status };
    },
    async remove(id: string) {
      const res = await del(`/api/cart/${id}`);
      return { success: res.ok, error: res.error, status: res.status };
    },
  },

  /**
   * Buyer-placed orders. Reads are split by side rather than filtered here, so
   * the seller's inbox and the buyer's history can never bleed into each other.
   */
  orders: {
    /** Turns the cart into one pending order per seller. */
    async checkout(options?: { meetupZone?: CampusZone; note?: string }) {
      const res = await post('/api/orders/checkout', {
        meetupZone: options?.meetupZone,
        note: options?.note,
      });
      return {
        success: res.ok,
        orders: (res.data?.orders ?? []).map(toOrder),
        // Items that sold while they sat in the cart, reported by name.
        skipped: (res.data?.skipped ?? []) as string[],
        error: res.error,
        code: res.code,
        status: res.status,
      };
    },

    /** Orders placed WITH me - the seller inbox. */
    async incoming() {
      const res = await get('/api/orders/incoming');
      return { orders: (res.data?.orders ?? []).map(toOrder), error: res.error, status: res.status };
    },

    /** Orders I placed. */
    async placed() {
      const res = await get('/api/orders/placed');
      return { orders: (res.data?.orders ?? []).map(toOrder), error: res.error, status: res.status };
    },

    /**
     * One order by id, for its detail view.
     *
     * <p>Fetched rather than looked up in whichever list is loaded: a
     * notification deep-links straight to an order that may sit on the other
     * tab, or be long completed and filtered out of view.
     */
    async getById(orderId: string) {
      const res = await get(`/api/orders/${orderId}`);
      return {
        order: res.data?.order ? toOrder(res.data.order) : undefined,
        error: res.error,
        status: res.status,
      };
    },

    async act(orderId: string, action: OrderAction, note?: string) {
      const res = await post(`/api/orders/${orderId}/${action}`, note ? { note } : undefined);
      return {
        success: res.ok,
        order: res.ok ? toOrder(res.data) : undefined,
        error: res.error,
        code: res.code,
        status: res.status,
      };
    },
  },

  deals: {
    async getAll() {
      const res = await get('/api/deals');
      return { deals: res.data?.deals ?? [], error: res.error, status: res.status };
    },
    async review(dealId: string, rating: number, comment?: string) {
      const res = await post(`/api/deals/${dealId}/review`, { rating, comment });
      return { success: res.ok, review: res.data?.review, error: res.error, code: res.code, status: res.status };
    },
  },

  messages: {
    async getAll() {
      const res = await get('/api/messages');
      return { threads: res.data?.threads ?? [], error: res.error, status: res.status };
    },
    /**
     * @param opts.silent suppress the data-changed announcement.
     *
     * The announcement is what drives the badge refresh, but it also drives the
     * poller that calls this - so a polled re-read that announced would retrigger
     * itself forever. A background refresh of a thread already on screen has
     * nothing to tell anyone: the badge it would move is for the thread the
     * viewer is currently reading, which is already zero.
     */
    async getById(id: string, opts?: { silent?: boolean }) {
      const res = await get(`/api/messages/${id}`);
      // Reading a thread marks it read server-side, so this GET moves the
      // unread badge even though it looks like a pure fetch.
      if (res.ok && !opts?.silent) notifyDataChanged();
      return { thread: res.data?.thread, error: res.error, status: res.status };
    },
    async send(id: string, body: string) {
      const res = await post(`/api/messages/${id}/send`, { body });
      return { success: res.ok, message: res.data?.message, error: res.error, status: res.status };
    },
  },

  notifications: {
    async getAll() {
      const res = await get('/api/notifications');
      // See listings.search: mapping over an `any` gives back an `any`, which
      // left every caller's callback parameter untyped.
      const rows: unknown[] = res.data?.notifications ?? [];
      return {
        notifications: rows.map(toNotification),
        unreadCount: res.data?.unreadCount ?? 0,
        error: res.error,
        status: res.status,
      };
    },
    markRead: (id: string) => post(`/api/notifications/${id}/read`),
    markAllRead: () => post('/api/notifications/read-all'),

    /** Idempotent: called on every login and whenever FCM rotates the token. */
    async registerDevice(token: string, label?: string) {
      const res = await post('/api/notifications/devices', { token, platform: 'WEB', label });
      return { success: res.ok, error: res.error, status: res.status };
    },
    async unregisterDevice(token: string) {
      const res = await post('/api/notifications/devices/unregister', { token });
      return { success: res.ok, error: res.error, status: res.status };
    },
    async getPreferences() {
      const res = await get('/api/notifications/preferences');
      return {
        preferences: res.data?.preferences as NotificationPreferences | undefined,
        error: res.error,
        status: res.status,
      };
    },
    /** Partial: send only the toggles that changed. */
    async updatePreferences(changes: Partial<Omit<NotificationPreferences, 'deviceCount' | 'pushConfigured'>>) {
      const res = await put('/api/notifications/preferences', changes);
      return {
        success: res.ok,
        preferences: res.data?.preferences as NotificationPreferences | undefined,
        error: res.error,
        status: res.status,
      };
    },
  },

  users: {
    /** Edits the caller's own profile. No id travels - the server takes it
     *  from the session, so this can never be pointed at someone else. */
    async updateProfile(payload: {
      name: string;
      bio?: string;
      department?: string;
      year?: string;
      campusZone?: string;
      avatarUrl?: string;
      privateAddress?: string;
    }) {
      const res = await put('/api/users/me', payload);
      return {
        success: res.ok,
        user: res.ok ? toSeller(res.data?.user) : undefined,
        error: res.error,
        code: res.code,
        status: res.status,
      };
    },

    /** Issues a one-time code. `devCode` comes back outside production so the
     *  flow is testable without an SMS gateway. */
    async sendPhoneCode(phone: string) {
      const res = await post('/api/users/me/phone/send-code', { phone });
      return {
        success: res.ok,
        message: res.data?.message,
        devCode: res.data?.devCode as string | undefined,
        error: res.error,
        code: res.code,
        status: res.status,
      };
    },

    async verifyPhone(code: string) {
      const res = await post('/api/users/me/phone/verify', { code });
      return {
        success: res.ok,
        phone: res.data?.phone as string | undefined,
        error: res.error,
        code: res.code,
        status: res.status,
      };
    },

    async getById(id: string) {
      const res = await get(`/api/users/${id}`);
      return {
        user: res.ok ? toSeller(res.data?.user) : undefined,
        stats: res.data?.stats,
        listings: (res.data?.listings ?? []).map(toListing),
        isSelf: !!res.data?.isSelf,
        error: res.error,
        status: res.status,
      };
    },
    async reviews(id: string) {
      const res = await get(`/api/users/${id}/reviews`);
      return { reviews: res.data?.reviews ?? [], error: res.error, status: res.status };
    },
  },

  reports: {
    create: (payload: {
      targetType: 'LISTING' | 'USER';
      targetId: string;
      reason: string;
      details?: string;
    }) => post('/api/reports', payload),
  },

  admin: {
    async getStats() {
      const res = await get('/api/admin/stats');
      return { ...res.data, error: res.error, status: res.status };
    },
    async getUsers() {
      const res = await get('/api/admin/users');
      return { users: res.data ?? [], error: res.error, status: res.status };
    },
    async getReports(status: 'pending' | 'all' = 'pending') {
      const res = await get(`/api/admin/reports?status=${status}`);
      return { reports: res.data ?? [], error: res.error, status: res.status };
    },
    async resolveReport(id: string, action: 'DISMISS' | 'REMOVE_LISTING' | 'BAN_USER', reason?: string) {
      const res = await post(`/api/admin/reports/${id}/resolve`, { action, reason });
      return { success: res.ok, error: res.error, code: res.code, status: res.status };
    },
    async getAuditLogs() {
      const res = await get('/api/admin/audit-logs');
      return { logs: res.data ?? [], error: res.error, status: res.status };
    },
    async suspendUser(userId: string, reason: string, durationDays: number) {
      const res = await post(`/api/admin/users/${userId}/suspend`, { reason, durationDays });
      return { success: res.ok, message: res.data?.message, error: res.error, status: res.status };
    },
    async banUser(userId: string, reason: string) {
      const res = await post(`/api/admin/users/${userId}/ban`, { reason });
      return { success: res.ok, message: res.data?.message, error: res.error, status: res.status };
    },
    async reinstateUser(userId: string, reason?: string) {
      const res = await post(`/api/admin/users/${userId}/reinstate`, { reason });
      return { success: res.ok, message: res.data?.message, error: res.error, status: res.status };
    },
    async verifyUser(userId: string, verified: boolean) {
      const res = await post(`/api/admin/users/${userId}/${verified ? 'verify' : 'unverify'}`);
      return { success: res.ok, error: res.error, status: res.status };
    },
    /** Accounts waiting to be allowed to sell. */
    /** The whole catalogue for the admin listings screen: drafts, sold items
     *  and - when asked - rows that have been removed. */
    async getListings(search?: string, includeRemoved = false) {
      const params = new URLSearchParams();
      if (search?.trim()) params.set('search', search.trim());
      if (includeRemoved) params.set('includeRemoved', 'true');
      const res = await get(`/api/admin/listings?${params.toString()}`);
      return {
        listings: (res.data?.listings ?? []).map(toListing) as Listing[],
        error: res.error,
        status: res.status,
      };
    },

    /** The Special Offers shelf as the admin sees it - includes sold-out rows
     *  so they can be cleared, which the public query filters away. */
    async getSpecialOffers() {
      const res = await get('/api/admin/special-offers');
      return {
        listings: (res.data?.listings ?? []).map(toListing) as Listing[],
        error: res.error,
        status: res.status,
      };
    },
    /** @param compareAtPrice omit for an offer with no honest "was" price. */
    async setSpecialOffer(listingId: string, featured: boolean, compareAtPrice?: number) {
      const res = await post(`/api/admin/listings/${listingId}/special-offer`, {
        featured,
        compareAtPrice,
      });
      return {
        success: res.ok,
        listing: res.ok ? toListing(res.data) : undefined,
        error: res.error,
        code: res.code,
        status: res.status,
      };
    },

    async getPendingSellers() {
      const res = await get('/api/admin/sellers/pending');
      return { sellers: res.data?.sellers ?? [], error: res.error, status: res.status };
    },
    /** One applicant in full, for the review step before approving. */
    async getSellerApplicant(userId: string) {
      const res = await get(`/api/admin/sellers/${userId}`);
      return { applicant: res.data?.applicant, error: res.error, status: res.status };
    },
    /** The same full record, opened from user management. */
    async getMember(userId: string) {
      const res = await get(`/api/admin/users/${userId}`);
      return { member: res.data?.member, error: res.error, status: res.status };
    },
    async approveSeller(userId: string, reason?: string) {
      const res = await post(`/api/admin/sellers/${userId}/approve`, { reason });
      return { success: res.ok, error: res.error, code: res.code, status: res.status };
    },
    async rejectSeller(userId: string, reason: string) {
      const res = await post(`/api/admin/sellers/${userId}/reject`, { reason });
      return { success: res.ok, error: res.error, code: res.code, status: res.status };
    },

    /** Orders withheld from unverified sellers, awaiting a decision. */
    async getHeldOrders() {
      const res = await get('/api/admin/orders/held');
      return { orders: (res.data?.orders ?? []).map(toOrder), error: res.error, status: res.status };
    },
    /** Pass the order on to its seller. */
    async releaseOrder(orderId: string, reason?: string) {
      const res = await post(`/api/admin/orders/${orderId}/release`, { reason });
      return { success: res.ok, order: res.ok ? toOrder(res.data) : undefined,
               error: res.error, code: res.code, status: res.status };
    },
    /**
     * Supply the goods directly instead of routing to an unverified seller.
     * Answers with the thread opened for the handover, so the caller can go
     * straight to it. Absent only when every listing on the order was already
     * hard-deleted, leaving nothing to pin a conversation to.
     */
    async fulfilOrder(orderId: string, reason?: string) {
      const res = await post(`/api/admin/orders/${orderId}/fulfil`, { reason });
      return {
        success: res.ok,
        order: res.ok && res.data?.order ? toOrder(res.data.order) : undefined,
        conversationId: res.data?.conversationId as string | undefined,
        error: res.error, code: res.code, status: res.status,
      };
    },

    /** Home-page editor. Includes hidden panels, unlike the public read. */
    async getPromos() {
      const res = await get('/api/admin/promos');
      return { promos: (res.data?.promos ?? []) as PromoSlot[], error: res.error, status: res.status };
    },
    async createPromo(payload: Record<string, unknown>) {
      const res = await post('/api/admin/promos', payload);
      return { success: res.ok, promo: res.data as PromoSlot, error: res.error, code: res.code, status: res.status };
    },
    async updatePromo(id: string, payload: Record<string, unknown>) {
      const res = await put(`/api/admin/promos/${id}`, payload);
      return { success: res.ok, promo: res.data as PromoSlot, error: res.error, code: res.code, status: res.status };
    },
    async setPromoActive(id: string, active: boolean) {
      const res = await post(`/api/admin/promos/${id}/active?active=${active}`);
      return { success: res.ok, error: res.error, status: res.status };
    },
    async reorderPromos(placement: PromoPlacement, orderedIds: string[]) {
      const res = await post('/api/admin/promos/reorder', { placement, orderedIds });
      return { success: res.ok, promos: (res.data?.promos ?? []) as PromoSlot[], error: res.error, status: res.status };
    },
    async deletePromo(id: string) {
      const res = await del(`/api/admin/promos/${id}`);
      return { success: res.ok, error: res.error, code: res.code, status: res.status };
    },

    async createCategory(payload: { name: string; icon?: string; parentId?: string; sortOrder?: number }) {
      const res = await post('/api/admin/categories', payload);
      return { success: res.ok, error: res.error, code: res.code, status: res.status };
    },
    async updateCategory(id: string, payload: Record<string, unknown>) {
      const res = await put(`/api/admin/categories/${id}`, payload);
      return { success: res.ok, error: res.error, code: res.code, status: res.status };
    },
    async deleteCategory(id: string, reassignTo?: string) {
      const query = reassignTo ? `?reassignTo=${reassignTo}` : '';
      const res = await del(`/api/admin/categories/${id}${query}`);
      return { success: res.ok, error: res.error, code: res.code, status: res.status };
    },
  },
};

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const res = await request(url, options);
  return { status: res.status, ok: res.ok, data: res.data };
}
