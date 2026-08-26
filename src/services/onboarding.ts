/**
 * The onboarding engine: which explanation is due, for whom, and when to stop.
 *
 * <p>The app already had a first-visit card on the feed, and it worked for the
 * one thing it explained. Everything else - that ordering opens a chat, that a
 * seller account is applied for rather than switched on, that nothing is paid
 * online - was learned by walking into it. Adding a second card, then a third,
 * would have produced three independent dismissals, three storage keys and no
 * answer to "has this person seen the important one yet".
 *
 * <p>So the decision lives in one place. A flow is an ordered list of steps
 * with an audience test; a step may point at a real element in the chrome and
 * may carry its own condition. The engine picks at most one step across all
 * flows for the current moment, and remembers how far each flow got.
 *
 * <p>Two rules the rest of the app depends on:
 *
 * <ul>
 *   <li>Never more than one step on screen. Two tooltips fighting for the same
 *       corner is worse than teaching nothing.
 *   <li>Progress is per user id. A shared campus machine must not show the next
 *       person a half-finished tour, or hide one they have never seen.
 * </ul>
 *
 * <p>The engine is deliberately free of React and of the DOM so the selection
 * rules can be tested as plain functions - see onboarding.test.ts.
 */

import type { AuthSession, ViewType } from '../types';
import { readStored, writeStored, removeStored } from '../utils/storage';

/** Everything a flow or step is allowed to decide against. */
export interface OnboardingContext {
  user: AuthSession;
  view: ViewType;
  cartCount: number;
  savedCount: number;
  /** False while the session request is still in flight - nothing shows. */
  ready: boolean;
}

export type StepPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  /**
   * Value of a `data-onboarding` attribute somewhere in the tree. When it
   * resolves, the step is drawn as a tooltip pointing at that element; when it
   * does not - the element is behind a breakpoint, or that screen is not
   * mounted - the step falls back to a centred card rather than vanishing.
   */
  target?: string;
  placement?: StepPlacement;
  /**
   * Hold the step back until its target is actually on screen.
   *
   * <p>For anchors that only exist once there is data behind them - an order
   * card, a saved item, an open thread. The centred fallback is right for a
   * control hidden by a breakpoint, and wrong here: explaining the buttons on
   * an order to someone looking at an empty Orders page teaches nothing and
   * spends the one time they were willing to read a tip. The step stays due,
   * and appears the next time they open that page with something on it.
   */
  requiresTarget?: boolean;
  /** Extra gate on top of the flow's audience, evaluated per render. */
  when?: (ctx: OnboardingContext) => boolean;
  /** Label on the advance button. Defaults to Next / Got it. */
  cta?: string;
}

export interface OnboardingFlow {
  id: string;
  /**
   * Bump when the steps change meaningfully. Stored progress at an older
   * version is treated as unseen, so a rewritten tour is shown again rather
   * than silently skipped for everyone who finished the old one.
   */
  version: number;
  /** Lower runs first when two flows are both eligible. */
  priority: number;
  audience: (ctx: OnboardingContext) => boolean;
  steps: OnboardingStep[];
}

export type FlowStatus = 'active' | 'done' | 'skipped';

export interface FlowProgress {
  version: number;
  /** Index of the step the user is on. Equals the step count once finished. */
  stepIndex: number;
  status: FlowStatus;
  updatedAt: number;
}

export type OnboardingProgress = Record<string, FlowProgress>;

// Flow definitions

const isGuest = (ctx: OnboardingContext) => ctx.user.role === 'guest';
const isAdmin = (ctx: OnboardingContext) => ctx.user.role === 'admin';

/**
 * How trading here works. The one flow that matters: it covers the three
 * assumptions a newcomer arrives with that are wrong.
 */
