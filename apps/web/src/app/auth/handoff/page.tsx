'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { auth } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { useOrgBranding } from '@/components/org-theme-provider';
import {
  SplashCanvas,
  SPLASH_LOGO_CSS,
  SPLASH_HALO_STYLE,
  splashGradient,
  beginTimeline,
} from '@/components/splash-vortex';

/**
 * Lands here from the apex login: /auth/handoff?code=<single-use code>.
 * Redeems the code for a token pair on THIS origin (the org's subdomain),
 * stores it, then enters the app. Codes are single-use with a 60s TTL —
 * any failure sends the user to the local, org-branded /login.
 */
function HandoffInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [error, setError] = useState(false);
  // React StrictMode double-fires effects in dev; the code is single-use.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const code = searchParams.get('code');
    const next = searchParams.get('next');
    const target = next && next.startsWith('/') ? next : '/';

    if (!code) {
      router.replace('/login');
      return;
    }

    (async () => {
      try {
        const res = await auth.redeemHandoff(code);
        localStorage.setItem('accessToken', res.accessToken);
        localStorage.setItem('refreshToken', res.refreshToken);
        await refresh();
        router.replace(target);
      } catch {
        setError(true);
        setTimeout(() => router.replace('/login'), 1500);
      }
    })();
  }, [router, searchParams, refresh]);

  // Same accent-gradient dot-vortex splash as the preloader/login — the
  // handoff begins the SHARED timeline, so landing on the dashboard continues
  // one seamless formation instead of flashing a spinner first.
  const branding = useOrgBranding();
  useEffect(() => {
    beginTimeline();
  }, []);
  const accent = 'var(--primary)';
  const splashLogo = branding?.logoDarkUrl || branding?.logoLightUrl || branding?.logoUrl || null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#0D0D0F', backgroundImage: splashGradient(accent) }}
    >
      <style>{SPLASH_LOGO_CSS}</style>
      <SplashCanvas className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div aria-hidden className="absolute h-[350px] w-[350px]" style={SPLASH_HALO_STYLE} />
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="horae-splash-logo relative flex items-center justify-center">
          {splashLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={splashLogo}
              alt={branding?.name || ''}
              className="max-h-[120px] max-w-[280px] object-contain"
            />
          ) : (
            <span className="text-5xl font-bold tracking-tight text-white">Horae</span>
          )}
        </div>
      </div>
      {error && (
        <p className="absolute inset-x-0 bottom-10 text-center text-sm text-white/80">
          Sesiunea nu a putut fi preluată — te redirecționăm la login…
        </p>
      )}
    </div>
  );
}

export default function HandoffPage() {
  return (
    <Suspense fallback={null}>
      <HandoffInner />
    </Suspense>
  );
}
