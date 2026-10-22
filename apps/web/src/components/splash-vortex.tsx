'use client';

import { useEffect, useRef } from 'react';

/**
 * Shared splash internals — the dot-VORTEX math + canvas render loop + the
 * logo fade/pulse CSS, factored out of `app-preloader.tsx` so the login page
 * can play the SAME intro (and then lift the logo + fade the login form in on
 * the same gradient) without re-implementing the 32-arm sin-hash geometry.
 *
 * The timeline is ALSO shared at module scope: both the dashboard preloader and
 * the login splash `beginTimeline()` the one clock, so a logged-out cold load
 * (dashboard loading splash → redirect → /login splash) continues one seamless
 * formation instead of restarting it. Client-side navigation never replays it
 * (module state = one JS session).
 */

export const FORMATION_MS = 2500;

// ---------------------------------------------------------------------------
// Shared, module-scoped timeline (one JS session). `firstMountAt` anchors the
// grace window; `timelineStart` anchors the formation and is set when the logo
// becomes visible (or the grace expires / the org has no logo).
// ---------------------------------------------------------------------------

let firstMountAt: number | null = null;
let timelineStart: number | null = null;

/**
 * Once per BROWSER session (M-10): the 2.5s formation plays on the first hard
 * load of a tab; every later full navigation/refresh in that tab gets a short
 * fade instead. sessionStorage survives reloads, dies with the tab.
 */
const SESSION_KEY = 'horae-splash-played';

export function hasPlayedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markPlayedThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // private mode / blocked storage — the splash simply replays next load
  }
}

/** Records + returns the first-ever mount time (grace anchor). */
export function markFirstMount(): number {
  if (firstMountAt === null) firstMountAt = Date.now();
  return firstMountAt;
}

/** Starts the shared formation clock once; returns it. */
export function beginTimeline(): number {
  if (timelineStart === null) {
    timelineStart = Date.now();
    markPlayedThisSession();
  }
  return timelineStart;
}

/** The shared formation clock, or null before it starts. */
export function getTimelineStart(): number | null {
  return timelineStart;
}

/**
 * Clears the shared clock so the NEXT mount replays the formation instead of
 * being suppressed as "already ran". Called on a fresh login (same-origin
 * `router.push('/')`) so the dashboard preloader plays on every entry, not just
 * on a cold page load. Hard navigations (apex→subdomain handoff) reload the
 * module and reset it for free.
 */
/** Mark the splash as fully played (e.g. right after a successful login) so
 * the dashboard preloader doesn't replay its tail — no flicker between the
 * login splash and the app shell. */
export function completeTimeline(): void {
  timelineStart = Number.MIN_SAFE_INTEGER / 2;
  markPlayedThisSession();
}

export function resetTimeline(): void {
  firstMountAt = null;
  timelineStart = null;
}

// ---------------------------------------------------------------------------
// Vortex geometry — EXACT parameters of the iOS SplashView: 32 spiral arms of
// small dots, empty circle in the middle for the logo, arms continuous on the
// inside, melting into the glow near the hole (inner fade) and thinning +
// fading toward the tips. Deterministic sin-hash pseudo-random (no
// Math.random), so every load draws the same texture.
// ---------------------------------------------------------------------------

interface Dot {
  radius: number;
  angle: number;
  size: number;
  alpha: number;
  /** 0..0.4 — per-dot start delay (fraction of the timeline). */
  delay: number;
}

const DOTS: Dot[] = (() => {
  const arms = 32;
  const innerRadius = 88;
  const outerRadius = 230;
  const step = 3.6; // dots this close read as a LINE along the arm
  const twist = 0.0135; // rad per px — arm curvature
  const result: Dot[] = [];
  for (let arm = 0; arm < arms; arm++) {
    const baseAngle = (arm / arms) * 2 * Math.PI;
    let j = 0;
    for (let r = innerRadius; r <= outerRadius; r += step, j++) {
      const fi = arm * 97 + j;
      const h1 = Math.abs(Math.sin(fi * 12.9898 + 78.233)); // stable pseudo-random
      const h2 = Math.abs(Math.sin(fi * 39.3468 + 11.135));
      const normalized = (r - innerRadius) / (outerRadius - innerRadius);
      // Arms stay CONTINUOUS on the inside; only the tips thin out.
      if (normalized > 0.7 && h1 > 1.55 - normalized) continue;
      // The interior melts into the glow: opacity ramps up from ~0 next to
      // the logo, peaks toward the middle, then falls off to the outside.
      const innerFade = Math.min(1, normalized / 0.3);
      const falloff = Math.max(0.08, 0.8 - normalized * 0.68) * innerFade;
      result.push({
        radius: r,
        angle: baseAngle + (r - innerRadius) * twist,
        size: 1.0 + h2 * 0.8,
        alpha: falloff * (0.7 + h1 * 0.3),
        delay: h2 * 0.4,
      });
    }
  }
  return result;
})();