const marketplaceBasics: OnboardingFlow = {
  id: 'marketplace-basics',
  version: 1,
  priority: 0,
  audience: (ctx) => !isAdmin(ctx),
  steps: [
    {
      id: 'welcome',
      title: 'Welcome to CampusMarket',
      body: 'Students buying and selling to each other, on campus. Thirty seconds and you will know how it works.',
      cta: 'Show me',
    },
    {
      id: 'search',
      title: 'Start with what you need',
      body: 'Search across products, services and food. Sellers are other students, so stock moves fast.',
      target: 'nav-search',
      placement: 'bottom',
    },
    {
      id: 'zones',
      title: 'Filter by zone',
      body: 'Downschool, Upschool or Across. Pick yours so you are not walking across town for a charger.',
      target: 'feed-zones',
      placement: 'bottom',
      // Only while the feed is on screen; the filter row is not mounted anywhere else.
      when: (ctx) => ctx.view === 'browse' || ctx.view === 'search',
    },
    {
      id: 'chat',
      title: 'Ordering opens a chat',
      body: 'Placing an order starts a thread with the seller. Where and when you meet is agreed there, not by the app.',
      target: 'nav-messages',
      placement: 'bottom',
    },
    {
      id: 'handover',
      title: 'Pay on handover',
      body: 'Nothing is paid through CampusMarket. Money changes hands when the item does - in person, both of you present.',
      cta: 'Got it',
    },
  ],
};

/** Only reachable once an account exists, so it never competes with the above. */
const accountNextSteps: OnboardingFlow = {
  id: 'account-next-steps',
  version: 1,
  priority: 1,
  audience: (ctx) => !isGuest(ctx) && !isAdmin(ctx) && !ctx.user.canSell,
  steps: [
    {
      id: 'saved',
      title: 'Keep a shortlist',
      body: 'Save anything you are undecided about. It is stored against your account, so it follows you to another device.',
      target: 'nav-saved',
      placement: 'bottom',
    },
    {
      id: 'become-seller',
      title: 'Want to sell too?',
      body: 'Apply from the account menu. An admin reviews it, and your account keeps everything it already has.',
      target: 'nav-account',
      placement: 'bottom',
      cta: 'Got it',
    },
  ],
};

/** Shown once the server says this account may actually list. */
const sellerSetup: OnboardingFlow = {
  id: 'seller-setup',
  version: 1,
  priority: 2,
  audience: (ctx) => !isGuest(ctx) && !isAdmin(ctx) && ctx.user.canSell,
  steps: [
    {
      id: 'first-listing',
      title: 'Post your first listing',
      body: 'Photos, a price and a zone. Listings without a photo are the ones nobody opens.',
      target: 'nav-sell',
      placement: 'bottom',
      // Nothing to teach someone who has already done it.
      when: (ctx) => !ctx.user.hasActiveListings,
    },
    {
      id: 'orders',
      title: 'Orders arrive here',
      body: 'Accept or decline, then agree the handover in chat. Leaving an order pending is how a buyer decides you are unreliable.',
      target: 'nav-orders',
      placement: 'bottom',
    },
    {
      id: 'mark-sold',
      title: 'Mark it sold',
      body: 'Once money and item have changed hands, close the listing. Stale listings are the top complaint on campus boards.',
      target: 'nav-my-listings',
      placement: 'bottom',
      cta: 'Got it',
    },
  ],
};

/*
 * Page flows.
 *
 * The three above are journeys - they follow a person across screens. These
 * are the opposite: one or two lines that only make sense while you are
 * standing on a particular page, and are worthless anywhere else.
 *
 * They sit below the journeys in priority on purpose. Someone still being told
 * how the marketplace works should not have that interrupted by a note about
 * the photo grid; the page tip is still there the next time they open Sell.
 */

/** Shorthand for the shape every page flow shares. */
function pageFlow(
  id: string,
  view: ViewType | ViewType[],
  priority: number,
  steps: OnboardingStep[],
  audience: (ctx: OnboardingContext) => boolean = () => true,
): OnboardingFlow {
  const views = Array.isArray(view) ? view : [view];
  return {
    id,
    version: 1,
    priority,
    audience: (ctx) => !isAdmin(ctx) && views.includes(ctx.view) && audience(ctx),
    steps,
  };
}

