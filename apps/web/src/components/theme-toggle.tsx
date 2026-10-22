'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SCHEMES, useColorScheme, type SchemeId } from '@/components/color-scheme-provider';

/**
 * Light / dark / system — expressed THROUGH the colour schemes (M-15): there is
 * one theme model. "Luminos" keeps the current light scheme (or Atelier),
 * "Întunecat" keeps the current dark scheme (or Cacao), "Sistem" picks one of
 * those by `prefers-color-scheme`. Setări › Temă chooses the exact palette.
 */
const options = [
  { value: 'light', icon: Sun, label: 'Luminos' },
  { value: 'dark', icon: Moon, label: 'Întunecat' },
  { value: 'system', icon: Monitor, label: 'Sistem' },
] as const;

const DEFAULT_FOR: Record<'light' | 'dark', SchemeId> = { light: 'atelier', dark: 'cacao' };

export function ThemeToggle() {
  const { scheme, setScheme } = useColorScheme();
  const mode = SCHEMES.find((s) => s.id === scheme)?.mode ?? 'light';

  const pick = (value: (typeof options)[number]['value']) => {
    const target: 'light' | 'dark' =
      value === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : value;
    if (target === mode) return; // already in a scheme of that mode — keep it
    setScheme(DEFAULT_FOR[target]);
  };

  return (
    <div
      role="group"
      aria-label="Mod"
      className="flex gap-1 rounded-[var(--radius-ctl)] border p-1"
    >
      {options.map(({ value, icon: Icon, label }) => {
        const active = value !== 'system' && value === mode;
        return (
          <Button
            key={value}
            variant={active ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={value === 'system' ? undefined : active}
            onClick={() => pick(value)}
            className="gap-2"
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
