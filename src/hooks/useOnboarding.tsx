/**
 * React binding for the onboarding engine.
 *
 * <p>Holds the persisted progress, recomputes the due step whenever the context
 * changes, and exposes the three verbs the UI needs: next, skip, restart. All
 * of the actual rules live in services/onboarding - this file only decides
 * when to ask.
 */

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import type { AuthSession, ViewType } from '../types';
import {
  DueStep, OnboardingContext, OnboardingProgress,
  advanced, loadProgress, resetProgress, saveProgress, selectDueStep, skipped,
} from '../services/onboarding';

interface OnboardingApi {
  /** The one step to render, or null when nothing is due. */
  due: DueStep | null;
  next: () => void;
  skip: () => void;
  /** Replays every eligible flow. Wired to a link in Support. */
  restart: () => void;
}

const Ctx = createContext<OnboardingApi | null>(null);

export const OnboardingProvider: React.FC<{
  user: AuthSession;
  view: ViewType;
  cartCount: number;
  savedCount: number;
  ready: boolean;
  children: React.ReactNode;
}> = ({ user, view, cartCount, savedCount, ready, children }) => {
  const [progress, setProgress] = useState<OnboardingProgress>(() => loadProgress(user));

  /*
   * Re-read on a change of account, not on every render of a new session
   * object. Signing in swaps which record applies, and the guest bucket must
   * not leak into it - keying on the id is what makes that switch happen.
   */
  useEffect(() => {
    setProgress(loadProgress(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.role]);

  const ctx: OnboardingContext = useMemo(
    () => ({ user, view, cartCount, savedCount, ready }),
    [user, view, cartCount, savedCount, ready],
  );

  const due = useMemo(() => selectDueStep(ctx, progress), [ctx, progress]);

  /** Writes through, so a reload never replays a step already answered. */
  const commit = useCallback((updater: (p: OnboardingProgress) => OnboardingProgress) => {
    setProgress((prev) => {
      const nextProgress = updater(prev);
      saveProgress(user, nextProgress);
      return nextProgress;
    });
  }, [user]);

  const next = useCallback(() => {
    if (!due) return;
    commit((p) => advanced(p, due.flow, due.total));
  }, [due, commit]);

  const skip = useCallback(() => {
    if (!due) return;
    commit((p) => skipped(p, due.flow));
  }, [due, commit]);

  const restart = useCallback(() => {
    resetProgress(user);
    setProgress({});
  }, [user]);

  const api = useMemo<OnboardingApi>(
    () => ({ due, next, skip, restart }),
    [due, next, skip, restart],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

/**
 * Returns null outside a provider rather than throwing.
 *
 * <p>The host and the "replay the tour" link are both optional chrome. A screen
 * rendered in a test without the provider should not fail over guidance.
 */
export function useOnboarding(): OnboardingApi | null {
  return useContext(Ctx);
}
