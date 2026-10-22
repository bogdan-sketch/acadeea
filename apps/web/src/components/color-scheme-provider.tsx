'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTheme } from 'next-themes';

/**
 * Six designed color schemes (web only, 10.2026): three light, three dark.
 * The choice is per browser (localStorage) — it is the person's preference,
 * not the organization's branding. Each scheme is a full token set in
 * globals.css under `:root[data-scheme=…]`; this provider only sets the
 * attribute and keeps next-themes' `dark` class in sync with the mode.
 */
export type SchemeId = 'atelier' | 'lapte' | 'miere' | 'cacao' | 'ardezie' | 'piper';

export interface SchemeDef {
  id: SchemeId;
  label: string;
  hint: string;
  mode: 'light' | 'dark';
  /** Swatch colors for the picker (mirror globals.css). */
  swatch: { bg: string; card: string; ink: string; accent: string };
}

export const SCHEMES: SchemeDef[] = [
  {
    id: 'atelier',
    label: 'Atelier',
    hint: 'Hârtie caldă, zmeură',
    mode: 'light',
    swatch: { bg: '#f6f3ee', card: '#ffffff', ink: '#1c1719', accent: '#c2305b' },
  },
  {
    id: 'lapte',
    label: 'Lapte',
    hint: 'Alb rece, albastru',
    mode: 'light',
    swatch: { bg: '#f7f7f9', card: '#ffffff', ink: '#15171c', accent: '#2f5bd6' },
  },
  {
    id: 'miere',
    label: 'Miere',
    hint: 'Crem auriu, caramel',
    mode: 'light',
    swatch: { bg: '#fbf4e6', card: '#fffcf5', ink: '#241b10', accent: '#c26a12' },
  },
  {
    id: 'cacao',
    label: 'Cacao',
    hint: 'Brun închis, zmeură',
    mode: 'dark',
    swatch: { bg: '#1a1416', card: '#241c1f', ink: '#f3ecee', accent: '#e0547f' },
  },
  {
    id: 'ardezie',
    label: 'Ardezie',
    hint: 'Gri-albastru, azur',
    mode: 'dark',
    swatch: { bg: '#121619', card: '#1a2024', ink: '#e9eef2', accent: '#5b8def' },
  },
  {
    id: 'piper',
    label: 'Piper',
    hint: 'Negru, chihlimbar',
    mode: 'dark',
    swatch: { bg: '#0f0f10', card: '#19191b', ink: '#f2efea', accent: '#e0a531' },
  },
];

const STORAGE_KEY = 'horae-scheme';
const DEFAULT: SchemeId = 'atelier';

const isScheme = (v: unknown): v is SchemeId => SCHEMES.some((s) => s.id === v);

/** Inline <script> for <body>: applies the saved scheme before hydration (no flash). */
export const SCHEME_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');if(s&&/^(atelier|lapte|miere|cacao|ardezie|piper)$/.test(s)){document.documentElement.setAttribute('data-scheme',s);var d=/^(cacao|ardezie|piper)$/.test(s);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}}catch(e){}})();`;

interface Ctx {
  scheme: SchemeId;
  setScheme: (s: SchemeId) => void;
}

const SchemeContext = createContext<Ctx>({ scheme: DEFAULT, setScheme: () => {} });

export function ColorSchemeProvider({ children }: { children: ReactNode }) {
  const { setTheme } = useTheme();
  const [scheme, setSchemeState] = useState<SchemeId>(DEFAULT);

  const apply = useCallback(
    (s: SchemeId) => {
      setSchemeState(s);
      document.documentElement.setAttribute('data-scheme', s);
      setTheme(SCHEMES.find((x) => x.id === s)?.mode ?? 'light');
    },
    [setTheme],
  );

  useEffect(() => {
    let saved: SchemeId = DEFAULT;
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (isScheme(v)) saved = v;
    } catch {
      /* private mode / blocked storage — keep the default */
    }
    apply(saved);
  }, [apply]);

  const setScheme = useCallback(
    (s: SchemeId) => {
      try {
        localStorage.setItem(STORAGE_KEY, s);
      } catch {
        /* ignore */
      }
      apply(s);
    },
    [apply],
  );

  return <SchemeContext.Provider value={{ scheme, setScheme }}>{children}</SchemeContext.Provider>;
}

export const useColorScheme = () => useContext(SchemeContext);
