'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Întârziere în ms pentru intrări eșalonate (titlu → vizual). */
  delay?: number;
};

/**
 * Reveal la scroll, în stil Apple: conținutul urcă și se estompează în vedere
 * o singură dată, când intră în viewport. Starea „ascuns” există doar sub
 * motion-safe, deci cu prefers-reduced-motion totul e vizibil instantaneu.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.setAttribute('data-inview', '');
            io.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        'motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out',
        'motion-safe:not-data-inview:translate-y-8 motion-safe:not-data-inview:opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
