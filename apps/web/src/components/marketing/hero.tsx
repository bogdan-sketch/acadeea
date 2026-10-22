'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, ChevronDown } from 'lucide-react';

/**
 * Hero „chaos → ordine”: secțiunea are ~1,9 ecrane înălțime, iar interiorul
 * rămâne lipit (sticky) cât timp particulele se organizează în cadran.
 * Canvas-ul three.js e importat dinamic fără SSR, deci /landing rămâne
 * prerandabil static; până la încărcare se vede posterul (glow radial).
 */
const HeroCanvas = dynamic(() => import('./hero-canvas'), { ssr: false });

export function Hero() {
  const progressRef = useRef(0);
  const introRef = useRef<HTMLDivElement>(null);
  const outroRef = useRef<HTMLDivElement>(null);
  // null = încă nu știm (SSR / prima randare); nu montăm canvas-ul până aflăm.
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (reducedMotion !== false) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.85)));
        progressRef.current = p;
        if (introRef.current) {
          introRef.current.style.opacity = String(Math.max(0, 1 - p * 1.8));
          introRef.current.style.transform = `translateY(${p * -36}px)`;
          introRef.current.style.pointerEvents = p > 0.45 ? 'none' : '';
        }
        if (outroRef.current) {
          outroRef.current.style.opacity = String(Math.min(1, Math.max(0, (p - 0.55) * 2.8)));
        }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [reducedMotion]);

  return (
    <section
      aria-labelledby="hero-titlu"
      className={reducedMotion ? 'relative' : 'relative h-[188vh]'}
    >
      <div className="sticky top-0 h-svh overflow-hidden">
        {/* Poster static — vizibil până se încarcă scena și sub reduced-motion. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_44%,color-mix(in_oklab,var(--primary)_9%,transparent),transparent_72%)]"
        />
        {reducedMotion !== null && (
          <HeroCanvas progressRef={progressRef} reducedMotion={reducedMotion} />
        )}

        <div
          ref={introRef}
          className="relative z-10 mx-auto flex h-full max-w-4xl flex-col items-center justify-center px-4 text-center sm:px-6"
        >
          {/* Ceață radială pentru lizibilitate peste particule. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-1/2 -z-10 h-[26rem] -translate-y-1/2 bg-[radial-gradient(closest-side,var(--background)_25%,transparent)] opacity-90"
          />
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.3em] text-primary">
            Horae — ordinea lucrurilor bine făcute
          </p>
          <h1
            id="hero-titlu"
            className="text-balance text-5xl leading-[1.04] font-medium tracking-tight text-foreground [font-family:var(--font-display),serif] sm:text-6xl lg:text-7xl"
          >
            Fiecare rețetă la locul ei.
            <br />
            Fiecare tavă <em className="text-primary">la timpul ei.</em>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Platforma care leagă rețetele, producția, stocurile și livrările cofetăriei tale într-un
            singur flux — cu fiecare lot pe urmele lui, în fiecare locație.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Intră în cont
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a
              href="#functionalitati"
              className="inline-flex items-center rounded-full border border-border bg-card/80 px-7 py-3.5 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Descoperă platforma
            </a>
          </div>

          <div className="absolute inset-x-0 bottom-7 flex flex-col items-center gap-1 text-muted-foreground">
            <span className="font-mono text-[11px] uppercase tracking-[0.25em]">Derulează</span>
            <ChevronDown className="size-4 motion-safe:animate-bounce" aria-hidden />
          </div>
        </div>

        {/* Replica de final — apare când particulele s-au așezat în cadran. */}
        <div
          ref={outroRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 opacity-0"
        >
          <p className="max-w-3xl text-balance text-center text-3xl leading-snug font-medium tracking-tight text-foreground [font-family:var(--font-display),serif] sm:text-4xl lg:text-5xl">
            Din agitația dimineții, <em className="text-primary">o zi în bună rânduială.</em>
          </p>
        </div>
      </div>
    </section>
  );
}
