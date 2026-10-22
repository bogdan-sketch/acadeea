'use client';

import type { ReactElement, ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Near-instant tooltip for icon-only controls.
 *
 * `label` is the control's accessible name, `detail` the one-line explanation shown on hover.
 * The trigger is the element passed as `children` (button, link); it gets a
 * generous invisible hit area via `hint-trigger` so the tooltip opens before
 * the cursor is exactly on the icon.
 */
export function Hint({
  label,
  detail,
  side = 'bottom',
  children,
}: {
  label: string;
  detail?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactElement;
}) {
  // One short line: the explanation when given, the control's name otherwise.
  const text = (detail ?? label).trim();
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger render={children} delay={60} closeDelay={40} className="hint-trigger" />
      <TooltipContent
        side={side}
        sideOffset={8}
        className="max-w-none whitespace-nowrap px-3 py-1.5 text-[13px] font-medium"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export type HintProps = { label: string; detail?: string; children?: ReactNode };
