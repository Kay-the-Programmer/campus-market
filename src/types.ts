import type React from 'react';

export type ListingCategory = 'Product' | 'Service' | 'Food';

export type ListingCondition = 'New' | 'Like New' | 'Good' | 'Fair' | 'N/A';

export interface SellerProfile {
  id: string;
  name: string;
  avatar: string;
  verified: boolean;
  department: string;
  year: string;
  rating: number;
  reviewsCount: number;
  joinedDate: string;
  bio?: string;
  email?: string; // Sensitive field stripped for guests
  phone?: string; // Sensitive field stripped for guests
  privateAddress?: string; // Sensitive field stripped for guests
}

export type UserRole = 'guest' | 'customer' | 'admin';

/**
 * What the account is allowed to do, chosen at registration. Separate from
 * UserRole (which only separates customers from admins) and from the derived
 * "seller state" the nav uses - see isSellerState in nav/navShared.
 *
 * A BUYER cannot create listings. Upgrading to SELLER happens in place via
 * api.auth.becomeSeller, so nobody needs a second account.
 */
export type AccountType = 'BUYER' | 'SELLER';

/**
 * Where a seller application stands. Separate from the `verified` trust badge:
 * approval is the entry gate on listing at all, verification is a later upgrade
 * that also stops incoming orders being held for admin review.
 */
export type SellerApprovalStatus = 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

/** The three fixed campus zones. Replaces free-text location for filtering. */
export type CampusZone = 'DOWNSCHOOL' | 'UPSCHOOL' | 'ACROSS';

export const CAMPUS_ZONES: { value: CampusZone; label: string; hint: string }[] = [
  { value: 'DOWNSCHOOL', label: 'Downschool', hint: '' },
  { value: 'UPSCHOOL', label: 'Upschool', hint: 'Highrise Hostels' },
  { value: 'ACROSS', label: 'Across', hint: 'Off-campus' },
];

export const zoneLabel = (zone?: CampusZone | null): string =>
  CAMPUS_ZONES.find((z) => z.value === zone)?.label ?? '';

export interface AuthSession {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  accountType: AccountType; // Intent chosen at registration - not yet permission
  sellerApprovalStatus: SellerApprovalStatus;
  sellerApprovalReason?: string; // Why an application was refused
  /**
   * Server's own answer to "may this account list right now?". Trust this over
   * re-deriving it client-side; admins are allowed to sell without being
   * customers, which no combination of the other fields expresses.
   */
  canSell: boolean;
  campusZone?: CampusZone;  // Null until chosen - Google signups pick it after the popup
  hasActiveListings: boolean; // Derived server-side! True if customer has at least 1 active/reserved listing
  activeListings?: number; // Server-counted, so the seller menu can state a real number
  openOrders?: number; // Pending/accepted orders awaiting this seller
  /** True once a code sent to their number was entered back correctly. */
  phoneVerified?: boolean;
  /** Their own number - only ever present on their own session. */
  phone?: string;
  isSuspended?: boolean;
  isBanned?: boolean;
  department?: string;
  year?: string;
}

export interface AuditLogEntry {
  id: string;
  adminId: string;
  action: 'remove_listing' | 'suspend_user' | 'ban_user' | 'dismiss_report' | 'act_report';
  targetId: string;
  timestamp: string;
  reason?: string;
  details?: string;
}

export interface CartItem {
  id: string;
  listingId: string;
  title: string;
  price: number;
  image: string;
  sellerName: string;
  sellerId: string;
  addedAt: string;
  /** How many of this listing the line holds. Never below 1. */
  quantity: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'order' | 'message' | 'system' | 'moderation' | 'review' | 'price-drop'
    | 'saved-update';
  link?: string;
}

/**
 * Which activities may interrupt this user on their devices.
 *
 * `deviceCount` and `pushConfigured` are context rather than settings: how many
 * browsers are registered, and whether the server has FCM credentials at all.
 * Moderation notices have no switch by design - see V6__push_notifications.sql.
 */
export interface NotificationPreferences {
  /** Master switch for push. The categories below are shared with email. */
  pushEnabled: boolean;
  /** Master switch for notification email - the counterpart of pushEnabled. */
  emailEnabled: boolean;
  /**
   * Campaign email. Separate from emailEnabled on purpose: opting out of
   * announcements must not silence the email about your own order.
   */
  marketingEmails: boolean;
  messages: boolean;
  orders: boolean;
  reviews: boolean;
  priceDrops: boolean;
  systemUpdates: boolean;
  deviceCount: number;
  /** Server has Firebase credentials; without them push cannot be delivered. */
  pushConfigured: boolean;
  /** Server has SMTP; without it no email can be delivered. */
  emailConfigured: boolean;
}