const detailPage = pageFlow(
  'page-detail',
  'detail',
  10,
  [
    {
      id: 'detail-action',
      title: 'Nothing is charged here',
      body: 'Adding to cart or requesting a booking tells the seller you want it. No card, no payment - you settle in person.',
      target: 'detail-primary',
      placement: 'top',
    },
    {
      id: 'detail-chat',
      title: 'Ask before you commit',
      body: 'Still available? Will you meet at Upschool? Chat first - it is the same seller you will be handing money to.',
      target: 'detail-chat',
      placement: 'top',
      cta: 'Got it',
    },
  ],
  // A guest sees a sign-in prompt where these buttons are, so both steps would
  // point at controls that are not there and describe an action they cannot take.
  (ctx) => !isGuest(ctx),
);

const cartPage = pageFlow('page-cart', 'cart', 11, [
  {
    id: 'cart-per-seller',
    title: 'One order per seller',
    body: 'Checking out splits the basket by seller and opens a thread with each of them. Nothing leaves your account.',
    target: 'cart-checkout',
    requiresTarget: true,
    placement: 'top',
    cta: 'Got it',
  },
]);

const sellPage = pageFlow(
  'page-sell',
  'sell',
  12,
  [
    {
      id: 'sell-type',
      title: 'Pick what it is first',
      body: 'Product, service or food. The rest of the form changes to match - a tutoring slot and a desk fan do not need the same fields.',
      target: 'sell-type',
      placement: 'bottom',
    },
    {
      id: 'sell-photos',
      title: 'Photos do the selling',
      body: 'The first one is the cover. A real photo of the actual item beats a catalogue picture every time.',
      target: 'sell-photos',
      placement: 'bottom',
    },
    {
      id: 'sell-publish',
      title: 'Publish when it is ready',
      body: 'Anything still missing is listed next to the button. Save a draft if you want to finish it later.',
      target: 'sell-publish',
      placement: 'top',
      cta: 'Got it',
    },
  ],
  (ctx) => ctx.user.canSell,
);

const ordersPage = pageFlow('page-orders', 'orders', 13, [
  {
    id: 'orders-actions',
    title: 'Answer, then arrange',
    body: 'Accept or decline from here, and settle the handover in the chat. An order left pending is what makes people give up on a seller.',
    target: 'orders-actions',
    requiresTarget: true,
    placement: 'top',
    cta: 'Got it',
  },
]);

const messagesPage = pageFlow('page-messages', 'messages', 14, [
  {
    id: 'messages-thread',
    title: 'One thread per deal',
    body: 'Every order opens its own conversation, with the listing pinned to the top of it so neither of you loses track of which item this is.',
    target: 'messages-thread',
    requiresTarget: true,
    placement: 'bottom',
  },
  {
    /*
     * Second, and target-gated: on a phone the list and the conversation are
     * different screens, so the composer does not exist until a thread is
     * opened. The step waits rather than pointing at the list it is not about.
     */
    id: 'messages-arrange',
    title: 'Agree the handover here',
    body: 'Place, time, and what you are bringing. Keep it in the thread - a screenshot of what was agreed is worth having.',
    target: 'messages-composer',
    requiresTarget: true,
    placement: 'top',
    cta: 'Got it',
  },
]);

const myListingsPage = pageFlow(
  'page-my-listings',
  'my-listings',
  15,
  [
    {
      id: 'listings-status',
      title: 'Keep the status honest',
      body: 'Reserved while someone is on their way, Sold once it is gone. Stale listings are the top complaint on campus boards.',
      target: 'listings-tabs',
      placement: 'bottom',
      cta: 'Got it',
    },
  ],
  (ctx) => ctx.user.canSell,
);

const savedPage = pageFlow('page-saved', 'saved', 16, [
  {
    id: 'saved-move',
    title: 'Saving is not holding',
    body: 'A saved item is still on sale to everyone else. If you want it, message the seller.',
    target: 'saved-first',
    requiresTarget: true,
    placement: 'bottom',
    cta: 'Got it',
  },
]);

/** Every flow the engine knows about, in registration order. */
export const FLOWS: OnboardingFlow[] = [
  marketplaceBasics,
  accountNextSteps,
  sellerSetup,
  detailPage,
  cartPage,
  sellPage,
  ordersPage,
  messagesPage,
  myListingsPage,
  savedPage,
];

