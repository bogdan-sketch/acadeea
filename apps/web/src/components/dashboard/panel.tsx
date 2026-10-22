import Link from 'next/link';
import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';

/** Dashboard card (Main.dc.html section): title + "→" link, then rows. */
export function Panel({
  title,
  href,
  linkLabel,
  className = '',
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-card ${className}`}
    >
      <div className="flex items-center justify-between px-5 pb-2 pt-3.5">
        <h2 className="text-base font-bold">{title}</h2>
        {href && linkLabel && (
          // min-h 32px keeps the text link a real target (audit M-6).
          <Link
            href={href}
            className="-mr-2 inline-flex min-h-[32px] items-center rounded-[9px] px-2 text-[13px] font-semibold text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            {linkLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Shared compact empty state inside a dashboard panel (same look as every EmptyState). */
export function EmptyRow({ children, icon = Inbox }: { children: string; icon?: LucideIcon }) {
  return (
    <div className="border-t border-border">
      <EmptyState compact icon={icon} title={children} />
    </div>
  );
}
