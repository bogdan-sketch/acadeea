'use client';

import { SCHEMES, useColorScheme } from '@/components/color-scheme-provider';
import { cn } from '@/lib/utils';

/**
 * Profil › Preferințe › Temă: six swatch tiles (3 light, 3 dark), single
 * choice, no select — one click applies the scheme on this browser. Each tile
 * is painted in its own scheme (background, card, accent) so the choice reads
 * before it is applied.
 */
export function SchemePicker({ className }: { className?: string }) {
  const { scheme, setScheme } = useColorScheme();
  return (
    <div
      role="group"
      aria-label="Schema de culori"
      className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-3', className)}
    >
      {SCHEMES.map((s) => {
        const on = s.id === scheme;
        const kind = s.mode === 'light' ? 'Luminos' : 'Întunecat';
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            title={`Temă ${s.label} (${kind.toLowerCase()}) — ${s.hint}`}
            onClick={() => setScheme(s.id)}
            style={{ background: s.swatch.bg, color: s.swatch.ink }}
            className={cn(
              'flex min-w-0 cursor-pointer flex-col items-start gap-1.5 rounded-[14px] border-2 p-3 text-left transition-shadow focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
              on
                ? 'border-primary shadow-[0_0_0_3px_var(--accent)]'
                : s.mode === 'light'
                  ? 'border-black/10 hover:shadow-[0_0_0_3px_var(--muted)]'
                  : 'border-white/15 hover:shadow-[0_0_0_3px_var(--muted)]',
            )}
          >
            <span aria-hidden className="flex w-full items-center gap-1.5">
              <span
                className="h-[22px] flex-1 rounded-[7px]"
                style={{ background: s.swatch.accent }}
              />
              <span
                className="h-[22px] w-[22px] flex-none rounded-[7px] border"
                style={{
                  background: s.swatch.card,
                  borderColor: s.mode === 'light' ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.15)',
                }}
              />
            </span>
            <span className="text-[14px] font-bold leading-tight">{s.label}</span>
            <span className="text-[12px] leading-tight opacity-70">{kind}</span>
          </button>
        );
      })}
    </div>
  );
}
