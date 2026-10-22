'use client';

import { cloneElement, isValidElement } from 'react';
import type { ReactElement } from 'react';
import { useTutorial } from '@/contexts/tutorial-context';

/**
 * Tags a real UI element as a coachmark target for the tutorial engine
 * (see tutorial-context.tsx / tutorial-overlay.tsx). `id` must match a
 * TutorialStep.id from the api's tutorial content — the overlay finds this
 * element via `[data-tutorial-id="<id>"]` and draws a spotlight around it.
 *
 * Attaches the attribute directly onto its child (via cloneElement) rather
 * than wrapping in a span, so it never affects layout — pass exactly one
 * element child that accepts a `data-tutorial-id` prop (any DOM element or
 * a component that forwards unknown props, which every `components/ui`
 * primitive here does).
 *
 * Also wires hover: mousing over the element sets it as the tutorial
 * context's `peekedId`, which tutorial-overlay.tsx shows immediately (even
 * if this step was already dismissed) — a permanent "hover to remind me"
 * affordance, not just a one-time popup. Any existing mouse handlers on the
 * child are preserved and still called.
 */
export function TutorialAnchor({ id, children }: { id: string; children: React.ReactNode }) {
  const { setPeekedId } = useTutorial();
  if (!isValidElement(children)) return <>{children}</>;
  const child = children as ReactElement<{
    'data-tutorial-id'?: string;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
  }>;
  return cloneElement(child, {
    'data-tutorial-id': id,
    onMouseEnter: (e: React.MouseEvent) => {
      child.props.onMouseEnter?.(e);
      setPeekedId(id);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      child.props.onMouseLeave?.(e);
      setPeekedId((current) => (current === id ? null : current));
    },
  });
}
