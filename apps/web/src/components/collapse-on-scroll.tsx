'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * iOS-style collapsing section for MOBILE only: the wrapped block (stat
 * cards, quick summaries) slides away once the page scrolls down and comes
 * back near the top. On >= sm screens it renders inert (always visible).
 */
export function CollapseOnScroll({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 639px)');
    const onScroll = () => {
      if (!mql.matches) {
        setHidden(false);
        return;
      }
      setHidden(window.scrollY > 56);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={`transition-all duration-300 max-sm:overflow-hidden ${
        hidden
          ? 'max-sm:pointer-events-none max-sm:max-h-0 max-sm:opacity-0'
          : 'max-sm:max-h-[1200px] max-sm:opacity-100'
      }`}
    >
      {children}
    </div>
  );
}