export interface Listing {
  id: string;
  title: string;
  price: number;
  priceUnit?: string; // e.g. "/hr" for tutoring
  category: ListingCategory;
  condition?: ListingCondition;
  brand?: string;
  location: string;
  image: string;
  gallery: string[];
  description: string;
  seller: SellerProfile;
  postedAt: string;
  isAvailable: boolean;
  isSaved?: boolean;
  badgeText?: string; // e.g., "Like New", "Active", "Reserved", "Sold"
  stockInfo?: string; // e.g., "Available until 7PM • 4 left"
  pickupWindow?: string; // Food: raw window, e.g. "Today until 7:00 PM"
  availability?: string; // Service: free-text availability, e.g. "Weekdays after 4pm"
  quantity?: number; // Food: servings available
  dietaryTags?: string[];
  categoryId?: string;
  categoryName?: string;
  rateType?: string; // Service: HOURLY | PER_SESSION | FIXED
  /** Service: BOOKING (agree a time first) or WALK_IN (just drop in). */
  serviceMode?: 'BOOKING' | 'WALK_IN';
  campusZone?: CampusZone; // Coarse zone used for filtering; `location` stays the exact spot
  status?: string; // raw server status: ACTIVE | RESERVED | SOLD | DRAFT
  viewsCount?: number;
  likesCount?: number;
  messagesCount?: number;
  createdAt?: string;
  /** On the admin-curated Special Offers shelf. */
  specialOffer?: boolean;
  /** Usual price, shown struck through beside the offer price. */
  compareAtPrice?: number;
  /** How many can be bought at once; undefined when unlimited or n/a. */
  availableStock?: number;
  /** Whole-percent saving. Server-computed, so every surface agrees. */
  discountPercent?: number;
}

export interface OrderDeal {
  id: string;
  listingId: string;
  title: string;
  price: number;
  image: string;
  counterpartyName: string; // Seller or Buyer name
  role: 'buyer' | 'seller';
  date: string;
  status: 'Completed' | 'Reserved' | 'Active' | 'Sold';
  rating?: number;
}

/* ── Orders ───────────────────────────────────────────────────────────────
   A buyer-placed request, distinct from OrderDeal above: an Order has a
   lifecycle the seller drives, whereas a Deal is the record written once the
   handover actually happened. Completing an Order creates the Deal.          */

export type OrderStatus =
  | 'HELD'      // Withheld from an unverified seller, awaiting admin review
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'COMPLETED'
  | 'CANCELLED';

/**
 * Transitions the server says the viewer may perform right now. `release` and
 * `fulfil` are admin-only and only ever appear on a HELD order.
 */
export type OrderAction = 'accept' | 'decline' | 'complete' | 'cancel' | 'release' | 'fulfil';

export interface OrderItem {
  id: string;
  listingId?: string; // Absent once the seller removes the listing
  title: string;      // Snapshot - survives a rename or removal
  image?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  reference: string;
  counterparty: { id: string; name: string; avatar?: string };
  /**
   * Who placed the order. Sent to admins only - the two trading parties have
   * each other as `counterparty`, and a held order's seller must not see it.
   */
  buyer?: { id: string; name: string; avatar?: string; email?: string; phone?: string };
  role: 'buyer' | 'seller'; // Which side the viewer is on
  status: OrderStatus;
  total: number;
  meetupZone?: CampusZone;
  buyerNote?: string;
  sellerNote?: string;
  adminNote?: string;
  /** Set only when an admin supplied the goods instead of the seller. */
  fulfilledByAdminName?: string;
  items: OrderItem[];
  itemCount: number;
  availableActions: OrderAction[];
  respondedAt?: string;
  completedAt?: string;
  createdAt: string;
}

/* ── Home-page promo panels ───────────────────────────────────────────────
   Admin-editable carousel slides and "Special offers" tiles. Both share one
   shape; `placement` decides which grid renders it.                         */

export type PromoPlacement = 'CAROUSEL' | 'BENTO';

export type PromoTheme = 'BLUE' | 'GREEN' | 'PURPLE' | 'DARK' | 'AMBER';

export interface PromoSlot {
  id: string;
  placement: PromoPlacement;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  /** In-app path only, e.g. "/browse?type=Food". Enforced server-side. */
  ctaLink?: string;
  badge?: string;
  imageUrl?: string;
  /** 0-100 scrim over the image so the copy stays readable. */
  imageOverlay: number;
  theme: PromoTheme;
  wide: boolean;
  active: boolean;
  sortOrder: number;
  updatedAt?: string;
}

/** Gradient per theme. Kept here so admins pick a name, never CSS. */
export const PROMO_THEME_GRADIENT: Record<PromoTheme, string> = {
  BLUE: 'from-[#2563eb] via-[#4f7df1] to-[#8455ef]',
  GREEN: 'from-[#007d55] via-[#00996b] to-[#00b894]',
  PURPLE: 'from-[#8455ef] via-[#9b7af3] to-[#b794f6]',
  DARK: 'from-[#0b1c30] via-[#1a2d4a] to-[#2a3e5c]',
  AMBER: 'from-[#c2410c] via-[#ea580c] to-[#f59e0b]',
};

