import { describe, it, expect, beforeEach } from 'vitest';
import type { AuthSession } from '../types';
import {
  FLOWS, OnboardingContext, OnboardingProgress,
  advanced, loadProgress, resetProgress, saveProgress, selectDueStep, skipped,
} from './onboarding';

const guest: AuthSession = {
  id: 'guest',
  name: 'Guest Visitor',
  email: '',
  avatar: '',
  role: 'guest',
  accountType: 'BUYER',
  sellerApprovalStatus: 'NOT_REQUESTED',
  canSell: false,
  hasActiveListings: false,
};

const buyer: AuthSession = {
  ...guest,
  id: 'u1',
  name: 'Buyer',
  role: 'customer',
};

const seller: AuthSession = { ...buyer, id: 'u2', canSell: true, accountType: 'SELLER' };
const admin: AuthSession = { ...buyer, id: 'a1', role: 'admin' };

const ctxFor = (user: AuthSession, over: Partial<OnboardingContext> = {}): OnboardingContext => ({
  user,
  view: 'browse',
  cartCount: 0,
  savedCount: 0,
  ready: true,
  ...over,
});

const basics = FLOWS.find((f) => f.id === 'marketplace-basics')!;
const sellerFlow = FLOWS.find((f) => f.id === 'seller-setup')!;

describe('selectDueStep', () => {
  it('shows nothing until the session has resolved', () => {
    expect(selectDueStep(ctxFor(guest, { ready: false }), {})).toBeNull();
  });

  it('starts a new visitor on the first step of the basics flow', () => {
    const due = selectDueStep(ctxFor(guest), {});
    expect(due?.flow.id).toBe('marketplace-basics');
    expect(due?.step.id).toBe('welcome');
    expect(due?.index).toBe(0);
  });

  it('teaches admins nothing - the console is a different app', () => {
    expect(selectDueStep(ctxFor(admin), {})).toBeNull();
  });

  it('says nothing to a suspended or banned account', () => {
    expect(selectDueStep(ctxFor({ ...buyer, isSuspended: true }), {})).toBeNull();
    expect(selectDueStep(ctxFor({ ...buyer, isBanned: true }), {})).toBeNull();
  });

  it('runs one flow to the end before starting the next', () => {
    // A seller is eligible for both basics and seller-setup. Basics is first.
    let progress: OnboardingProgress = {};
    const ctx = ctxFor(seller);

    for (let i = 0; i < 20; i++) {
      const due = selectDueStep(ctx, progress);
      if (!due || due.flow.id !== 'marketplace-basics') break;
      progress = advanced(progress, due.flow, due.total);
    }

    expect(progress['marketplace-basics'].status).toBe('done');
    expect(selectDueStep(ctx, progress)?.flow.id).toBe('seller-setup');
  });

  it('skips a step whose own condition fails, and does not park on it', () => {
    // The zone step is feed-only. Away from the feed it should be absent, and
    // the flow should still be able to run to completion.
    const off = ctxFor(guest, { view: 'messages' });
    const stepIds = [];
    let progress: OnboardingProgress = {};
    for (let i = 0; i < 20; i++) {
      const due = selectDueStep(off, progress);
      if (!due || due.flow.id !== 'marketplace-basics') break;
      stepIds.push(due.step.id);
      progress = advanced(progress, due.flow, due.total);
    }
    expect(stepIds).not.toContain('zones');
    expect(stepIds).toContain('handover');
    expect(progress['marketplace-basics'].status).toBe('done');
  });

  it('does not offer the seller flow to an account that cannot list', () => {
    const progress = skipped({}, basics);
    expect(selectDueStep(ctxFor(buyer), progress)?.flow.id).toBe('account-next-steps');
  });

  it('drops the first-listing step once the seller has one', () => {
    const progress = { ...skipped({}, basics) };
    const due = selectDueStep(ctxFor({ ...seller, hasActiveListings: true }), progress);
    expect(due?.flow.id).toBe('seller-setup');
    expect(due?.step.id).toBe('orders');
  });

  it('treats stored progress from an older version as unseen', () => {
    const stale: OnboardingProgress = {
      [basics.id]: { version: basics.version - 1, stepIndex: 99, status: 'done', updatedAt: 0 },
    };
    expect(selectDueStep(ctxFor(guest), stale)?.step.id).toBe('welcome');
  });
});

describe('advanced / skipped', () => {
  it('marks a flow done on the last step', () => {
    const p = advanced({}, sellerFlow, 1);
    expect(p[sellerFlow.id].status).toBe('done');
  });

  it('closes the whole flow on skip, not just the current step', () => {
    const p = skipped({}, basics);
    expect(p[basics.id].status).toBe('skipped');
    expect(selectDueStep(ctxFor(guest), p)?.flow.id).not.toBe(basics.id);
  });
});

describe('persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips progress for a user', () => {
    const p = advanced({}, basics, 5);
    saveProgress(buyer, p);
    expect(loadProgress(buyer)).toEqual(p);
  });

  it('keeps one account out of another account record', () => {
    saveProgress(buyer, skipped({}, basics));
    expect(loadProgress(seller)).toEqual({});
  });

  it('survives a corrupted value rather than throwing', () => {
    localStorage.setItem('cm_onboarding:u1', '{not json');
    expect(loadProgress(buyer)).toEqual({});
  });

  it('reset clears the record', () => {
    saveProgress(buyer, skipped({}, basics));
    resetProgress(buyer);
    expect(loadProgress(buyer)).toEqual({});
  });
});
