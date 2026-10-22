'use client';

import { useEffect, useState } from 'react';

import { readCachedBranding, useOrgBranding } from '@/components/org-theme-provider';
import {
  FORMATION_MS,
  SplashCanvas,
  SPLASH_LOGO_CSS,
  SPLASH_HALO_STYLE,
  splashGradient,
  beginTimeline,
  completeTimeline,
  getTimelineStart,
  hasPlayedThisSession,
  markFirstMount,
} from '@/components/splash-vortex';
import type { OrgBranding } from '@/lib/types';
import { BRAND_NAME } from '@/lib/brand';

/**
 * Splash preloader (design "Loading" screen) — the web mirror of the iOS
 * `SplashView` (apps/ios/Horae/SharedComponents/SplashView.swift): full-screen
 * accent gradient over near-black, a procedural dot-VORTEX (spiral arms drawn
 * on a <canvas>) around the org logo shown DIRECTLY on the gradient (no card;
 * NO text fallback — without a logo the center stays empty, vortex + glow
 * only), and the Horae wordmark + tagline at the bottom.
 *
 * The formation animation plays ONCE PER BROWSER SESSION (M-10), 2.5s: every
 * dot starts transparent outside the spiral and eases into place while fading
 * in. The logo fades in on opacity only then pulses continuously (see
 * `SPLASH_LOGO_CSS`). The 2.5s formation window is anchored to when the LOGO
 * becomes visible (or the grace expires / the org has no logo). Any later hard
 * load in the same tab (sessionStorage flag) shows the formed vortex for one
 * short fade (≤300ms, pointer-events off) and never blocks the cached shell.
 * The vortex geometry, canvas loop and the shared timeline all live in
 * `splash-vortex.tsx` so the login page can continue the very same intro.
 */

const SHOW_MS = FORMATION_MS + 400; // formation + hold
const FADE_MS = 500;
/** Warm start (splash already played this session): fade only. */
const QUICK_FADE_MS = 250;
/** Max wait for the logo image before the timeline starts anyway. */
const LOGO_GRACE_MS = 1000;

export function AppPreloader() {
  const liveBranding = useOrgBranding();
  // Decided SYNCHRONOUSLY at first render so the cover paints on the very
  // first frame — starting at 'done' let the dashboard flash for a beat
  // before the mount effect flipped it. Server + hydration pass agree: a
  // fresh page load always starts with a null timeline → 'visible' on both
  // sides; after a client-side login (no hydration involved) the timeline is
  // already completed → 'done' and nothing renders. Branding still loads in
  // the mount effect (localStorage isn't SSR-safe) — until then the cover
  // falls back to the themed --primary gradient below.
  const [phase, setPhase] = useState<'visible' | 'fading' | 'done'>(() => {
    if (typeof window === 'undefined') return 'visible';
    const ts = getTimelineStart();
    if (ts !== null && Date.now() - ts >= SHOW_MS + FADE_MS) return 'done';
    return ts !== null && Date.now() - ts >= SHOW_MS ? 'fading' : 'visible';
  });
  // Mirrors the shared `timelineStart` so the fade/done timers (re)arm on start.
  const [started, setStarted] = useState(false);
  // Branding may not have loaded into context yet on a cold mount — fall
  // back to the per-slug localStorage cache so the splash is org-tinted.
  const [cached, setCached] = useState<OrgBranding | null>(null);
  const [logoBroken, setLogoBroken] = useState(false);
  // Warm start: shorter fade, no formation.
  const [quick, setQuick] = useState(false);

  const start = () => {
    beginTimeline();
    setStarted(true);
  };

  // Mount: show-once guard + grace timer (anchored to the FIRST mount, so the
  // skeleton→shell remount doesn't extend the wait).
  useEffect(() => {
    const now = Date.now();
    const first = markFirstMount();
    const ts = getTimelineStart();
    if (ts !== null && now - ts >= SHOW_MS + FADE_MS) return; // already ran
    setCached(readCachedBranding());
    if (ts === null && hasPlayedThisSession()) {
      // Warm start in this tab: mark the clock complete (canvas paints the
      // formed vortex), fade out quickly, never hold the shell.
      completeTimeline();
      setQuick(true);
      setStarted(true);
      setPhase('fading');
      const t = setTimeout(() => setPhase('done'), QUICK_FADE_MS);
      return () => clearTimeout(t);
    }
    if (ts !== null) setStarted(true);
    setPhase(ts !== null && now - ts >= SHOW_MS ? 'fading' : 'visible');
    const grace = setTimeout(start, Math.max(0, LOGO_GRACE_MS - (now - first)));
    return () => clearTimeout(grace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Orgs without a logo start immediately — no point waiting out the grace.
  const branding = liveBranding ?? cached;
  const logo = !logoBroken ? branding?.logoDarkUrl || branding?.logoLightUrl || null : null;
  useEffect(() => {
    if (phase === 'visible' && !started && branding && !logo) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, started, branding, logo]);

  // Fade/done timers — anchored to the shared timeline start (logo visible),
  // like the iOS SplashView anchors its window to view-appear.
  useEffect(() => {
    if (!started || phase === 'done') return;
    const ts = getTimelineStart();
    if (ts === null) return;
    const elapsed = Date.now() - ts;
    if (elapsed >= SHOW_MS + FADE_MS) {
      setPhase('done');
      return;
    }
    const fade = setTimeout(() => setPhase('fading'), Math.max(0, SHOW_MS - elapsed));
    const done = setTimeout(() => setPhase('done'), SHOW_MS + FADE_MS - elapsed);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  if (phase === 'done') return null;

  // Prefer the org accent; before branding resolves, fall back to the themed
  // --primary token (set by OrgThemeProvider / globals.css) rather than a
  // hardcoded default pink — color-mix() accepts the CSS var directly.
  const accent = 'var(--primary)';

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex items-center justify-center transition-opacity ease-out"
      style={{
        backgroundColor: '#0D0D0F',
        backgroundImage: splashGradient(accent),
        opacity: phase === 'fading' ? 0 : 1,
        transitionDuration: `${quick ? QUICK_FADE_MS : FADE_MS}ms`,
        pointerEvents: phase === 'fading' ? 'none' : 'auto',
      }}
    >
      <style>{SPLASH_LOGO_CSS}</style>

      {/* Dot vortex — spiral arms forming once, then static. */}
      <SplashCanvas className="absolute inset-0" />

      {/* Soft halo behind the logo — softens the vortex hole → logo edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute h-[350px] w-[350px]"
        style={SPLASH_HALO_STYLE}
      />

      {/* Org logo, DIRECTLY on the gradient (dark → light). NO text fallback —
          without a displayable logo the center stays empty. Its load anchors
          the timeline (ref covers the already-cached/complete case). */}
      {logo && (
        <div className="horae-splash-logo relative flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo}
            alt=""
            className="max-h-[120px] max-w-[280px] object-contain"
            onLoad={start}
            onError={() => {
              setLogoBroken(true);
              start();
            }}
            ref={(img) => {
              if (img && img.complete && img.naturalWidth > 0) start();
            }}
          />
        </div>
      )}

      {/* Wordmark + tagline */}
      <div className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-1 text-center">
        <div className="text-[22px] font-bold text-white">{BRAND_NAME}</div>
        <div className="text-[15px] font-light text-white/60">
          Toată producția ta într-un loc organizat
        </div>
      </div>
    </div>
  );
}
