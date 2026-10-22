'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Sticky "Acțiuni rapide" bar: sits in the normal flow at the top of the
 * page; once the page scrolls it pins to the top and COMPACTS — the title
 * hides, paddings shrink, background gets a blur so content slides under.
 *
 * Pair with DataTable sticky headers by setting `--dt-sticky-top` (the
 * compact bar height) on a common ancestor — the table header then pins
 * right under this bar.
 */
export function StickyActions({
  title = 'Acțiuni rapide',
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="sticky top-0 z-30 mb-6">
      <div
        className={`rounded-[var(--radius)] border border-border transition-all duration-200 ${
          scrolled
            ? 'bg-card/90 p-2.5 shadow-(--shadow-card-md) backdrop-blur-md'
            : 'bg-card p-6 shadow-(--shadow-card-sm)'
        }`}
      >
        <div
          className={`overflow-hidden text-[15px] font-bold tracking-[-.1px] transition-all duration-200 ${
            scrolled ? 'mb-0 max-h-0 opacity-0' : 'mb-4 max-h-8 opacity-100'
          }`}
        >
          {title}
        </div>
        <div
          className={`flex flex-nowrap gap-2.5 overflow-x-auto [-webkit-overflow-scrolling:touch] ${
            scrolled ? '' : 'pb-1'
          } [&_a]:transition-all [&_button]:transition-all ${
            scrolled ? '[&_a]:py-2 [&_button]:py-2' : ''
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
