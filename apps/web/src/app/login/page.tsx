'use client';

import { useCallback, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { organization as orgApi } from '@/lib/api';
import { BRAND_NAME } from '@/lib/brand';
import { getOrgSlug, isApexHost, orgUrl } from '@/lib/tenant';
import { providerAuthErrorMessage } from '@/lib/auth-errors';
import { SocialAuthButtons, type AppleCredential } from '@/components/auth/social-auth-buttons';
import type { AuthProvider, LoginResponse, OrgBranding, ProviderAuthRequest } from '@/lib/types';
import {
  SplashCanvas,
  SPLASH_LOGO_CSS,
  SPLASH_HALO_STYLE,
  splashGradient,
  beginTimeline,
  resetTimeline,
  getTimelineStart,
  hasPlayedThisSession,
  markFirstMount,
  completeTimeline,
} from '@/components/splash-vortex';
import { cn } from '@/lib/utils';
import { Loader2, Eye, EyeOff } from 'lucide-react';

/**
 * Login = the splash screen with a twist (Claude Design prototype + iOS
 * `SplashView` with `showLogin`): the SAME accent-gradient / dot-vortex intro
 * plays, then at ~2.6s the org logo LIFTS UP (`riseup`, translateY(-235px)) and
 * the login form fades in on the same gradient (`formin`). The form becomes
 * part of the splash — no separate card. `prefers-reduced-motion` renders the
 * final state immediately (logo up, form visible, no pulse). All the login
 * logic (org branding lookup, apex→subdomain handoff, forgot-password, errors)
 * is unchanged; only the presentation moved onto the dark gradient.
 */

/** When the logo lifts and the form fades in — anchored to the shared clock. */
const REVEAL_MS = 2600;
/** Max wait for the logo image before the timeline starts anyway. */
const LOGO_GRACE_MS = 1000;

const SPLASH_REVEAL_CSS = `
  @keyframes horae-splash-riseup {
    to { transform: translateY(-235px); }
  }
  @keyframes horae-splash-formin {
    to { opacity: 1; }
  }
  .horae-splash-lift { animation: horae-splash-riseup 1s ease-in-out forwards; }
  .horae-splash-form { opacity: 0; }
  .horae-splash-form-in { animation: horae-splash-formin 1s ease-in-out forwards; }
  @media (prefers-reduced-motion: reduce) {
    .horae-splash-lift { animation: none; transform: translateY(-235px); }
    .horae-splash-form-in { animation: none; opacity: 1; }
  }
`;

export default function LoginPage() {
  const router = useRouter();
  const { login, loginForHandoff, providerLogin, user, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [org, setOrg] = useState<OrgBranding | null>(null);
  // null until mounted — host is only known on the client.
  const [apex, setApex] = useState<boolean | null>(null);

  // Splash reveal state. `started` mirrors the shared timeline; `showLogin`
  // lifts the logo + fades the form in.
  const [started, setStarted] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);

  // Deja autentificat pe subdomeniul organizației → direct la panou, nu din
  // nou formularul. Pe apex (horae.ca) `/` e pagina de prezentare, deci rămânem.
  useEffect(() => {
    if (!isLoading && user && apex === false) router.replace('/');
  }, [isLoading, user, apex, router]);

  useEffect(() => {
    const onApex = isApexHost();
    setApex(onApex);
    // Org subdomain → public branding lookup (works logged-out). Apex stays
    // on the neutral Horae brand.
    if (!onApex) {
      const slug = getOrgSlug();
      if (slug) {
        orgApi
          .getBySlug(slug)
          .then(setOrg)
          .catch(() => {});
      }
    }
  }, []);

  const startTimeline = () => {
    beginTimeline();
    setStarted(true);
  };

  // Mount: begin (or continue) the shared splash clock. reduced-motion / a
  // formation that already played in this browser tab (M-10, sessionStorage)
  // → jump straight to the revealed state with the vortex formed; otherwise
  // arm a grace timer so formation starts even without a logo.
  useEffect(() => {
    const now = Date.now();
    const first = markFirstMount();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || (getTimelineStart() === null && hasPlayedThisSession())) {
      completeTimeline();
      setStarted(true);
      setShowLogin(true);
      return;
    }
    const ts = getTimelineStart();
    if (ts !== null) {
      setStarted(true);
      if (now - ts >= REVEAL_MS) setShowLogin(true);
    }
    const grace = setTimeout(startTimeline, Math.max(0, LOGO_GRACE_MS - (now - first)));
    return () => clearTimeout(grace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Splash logo (dark variant first — the gradient is dark). Apex has no org
  // logo → the center stays empty (no text fallback), like the preloader.
  const splashLogo = !logoBroken
    ? org?.logoDarkUrl || org?.logoLightUrl || org?.logoUrl || null
    : null;

  // No logo to wait for (apex, or an org whose branding resolved without a
  // logo) → start the formation immediately.
  useEffect(() => {
    if (started) return;
    if (apex === true || (org && !splashLogo)) startTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apex, org, splashLogo, started]);

  // Reveal timer — arm once the timeline starts, anchored to it (so a splash
  // that already formed this session reveals near-instantly).
  useEffect(() => {
    if (!started || showLogin) return;
    const ts = getTimelineStart();
    if (ts === null) return;
    const elapsed = Date.now() - ts;
    if (elapsed >= REVEAL_MS) {
      setShowLogin(true);
      return;
    }
    const t = setTimeout(() => setShowLogin(true), REVEAL_MS - elapsed);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (apex) {
        // Apex login: never keep a session here — hand it to the org's
        // subdomain via the single-use code.
        const res = await loginForHandoff(email, password);
        if (res.handoffCode && res.organization?.slug) {
          window.location.href = orgUrl(
            res.organization.slug,
            `/auth/handoff?code=${encodeURIComponent(res.handoffCode)}`,
          );
          return; // keep the spinner while the browser navigates
        }
        setError('Nu am putut prelua organizația contului. Încearcă din nou.');
        setLoading(false);
        return;
      }

      const res = await login(email, password);
      const currentSlug = getOrgSlug();
      if (res.organization?.slug && currentSlug && res.organization.slug !== currentSlug) {
        // Logged in on another org's subdomain — send the session to the
        // right one (tokens here are cleared; the code carries the session).
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        if (res.handoffCode) {
          window.location.href = orgUrl(
            res.organization.slug,
            `/auth/handoff?code=${encodeURIComponent(res.handoffCode)}`,
          );
          return;
        }
        // No handoff code (shouldn't happen) — don't enter the wrong org's
        // shell half-authenticated; stay here with an error.
        setError('Contul tău aparține altei organizații. Autentifică-te pe horae.ca.');
        setLoading(false);
        return;
      }
      // Replay the splash on the dashboard we're about to enter (soft nav keeps
      // the module alive, so clear the shared clock first).
      resetTimeline();
      // Splash already played on this page — don't let the dashboard
      // preloader replay its tail (flicker) after a fast login.
      completeTimeline();
      router.push('/');
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || '';
      if (msg.includes('locked') || msg.includes('blocat')) {
        setError(
          'Contul a fost blocat după prea multe încercări eșuate. Resetează-ți parola pentru a-l recupera.',
        );
      } else {
        setError('Email sau parolă incorectă');
      }
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  // Provider (Apple/Google) sign-in — mirrors the password flow: apex hands the
  // session to the org subdomain via the handoffCode; on a subdomain we persist
  // and either bounce a cross-org login to the right host or land on the app.
  const runProviderLogin = useCallback(
    async (provider: AuthProvider, body: ProviderAuthRequest) => {
      setError('');
      setLoading(true);
      try {
        if (apex) {
          const res: LoginResponse = await providerLogin(provider, body, true);
          if (res.handoffCode && res.organization?.slug) {
            window.location.href = orgUrl(
              res.organization.slug,
              `/auth/handoff?code=${encodeURIComponent(res.handoffCode)}`,
            );
            return; // keep the spinner while the browser navigates
          }
          setError('Nu am putut prelua organizația contului. Încearcă din nou.');
          setLoading(false);
          return;
        }

        const res: LoginResponse = await providerLogin(provider, body, false);
        const currentSlug = getOrgSlug();
        if (res.organization?.slug && currentSlug && res.organization.slug !== currentSlug) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          if (res.handoffCode) {
            window.location.href = orgUrl(
              res.organization.slug,
              `/auth/handoff?code=${encodeURIComponent(res.handoffCode)}`,
            );
            return;
          }
          setError('Contul tău aparține altei organizații. Autentifică-te pe horae.ca.');
          setLoading(false);
          return;
        }
        completeTimeline();
        router.push('/');
      } catch (err: unknown) {
        setError(providerAuthErrorMessage(err));
        setLoading(false);
      }
    },
    [apex, providerLogin, router],
  );

  const handleGoogle = useCallback(
    (credential: string) => runProviderLogin('google', { identityToken: credential }),
    [runProviderLogin],
  );

  const handleApple = useCallback(
    (cred: AppleCredential) =>
      runProviderLogin('apple', {
        identityToken: cred.identityToken,
        nonce: cred.nonce,
        firstName: cred.firstName,
        lastName: cred.lastName,
      }),
    [runProviderLogin],
  );

  // The colour scheme owns the accent (no per-tenant colours since 17.10.2026).
  const accent = 'var(--primary)';
  const accentForeground = 'var(--primary-foreground)';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#0D0D0F', backgroundImage: splashGradient(accent) }}
    >
      {/* Single text child — two expression children hydrate as two text nodes
          and mismatch the server-rendered concatenated form. */}
      <style>{SPLASH_LOGO_CSS + SPLASH_REVEAL_CSS}</style>

      {/* Dot vortex — the same intro as the dashboard preloader. */}
      <SplashCanvas className="absolute inset-0" />

      {/* Glow/halo — stays fixed on the vortex center; it does NOT rise with the
          logo when the login form reveals (only the logo lifts). */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div aria-hidden className="absolute h-[350px] w-[350px]" style={SPLASH_HALO_STYLE} />
      </div>

      {/* Logo — lifts up on reveal to make room for the form. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          className={cn(
            'relative flex items-center justify-center',
            showLogin && 'horae-splash-lift',
          )}
        >
          {splashLogo ? (
            <div className="horae-splash-logo relative flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={splashLogo}
                alt={org?.name || ''}
                className="max-h-[120px] max-w-[280px] object-contain"
                onLoad={startTimeline}
                onError={() => {
                  setLogoBroken(true);
                  startTimeline();
                }}
                ref={(img) => {
                  if (img && img.complete && img.naturalWidth > 0) startTimeline();
                }}
              />
            </div>
          ) : (
            // No org logo (apex / never logged in) → simple brand wordmark
            // so the center isn't empty.
            <div className="horae-splash-logo relative flex items-center justify-center">
              <span className="text-5xl font-bold tracking-tight text-white">{BRAND_NAME}</span>
            </div>
          )}
        </div>
      </div>

      {/* Login form — fades in below the lifted logo, on the same gradient.
          Vertically CENTERED at +60px like iOS (ZStack center + padding.top 120
          → center shifts by 60), not top-anchored at the middle — otherwise the
          form (grown by the social buttons) hangs too low. */}
      <div
        className={cn(
          'absolute inset-x-0 top-1/2 flex justify-center px-6 horae-splash-form',
          showLogin && 'horae-splash-form-in',
        )}
        style={{
          transform: 'translateY(calc(-50% + 60px))',
          pointerEvents: showLogin ? 'auto' : 'none',
        }}
      >
        <form onSubmit={handleSubmit} className="flex w-full max-w-[360px] flex-col gap-3.5">
          {error && <p className="text-center text-[13px] text-white">{error}</p>}

          <div
            className="flex items-center rounded-xl px-4 py-3.5 focus-within:ring-3 focus-within:ring-white/80"
            style={{ backgroundColor: '#1C1C1E' }}
          >
            <input
              id="email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/60"
            />
          </div>

          <div
            className="flex items-center gap-2.5 rounded-xl px-4 py-3.5 focus-within:ring-3 focus-within:ring-white/80"
            style={{ backgroundColor: '#1C1C1E' }}
          >
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Parola"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="-my-1.5 -mr-1.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg text-white/70 transition-colors hover:text-white"
              aria-label={showPassword ? 'Ascunde parola' : 'Arată parola'}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-[18px] w-[18px]" />
              ) : (
                <Eye className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>

          <Link
            href="/forgot-password"
            className="inline-flex min-h-[32px] items-center self-end rounded-lg bg-black/20 px-2.5 text-[13px] font-semibold text-white hover:bg-black/30 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/80"
          >
            Ai uitat parola?
          </Link>

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-[46px] items-center justify-center rounded-xl py-[13px] text-[14.5px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D0F] disabled:opacity-60"
            style={{ backgroundColor: accent, color: accentForeground }}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Autentificare
          </button>

          <SocialAuthButtons
            variant="dark"
            separator
            disabled={loading}
            onGoogle={handleGoogle}
            onApple={handleApple}
            onError={setError}
          />
        </form>
      </div>

      {/* Wordmark + tagline — fades out as the form takes over (like iOS). */}
      <div
        className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-1 text-center transition-opacity duration-700"
        style={{ opacity: showLogin ? 0 : 1 }}
      >
        <div className="text-[22px] font-bold text-white">{BRAND_NAME}</div>
        <div className="text-[15px] font-light text-white/60">
          Toată producția ta într-un loc organizat
        </div>
      </div>
    </div>
  );
}
