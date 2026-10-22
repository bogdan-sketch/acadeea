'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTutorial } from '@/contexts/tutorial-context';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, Lightbulb, EyeOff } from 'lucide-react';
import type { TutorialFlow, TutorialStep } from '@/lib/types';

/**
 * Contextual tutorial hint — NOT a full-screen forced tour. Three ways a
 * hint shows, in priority order (see tutorial-context.tsx docblock):
 *
 * 1. Hover-peek: hovering any <TutorialAnchor> shows its tip immediately,
 *    even if dismissed — takes priority over everything else while active.
 * 2. Tour mode: a manual "Pornește turul" from the help center follows a
 *    flow's steps in order (Prev/Next + counter).
 * 3. Auto mode (default, lowest priority): the first anchor on the page
 *    that isn't permanently dismissed AND isn't dismissed for this page
 *    visit ("Ascunde sfaturile" below) shows its tip once, with a single
 *    "Am înțeles" that dismisses it forever.
 *
 * A floating "Ascunde sfaturile" pill (bottom-left, only when there's at
 * least one hint showable on this page) hides every hint on the CURRENT
 * route only — cleared automatically on navigation, so other pages are
 * unaffected and this page's hints come back on a future visit.
 */
export function TutorialOverlay() {
  const {
    enabled,
    flows,
    isDismissed,
    dismiss,
    activeFlow,
    stepIndex,
    next,
    prev,
    stop,
    peekedId,
  } = useTutorial();
  const pathname = usePathname();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [target, setTarget] = useState<{
    flow: TutorialFlow;
    step: TutorialStep;
    mode: 'peek' | 'tour' | 'auto';
  } | null>(null);
  const [routeDismissed, setRouteDismissed] = useState<Set<string>>(new Set());
  const [anyHintOnPage, setAnyHintOnPage] = useState(false);

  // Route changed — this page's "Ascunde sfaturile" no longer applies elsewhere.
  useEffect(() => {
    setRouteDismissed(new Set());
  }, [pathname]);

  const findFlowStep = (id: string) => {
    const flow = flows.find((f) => f.steps.some((s) => s.id === id));
    const step = flow?.steps.find((s) => s.id === id);
    return flow && step ? { flow, step } : null;
  };

  useEffect(() => {
    if (!enabled || flows.length === 0) {
      setTarget(null);
      setAnyHintOnPage(false);
      return;
    }

    const resolve = () => {
      // 1. Hover-peek always wins, ignores dismissed state entirely.
      if (peekedId) {
        const found = findFlowStep(peekedId);
        const el = document.querySelector(`[data-tutorial-id="${CSS.escape(peekedId)}"]`);
        if (found && el) {
          setTarget({ ...found, mode: 'peek' });
          setRect(el.getBoundingClientRect());
          return;
        }
      }

      // 2. Tour mode.
      if (activeFlow) {
        const step = activeFlow.steps[stepIndex];
        const el = step && document.querySelector(`[data-tutorial-id="${CSS.escape(step.id)}"]`);
        setTarget(el ? { flow: activeFlow, step, mode: 'tour' } : null);
        setRect(el ? el.getBoundingClientRect() : null);
        return;
      }

      // 3. Auto mode — first eligible anchor on the page, in DOM order.
      const anchors = Array.from(document.querySelectorAll('[data-tutorial-id]'));
      let anyEligible = false;
      for (const el of anchors) {
        const id = el.getAttribute('data-tutorial-id');
        if (!id || routeDismissed.has(id)) continue;
        const found = findFlowStep(id);
        if (!found) continue;
        anyEligible = true;
        if (isDismissed(id)) continue;
        setTarget({ ...found, mode: 'auto' });
        setRect(el.getBoundingClientRect());
        setAnyHintOnPage(true);
        return;
      }
      setAnyHintOnPage(anyEligible);
      setTarget(null);
      setRect(null);
    };

    const t = setTimeout(resolve, 250); // let the page finish rendering/loading
    const observer = new MutationObserver(() => resolve());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', resolve);
    return () => {
      clearTimeout(t);
      observer.disconnect();
      window.removeEventListener('resize', resolve);
    };
  }, [enabled, flows, isDismissed, activeFlow, stepIndex, pathname, peekedId, routeDismissed]);

  const hideAllOnPage = () => {
    const ids = Array.from(document.querySelectorAll('[data-tutorial-id]'))
      .map((el) => el.getAttribute('data-tutorial-id'))
      .filter((id): id is string => !!id);
    setRouteDismissed(new Set(ids));
    setTarget(null);
    setRect(null);
  };

  const dismissAllButton =
    enabled && !activeFlow && !peekedId && anyHintOnPage ? (
      <button
        type="button"
        onClick={hideAllOnPage}
        className="fixed bottom-4 left-4 z-[100] flex items-center gap-1.5 rounded-full bg-popover px-3 py-2 text-[12px] font-semibold text-muted-foreground shadow-lg ring-1 ring-foreground/10 hover:text-foreground"
      >
        <EyeOff className="h-3.5 w-3.5" /> Ascunde sfaturile (pe pagina asta)
      </button>
    ) : null;

  if (!target || !rect) return dismissAllButton;

  const { flow, step, mode } = target;
  const inTour = mode === 'tour';
  const isPeek = mode === 'peek';

  const top = Math.min(window.innerHeight - 200, rect.bottom + 10);
  const left = Math.min(window.innerWidth - 16 - 320, Math.max(16, rect.left));

  return (
    <>
      {dismissAllButton}
      <div
        className="fixed z-[100] w-[min(20rem,calc(100vw-2rem))] rounded-lg bg-popover p-3.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
        style={{ top, left }}
        role="dialog"
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.4px] text-muted-foreground">
            <Lightbulb className="h-3 w-3 text-primary" />
            {flow.title}
            {inTour && ` · ${stepIndex + 1}/${flow.steps.length}`}
          </span>
          {!isPeek && (
            <button
              type="button"
              onClick={() => (inTour ? stop() : dismiss(step.id))}
              aria-label="Închide"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="mb-1 text-[13.5px] font-bold">{step.title}</div>
        <p
          className={
            inTour || !isPeek
              ? 'mb-3 text-[12.5px] leading-relaxed text-muted-foreground'
              : 'text-[12.5px] leading-relaxed text-muted-foreground'
          }
        >
          {step.body}
        </p>
        {inTour && (
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={prev}
              disabled={stepIndex === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Înapoi
            </Button>
            <Button type="button" size="sm" onClick={next}>
              {stepIndex + 1 >= flow.steps.length ? 'Termină' : 'Continuă'}
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {!inTour && !isPeek && (
          <Button type="button" size="sm" className="mt-3 w-full" onClick={() => dismiss(step.id)}>
            Am înțeles
          </Button>
        )}
      </div>
    </>
  );
}
