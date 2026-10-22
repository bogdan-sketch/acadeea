'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { tutorial as tutorialApi } from '@/lib/api';
import type { TutorialFlow } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';

/**
 * Tutorial mode is a PER-USER preference (Profil → Preferințe), not an
 * admin/org switch — every user decides for themselves whether they want
 * contextual hints, same as "Mod întunecat". State lives in localStorage,
 * keyed by user id so it persists per account on a shared device without a
 * backend field (mirrors the existing "Ziua mea" board-filter pattern).
 *
 * Interaction model (contextual, not a forced next/next tour — see
 * research notes in the commit that introduced this): each <TutorialAnchor>
 * shows its OWN small tip the first time it renders while enabled, unless
 * already dismissed — no full-screen scrim, nothing blocks the page. A
 * manual "Pornește turul" from the help center still exists for a
 * user-triggered guided replay (the literature says user-triggered tours
 * outperform auto-triggered ones), sequencing through one flow's steps.
 *
 * Two more ways to see a hint, both handled by tutorial-overlay.tsx:
 * - Hover any anchored field (`peekedId` here) to preview its tip on demand,
 *   even after it's been dismissed — a permanent "peek" affordance, not
 *   just a one-time popup.
 * - A per-page "Ascunde sfaturile" button dismisses every hint on the
 *   CURRENT page/route only (kept in local state in the overlay, reset on
 *   navigation) — hints on other pages are unaffected and still show
 *   normally when you land there.
 */
interface TutorialContextValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  flows: TutorialFlow[];
  /** True if this step has been dismissed (or completed via a tour) and shouldn't auto-show again. */
  isDismissed: (stepId: string) => boolean;
  dismiss: (stepId: string) => void;
  /** Manual guided replay, one flow at a time — see Help Center. */
  activeFlow: TutorialFlow | null;
  stepIndex: number;
  start: (flowId: string) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  /** Hover-to-peek (web) — set by <TutorialAnchor> on mouse enter/leave. Shows
   * that step's tip immediately, even if already dismissed, while hovered. */
  peekedId: string | null;
  setPeekedId: React.Dispatch<React.SetStateAction<string | null>>;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

function storageKey(userId: string | undefined, suffix: string) {
  return `tutorial.${userId ?? 'anon'}.${suffix}`;
}

function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private-browsing / storage blocked — the in-memory state still applies this session.
  }
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [enabled, setEnabledState] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [flows, setFlows] = useState<TutorialFlow[]>([]);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [peekedId, setPeekedId] = useState<string | null>(null);

  // Load this user's local prefs once authenticated.
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setEnabledState(false);
      setDismissed(new Set());
      setFlows([]);
      return;
    }
    try {
      setEnabledState(localStorage.getItem(storageKey(user.id, 'enabled')) === '1');
      const raw = localStorage.getItem(storageKey(user.id, 'dismissed'));
      setDismissed(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      // Private-browsing / storage blocked — tutorial just stays off.
    }
    tutorialApi
      .content()
      .then((res) => setFlows(res.flows))
      .catch(() => setFlows([]));
  }, [isAuthenticated, user]);

  const setEnabled = useCallback(
    (v: boolean) => {
      setEnabledState(v);
      safeSetItem(storageKey(user?.id, 'enabled'), v ? '1' : '0');
    },
    [user?.id],
  );

  const dismiss = useCallback(
    (stepId: string) => {
      setDismissed((prev) => {
        const next = new Set(prev).add(stepId);
        safeSetItem(storageKey(user?.id, 'dismissed'), JSON.stringify([...next]));
        return next;
      });
    },
    [user?.id],
  );

  const isDismissed = useCallback((stepId: string) => dismissed.has(stepId), [dismissed]);

  const activeFlow = useMemo(
    () => flows.find((f) => f.id === activeFlowId) ?? null,
    [flows, activeFlowId],
  );

  const start = useCallback((flowId: string) => {
    setActiveFlowId(flowId);
    setStepIndex(0);
  }, []);

  const stop = useCallback(() => {
    setActiveFlowId(null);
    setStepIndex(0);
  }, []);

  const next = useCallback(() => {
    if (!activeFlow) return;
    // Mark the step we're leaving as seen so it doesn't also auto-pop later.
    dismiss(activeFlow.steps[stepIndex].id);
    if (stepIndex + 1 >= activeFlow.steps.length) {
      stop();
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [activeFlow, stepIndex, dismiss, stop]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  return (
    <TutorialContext.Provider
      value={{
        enabled,
        setEnabled,
        flows,
        isDismissed,
        dismiss,
        activeFlow,
        stepIndex,
        start,
        next,
        prev,
        stop,
        peekedId,
        setPeekedId,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used within TutorialProvider');
  return ctx;
}
