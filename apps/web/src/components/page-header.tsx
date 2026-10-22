'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { STICKY_HEAD } from '@/lib/sticky-head';

export interface HeaderSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Small accent line above the title (prototype .eyebrow) — e.g. the date or a section label. */
  eyebrow?: string;
  /** Small muted line above the title (e.g. "38 active · 3 ies azi"). */
  meta?: string;
  actions?: ReactNode;
  /**
   * The page's own search. When given it REPLACES the global "Caută în tot
   * Horae" field so there is exactly one search per page (audit M-3).
   */
  search?: HeaderSearchProps;
}

const SEARCH_LABEL =
  'flex h-[42px] min-w-[240px] items-center gap-2 rounded-[var(--radius-ctl)] border border-border bg-card px-3.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 max-sm:min-w-0 max-sm:flex-1';

/**
 * Legacy page head — same type ramp as `PageHead` (stock/_ui/parts.tsx):
 * meta line + serif title 28/600 (34 from `sm`), actions right-aligned,
 * one layout for every width (no separate 17px mobile bar).
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  meta,
  actions,
  search,
}: PageHeaderProps) {
  const router = useRouter();
  const [globalQuery, setGlobalQuery] = useState('');

  return (
    <header
      className={`mb-5 flex flex-wrap items-end justify-between gap-4 sm:mb-6 ${STICKY_HEAD}`}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-[13px] font-semibold text-muted-foreground">{eyebrow}</div>
        )}
        {meta && <div className="mb-1 text-[13px] font-semibold text-muted-foreground">{meta}</div>}
        <h1 className="font-serif text-[28px] font-semibold leading-[1.05] tracking-[-0.4px] sm:text-[34px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 text-[14px] text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2.5 max-sm:w-full">
        {search ? (
          <label className={SEARCH_LABEL}>
            <Search aria-hidden className="h-4 w-4 flex-none text-muted-foreground" />
            <span className="sr-only">{search.placeholder ?? 'Caută'}</span>
            <input
              type="search"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? 'Caută…'}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
        ) : (
          <label className={`${SEARCH_LABEL} max-sm:hidden`}>
            <Search aria-hidden className="h-4 w-4 flex-none text-muted-foreground" />
            <span className="sr-only">Caută comandă</span>
            <input
              type="search"
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && globalQuery.trim()) {
                  router.push(`/orders?search=${encodeURIComponent(globalQuery.trim())}`);
                }
              }}
              placeholder="Caută comandă: nr., client, produs"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
        )}
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    </header>
  );
}