/** Draw the vortex at the given progress (0 = scattered/transparent, 1 = final). */
function drawVortex(ctx: CanvasRenderingContext2D, w: number, h: number, progress: number) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  ctx.fillStyle = '#ffffff';
  for (const dot of DOTS) {
    // The DOT's own progress: starts after its delay, lasts the remainder.
    const span = Math.max(0.15, 1 - dot.delay);
    const local = Math.min(Math.max((progress - dot.delay) / span, 0), 1);
    if (local <= 0) continue;
    const eased = 1 - Math.pow(1 - local, 3); // cubic ease-out

    const radius = dot.radius + (1 - eased) * 110; // flies in from outside
    const angle = dot.angle - (1 - eased) * 0.55; // untwists into place
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    // Whole vortex dimmed to 60% (iOS: `dot.alpha * eased * 0.6`).
    ctx.globalAlpha = dot.alpha * eased * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, dot.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * DPR-aware canvas that paints the dot-vortex, driving its progress off the
 * SHARED `timelineStart` (0 until it starts). The loop stops itself at
 * progress 1; the final arrangement stays as the last painted frame.
 * `prefers-reduced-motion` renders the final state immediately.
 */
export function SplashCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    let raf = 0;
    const frame = () => {
      raf = 0;
      const ts = getTimelineStart();
      const progress = reduceMotion
        ? 1
        : ts === null
          ? 0
          : Math.min(Math.max((Date.now() - ts) / FORMATION_MS, 0), 1);
      drawVortex(ctx, window.innerWidth, window.innerHeight, progress);
      // Keep animating until the formation completes (also spins while the
      // timeline hasn't started yet, so it picks up the start seamlessly).
      if (progress < 1) raf = requestAnimationFrame(frame);
    };
    const onResize = () => {
      resize();
      if (!raf) frame(); // repaint one static (rescaled) frame if already done
    };
    window.addEventListener('resize', onResize);
    frame();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}

/**
 * Shared logo animation CSS: opacity-only fade-in (ease-in-out 0.7s, 0.15s
 * delay) then a CONTINUOUS pulse 1 ↔ 1.07 (1.1s per leg, alternating = 2.2s
 * round trip) — matches the iOS SplashView / Claude Design loading.
 * `prefers-reduced-motion` renders the final state (no pulse).
 */
export const SPLASH_LOGO_CSS = `
  @keyframes horae-splash-logo-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes horae-splash-logo-pulse {
    from { transform: scale(1); }
    to { transform: scale(1.07); }
  }
  .horae-splash-logo {
    animation:
      horae-splash-logo-in 0.7s ease-in-out 0.15s both,
      horae-splash-logo-pulse 1.1s ease-in-out infinite alternate;
  }
  @media (prefers-reduced-motion: reduce) {
    .horae-splash-logo { animation: none; }
  }
`;

/** Near-black base + accent gradient (dark by design, both themes). */
export function splashGradient(accent: string): string {
  return `linear-gradient(180deg, color-mix(in srgb, ${accent} 92%, transparent) 0%, color-mix(in srgb, ${accent} 70%, transparent) 50%, color-mix(in srgb, ${accent} 25%, transparent) 100%)`;
}

/** Soft white halo behind the logo (iOS RadialGradient, plus-lighter). */
export const SPLASH_HALO_STYLE = {
  background:
    'radial-gradient(circle 175px at center, rgba(255,255,255,0.16) 20px, rgba(255,255,255,0.05) 97.5px, transparent 175px)',
  mixBlendMode: 'plus-lighter' as const,
};