/** Softer tint for the smaller bento tiles, which sit on a light page. */
export const PROMO_THEME_TILE: Record<PromoTheme, { bg: string; text: string }> = {
  BLUE: { bg: 'bg-gradient-to-br from-[#eff4ff] to-[#dbe1ff]', text: 'text-[#2563eb]' },
  GREEN: { bg: 'bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7]', text: 'text-[#007d55]' },
  PURPLE: { bg: 'bg-gradient-to-br from-[#faf5ff] to-[#f3e8ff]', text: 'text-[#8455ef]' },
  DARK: { bg: 'bg-gradient-to-br from-[#e8edf5] to-[#cbd5e6]', text: 'text-[#0b1c30]' },
  AMBER: { bg: 'bg-gradient-to-br from-[#fff7ed] to-[#ffedd5]', text: 'text-[#c2410c]' },
};

export const PROMO_THEMES: { value: PromoTheme; label: string }[] = [
  { value: 'BLUE', label: 'Blue' },
  { value: 'GREEN', label: 'Green' },
  { value: 'PURPLE', label: 'Purple' },
  { value: 'DARK', label: 'Navy' },
  { value: 'AMBER', label: 'Amber' },
];

/* ── Search ───────────────────────────────────────────────────────────── */

/** One row in the search-as-you-type dropdown. */
export interface Suggestion {
  /** "listing" opens that listing; "category" runs a filtered search. */
  kind: 'listing' | 'category';
  id: string;
  label: string;
  /** Type chip for listings, listing count for categories. */
  detail?: string;
  image?: string;
  price?: number;
}

export interface Suggestions {
  listings: Suggestion[];
  categories: Suggestion[];
}

/** Everything the search results page can narrow by. URL-synced. */
export interface SearchFilters {
  q: string;
  type: 'All' | ListingCategory;
  categoryId: string;
  campusZone: CampusZone | '';
  condition: ListingCondition | '';
  minPrice: string;
  maxPrice: string;
  sort: string;
}

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  q: '', type: 'All', categoryId: '', campusZone: '',
  condition: '', minPrice: '', maxPrice: '', sort: 'newest',
};

export interface MessageThread {
  id: string;
  peerName: string;
  peerAvatar: string;
  lastMessage: string;
  time: string;
  unreadCount: number;
  role: 'Buying' | 'Selling' | 'Mediating';
  listingTitle: string;
  listingPrice: string;
  listingImage: string;
  messages: {
    id: string;
    sender: 'me' | 'peer';
    text: string;
    timestamp: string;
  }[];
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export type ViewType =
  | 'browse'
  | 'search'
  | 'detail'
  | 'sell'
  | 'profile'
  | 'saved'
  | 'messages'
  | 'orders'
  | 'cart'
  | 'deals'
  | 'notifications'
  | 'my-listings'
  | 'help'
  | 'legal'
  | 'notFound'
  | 'admin'
  | 'support'
  | 'auth';

/**
 * Adding to the cart, from wherever it is offered.
 *
 * `event` exists because most of the buttons sit inside a card that navigates
 * on click, and every one of them has to stop that; `quantity` because the
 * detail page lets you choose one before committing, while a card's quick-add
 * means exactly one.
 */
export interface AddToCartOptions {
  quantity?: number;
  event?: React.MouseEvent;
}

/** Resolves `false` on a failed add, so a caller with its own success animation
 *  (the detail page's "Added!" state) doesn't play it over a failure toast. */
export type AddToCart = (listing: Listing, options?: AddToCartOptions) => void | Promise<void | boolean>;

/**
 * Who an email campaign goes to.
 *
 * <p>Marketing consent is applied on top of every one of these by the server,
 * so no value here reaches someone who opted out.
 */
export type CampaignAudience = 'ALL' | 'BUYERS' | 'SELLERS' | 'APPROVED_SELLERS';

/** One admin-composed email, as the console sees it. */
export interface EmailCampaign {
  id: string;
  subject: string;
  body: string;
  audience: CampaignAudience;
  /**
   * SENDING is also where a crashed send is left - the server cannot resume
   * one, so a campaign stuck in SENDING has to be judged from the counts.
   */
  status: 'DRAFT' | 'SENDING' | 'SENT' | 'FAILED';
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  /** Why a FAILED campaign never started. Null otherwise. */
  error?: string | null;
  createdAt: string;
  sentAt?: string | null;
}

/**
 * One message in the thread between an admin and a seller applicant, held
 * before (and after) the application is decided.
 */
export interface ApplicationMessage {
  id: string;
  fromAdmin: boolean;
  senderName: string;
  body: string;
  createdAt: string;
  /** Whether the side it was written to has opened the thread since. */
  read: boolean;
}
