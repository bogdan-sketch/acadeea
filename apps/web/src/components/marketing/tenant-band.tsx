'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Reveal } from './reveal';

/**
 * Banda multi-tenant: un cadru de browser care ciclează subdomeniile
 * white-label (org.horae.ca), schimbând în același timp culoarea de accent a
 * mini-dashboard-ului. Banda e intenționat întunecată în ambele teme — un
 * moment de contrast, în stil Apple. Ciclarea rulează doar cât secțiunea e
 * vizibilă, se oprește sub prefers-reduced-motion și poate fi controlată
 * manual din cipurile de subdomenii.
 */

// Exemple fictive — niciun tenant real pe pagina publică.
const TENANTS = [
  { sub: 'dulce-arta', name: 'Dulce Artă', accent: '#d4527b' },
  { sub: 'cofetaria-ta', name: 'Cofetăria Ta', accent: '#7c5cd6' },
  { sub: 'atelier-dulce', name: 'Atelier Dulce', accent: '#2f9e8f' },
];

const NAV_WIDTHS = ['72%', '58%', '66%', '48%', '62%'];

export function TenantBand() {
  const [idx, setIdx] = useState(0);
  const [manual, setManual] = useState(false);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(true);
  const bandRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const el = bandRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (manual || reduced || !inView) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % TENANTS.length), 3200);
    return () => clearInterval(timer);
  }, [manual, reduced, inView]);

  const tenant = TENANTS[idx];

  return (
    <section
      id="organizatia-ta"
      aria-labelledby="organizatia-ta-titlu"
      className="scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28"
    >
      <div
        ref={bandRef}
        className="mx-auto max-w-6xl rounded-[2.5rem] bg-[#131316] px-4 py-16 text-center sm:px-8 lg:py-24"
      >
        <Reveal className="mx-auto max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#e58aa8]">
            Organizația ta
          </p>
          <h2
            id="organizatia-ta-titlu"
            className="mt-4 text-balance text-4xl leading-[1.05] font-medium tracking-tight text-white [font-family:var(--font-display),serif] sm:text-5xl lg:text-6xl"
          >
            Platforma ta, <em className="text-[#e58aa8]">cu numele tău pe ușă.</em>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-white/60 sm:text-lg">
            Fiecare organizație primește propriul subdomeniu, propria temă de culoare și propriul
            font — aceeași platformă, alt brand. Echipa ta intră pe adresa ei, nu pe a noastră.
          </p>
        </Reveal>

        <Reveal delay={150} className="mx-auto mt-12 max-w-3xl">
          <div
            aria-hidden
            className="overflow-hidden rounded-2xl border border-white/10 bg-[#1b1b1f] text-left shadow-2xl"
            style={{ '--ta': tenant.accent } as CSSProperties}
          >
            {/* bara browserului */}
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
              <div className="flex shrink-0 gap-1.5">
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
              </div>
              <div className="mx-auto flex min-w-0 items-center gap-1.5 rounded-full bg-white/5 px-4 py-1.5 font-mono text-xs text-white/40">
                <Lock className="size-3 shrink-0" />
                <span key={tenant.sub} className="truncate animate-in fade-in duration-500">
                  <span className="text-white">{tenant.sub}</span>.horae.ca
                </span>
              </div>
              <div className="w-10 shrink-0" />
            </div>

            {/* mini-aplicația, cu accentul organizației */}
            <div className="flex">
              <div className="hidden w-40 shrink-0 flex-col gap-4 border-r border-white/10 p-4 sm:flex">
                <div className="flex items-center gap-2">
                  <span className="size-5 shrink-0 rounded-md bg-(--ta) transition-colors duration-700" />
                  <span
                    key={tenant.name}
                    className="truncate text-xs font-semibold text-white animate-in fade-in duration-500"
                  >
                    {tenant.name}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {NAV_WIDTHS.map((width, i) => (
                    <div
                      key={width}
                      className={cn(
                        'h-2 rounded-full transition-colors duration-700',
                        i === 0 ? 'bg-(--ta)' : 'bg-white/10',
                      )}
                      style={{ width }}
                    />
                  ))}
                </div>
              </div>

              <div className="min-w-0 flex-1 p-4 sm:p-5">
                <p className="text-[11px] text-white/40">Bună dimineața · producția de azi</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { value: '24', label: 'sarcini' },
                    { value: '3', label: 'transferuri' },
                    { value: '98%', label: 'la timp' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg bg-white/5 px-2.5 py-2">
                      <p className="font-mono text-sm font-semibold text-(--ta) transition-colors duration-700 sm:text-base">
                        {stat.value}
                      </p>
                      <p className="truncate text-[10px] text-white/40">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex h-14 items-end gap-1.5">
                  {[35, 55, 45, 90, 70, 80, 30].map((h, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex-1 rounded-t bg-(--ta) transition-colors duration-700',
                        h !== 90 && 'opacity-30',
                      )}
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {TENANTS.map((t, i) => (
            <button
              key={t.sub}
              type="button"
              aria-pressed={i === idx}
              onClick={() => {
                setIdx(i);
                setManual(true);
              }}
              className={cn(
                'rounded-full border px-4 py-1.5 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60',
                i === idx
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-white/10 text-white/50 hover:text-white',
              )}
            >
              {t.sub}.horae.ca
            </button>
          ))}
        </div>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.25em] text-white/30">
          Subdomeniul tău · culorile tale · fontul tău
        </p>
      </div>
    </section>
  );
}