// Persistence

const KEY_PREFIX = 'cm_onboarding';

/**
 * Guests share one bucket rather than getting none.
 *
 * <p>A guest has no id to scope by, but is exactly the person the basics flow
 * is written for - keying them out of storage would replay step one on every
 * page load. Signing in moves them onto their account's own record.
 */
function keyFor(user: AuthSession): string {
  const id = user.role === 'guest' || !user.id ? 'guest' : user.id;
  return `${KEY_PREFIX}:${id}`;
}

export function loadProgress(user: AuthSession): OnboardingProgress {
  const raw = readStored(keyFor(user));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as OnboardingProgress;
  } catch {
    // A hand-edited or half-written value is not worth rescuing; treating it as
    // "seen nothing" replays a tour, which is recoverable. Throwing is not.
    return {};
  }
}

export function saveProgress(user: AuthSession, progress: OnboardingProgress): void {
  writeStored(keyFor(user), JSON.stringify(progress));
}

/** Wipes this user's record, so every eligible flow runs again from step one. */
export function resetProgress(user: AuthSession): void {
  removeStored(keyFor(user));
}

// Selection

export interface DueStep {
  flow: OnboardingFlow;
  step: OnboardingStep;
  /** Zero-based position of `step` among the flow's *visible* steps. */
  index: number;
  /** How many steps of this flow are visible in the current context. */
  total: number;
}

/**
 * Steps whose own `when` passes right now.
 *
 * <p>Progress counts against this filtered list, not the raw one: a step that
 * is inapplicable today must not leave the flow permanently parked on it.
 */
function visibleSteps(flow: OnboardingFlow, ctx: OnboardingContext): OnboardingStep[] {
  return flow.steps.filter((s) => !s.when || s.when(ctx));
}

function isOpen(progress: OnboardingProgress, flow: OnboardingFlow): boolean {
  const record = progress[flow.id];
  if (!record) return true;
  // Older version, so the record describes a tour that no longer exists.
  if (record.version !== flow.version) return true;
  return record.status === 'active';
}

/**
 * The single step to show, or null for "nothing right now".
 *
 * <p>Order is by flow priority, and the first eligible flow wins outright - a
 * lower-priority flow does not get to interleave a step of its own between two
 * of someone else's.
 */
export function selectDueStep(
  ctx: OnboardingContext,
  progress: OnboardingProgress,
): DueStep | null {
  if (!ctx.ready) return null;
  // A suspended or banned account is being told something more important.
  if (ctx.user.isSuspended || ctx.user.isBanned) return null;

  const candidates = [...FLOWS].sort((a, b) => a.priority - b.priority);

  for (const flow of candidates) {
    if (!flow.audience(ctx)) continue;
    if (!isOpen(progress, flow)) continue;

    const steps = visibleSteps(flow, ctx);
    if (steps.length === 0) continue;

    const record = progress[flow.id];
    const at = record && record.version === flow.version ? record.stepIndex : 0;
    if (at >= steps.length) continue;

    return { flow, step: steps[at], index: at, total: steps.length };
  }

  return null;
}

/** Progress after advancing `flow` by one step. Completes it at the end. */
export function advanced(
  progress: OnboardingProgress,
  flow: OnboardingFlow,
  total: number,
): OnboardingProgress {
  const record = progress[flow.id];
  const at = record && record.version === flow.version ? record.stepIndex : 0;
  const next = at + 1;
  return {
    ...progress,
    [flow.id]: {
      version: flow.version,
      stepIndex: next,
      status: next >= total ? 'done' : 'active',
      updatedAt: Date.now(),
    },
  };
}

/** Progress after the user closes `flow`. It does not come back. */
export function skipped(
  progress: OnboardingProgress,
  flow: OnboardingFlow,
): OnboardingProgress {
  return {
    ...progress,
    [flow.id]: {
      version: flow.version,
      stepIndex: flow.steps.length,
      status: 'skipped',
      updatedAt: Date.now(),
    },
  };
}
