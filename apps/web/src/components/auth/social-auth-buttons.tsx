'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuthProvider } from '@/lib/types';

// Env-gated: a button renders ONLY when its client id / services id is configured.
// Reading process.env.NEXT_PUBLIC_* in a client component inlines the value at build.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const APPLE_SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID;

const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';
const APPLE_JS_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

/** Apple returns the name only on FIRST consent — pass it through to name a new account. */
export interface AppleCredential {
  identityToken: string;
  nonce: string;
  firstName?: string;
  lastName?: string;
}

interface SocialAuthButtonsProps {
  /** Called with the Google id_token (JWT `credential`). */
  onGoogle: (credential: string) => Promise<void> | void;
  /** Called with the Apple id_token + nonce (+ name on first consent). */
  onApple: (cred: AppleCredential) => Promise<void> | void;
  /** Surface a Romanian error string to the host page. */
  onError: (message: string) => void;
  /** Host-level busy flag (e.g. a form submitting) — disables the buttons. */
  disabled?: boolean;
  /** `dark` = login splash pills; `default` = bordered buttons on a card. */
  variant?: 'dark' | 'default';
  /** Which providers to offer (still gated by env). Defaults to both. */
  providers?: AuthProvider[];
  /** Show a "sau continuă cu" separator above the buttons. */
  separator?: boolean;
  /** Override the button labels (settings uses "Conectează cu …"). */
  labels?: { apple?: string; google?: string };
}

/**
 * Google Identity Services must be initialised ONCE per page load (QA m18):
 * calling `initialize()` again logs "initialize() is called multiple times"
 * and can drop the first callback. The effect below re-runs whenever the host
 * passes a new `onGoogle`/`onError`, so the callback is routed through a ref
 * and only `renderButton` repeats.
 */
let googleInitialised = false;

function hexNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function SocialAuthButtons({
  onGoogle,
  onApple,
  onError,
  disabled = false,
  variant = 'default',
  providers = ['apple', 'google'],
  separator = false,
  labels,
}: SocialAuthButtonsProps) {
  const showGoogle = !!GOOGLE_CLIENT_ID && providers.includes('google');
  const showApple = !!APPLE_SERVICES_ID && providers.includes('apple');
  const dark = variant === 'dark';

  const [googleReady, setGoogleReady] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [nonce, setNonce] = useState('');
  // Which provider is mid-flight (null when idle).
  const [busy, setBusy] = useState<AuthProvider | null>(null);
  // Google's own button renders into this element (reliable, unlike One Tap).
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  // Latest host callbacks for the one-time GIS callback (see googleInitialised).
  const googleHandlers = useRef({ onGoogle, onError });
  useEffect(() => {
    googleHandlers.current = { onGoogle, onError };
  }, [onGoogle, onError]);

  // Nonce is generated client-side (never during render) and reused for Apple init.
  useEffect(() => {
    setNonce(hexNonce());
  }, []);

  // Initialize Google Identity Services + render Google's OFFICIAL button. We use
  // renderButton (not One Tap `prompt()`) because One Tap silently fails to
  // display on many setups (FedCM off, third-party-cookie blocking, cooldown),
  // which read as "Google login doesn't work". renderButton always yields an
  // id_token on click.
  useEffect(() => {
    const el = googleBtnRef.current;
    if (!googleReady || !showGoogle || !GOOGLE_CLIENT_ID || !el) return;
    if (!googleInitialised) {
      googleInitialised = true;
      window.google?.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          const { onGoogle: handle, onError: fail } = googleHandlers.current;
          setBusy('google');
          Promise.resolve(handle(response.credential))
            .catch(() => fail('Autentificarea Google a eșuat. Încearcă din nou.'))
            .finally(() => setBusy(null));
        },
      });
    }
    el.innerHTML = '';
    window.google?.accounts.id.renderButton(el, {
      type: 'standard',
      theme: dark ? 'filled_black' : 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      logo_alignment: 'left',
      width: Math.min(400, Math.round(el.getBoundingClientRect().width) || 320),
    });
  }, [googleReady, showGoogle, dark]);

  // Initialize AppleID JS once ready + nonce available (usePopup → token in JS,
  // no full-page redirect). redirectURI must be a return URL registered on the
  // Apple Services ID; the current origin is the natural choice.
  useEffect(() => {
    if (!appleReady || !showApple || !APPLE_SERVICES_ID || !nonce) return;
    window.AppleID?.auth.init({
      clientId: APPLE_SERVICES_ID,
      scope: 'name email',
      redirectURI: window.location.origin,
      usePopup: true,
      nonce,
    });
  }, [appleReady, showApple, nonce]);

  const handleApple = useCallback(async () => {
    if (busy || disabled || !window.AppleID) return;
    setBusy('apple');
    try {
      const res = await window.AppleID.auth.signIn();
      await onApple({
        identityToken: res.authorization.id_token,
        nonce,
        firstName: res.user?.name?.firstName,
        lastName: res.user?.name?.lastName,
      });
    } catch (err) {
      // Apple rejects with `{ error: 'popup_closed_by_user' }` on cancel — silent.
      const code = (err as { error?: string })?.error;
      if (code && code !== 'popup_closed_by_user') {
        onError('Autentificarea Apple a eșuat. Încearcă din nou.');
      }
    } finally {
      setBusy(null);
    }
  }, [busy, disabled, nonce, onApple, onError]);

  if (!showGoogle && !showApple) return null;

  const btnClass = cn(
    'flex w-full items-center justify-center gap-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
    dark
      ? 'rounded-xl bg-white py-[13px] text-[14.5px] text-[#1C1C1E] hover:opacity-90'
      : 'rounded-lg border border-border bg-background py-2.5 text-sm text-foreground hover:bg-muted',
  );

  return (
    <>
      {showGoogle && (
        <Script
          src={GOOGLE_GSI_SRC}
          strategy="afterInteractive"
          onReady={() => setGoogleReady(true)}
        />
      )}
      {showApple && (
        <Script
          src={APPLE_JS_SRC}
          strategy="afterInteractive"
          onReady={() => setAppleReady(true)}
        />
      )}

      {separator && (
        <div className="flex items-center gap-3 py-0.5" aria-hidden="true">
          <span className={cn('h-px flex-1', dark ? 'bg-white/20' : 'bg-border')} />
          <span className={cn('text-xs', dark ? 'text-white/50' : 'text-muted-foreground')}>
            sau continuă cu
          </span>
          <span className={cn('h-px flex-1', dark ? 'bg-white/20' : 'bg-border')} />
        </div>
      )}

      {showApple && (
        <button
          type="button"
          onClick={handleApple}
          disabled={disabled || busy !== null || !appleReady}
          className={btnClass}
          aria-label={labels?.apple ?? 'Continuă cu Apple'}
        >
          {busy === 'apple' ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : (
            <AppleIcon className="h-[18px] w-[18px]" />
          )}
          {labels?.apple ?? 'Continuă cu Apple'}
        </button>
      )}

      {showGoogle && (
        <div className="flex flex-col items-stretch">
          {/* Google's official rendered button (reliable id_token on click). */}
          <div
            ref={googleBtnRef}
            className={cn(
              'flex justify-center overflow-hidden [color-scheme:light]',
              (disabled || busy !== null) && 'pointer-events-none opacity-60',
            )}
          />
          {busy === 'google' && (
            <div className="mt-1 flex justify-center">
              <Loader2
                className={cn('h-4 w-4 animate-spin', dark ? 'text-white' : 'text-foreground')}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.42 2.22-1.14 3.02-.87.96-2.28 1.7-3.42 1.61-.14-1.11.42-2.28 1.11-3.02.81-.87 2.28-1.53 3.45-1.61zM20.5 17.02c-.57 1.32-.84 1.9-1.58 3.07-1.03 1.63-2.48 3.66-4.28 3.68-1.6.02-2.01-1.05-4.18-1.03-2.17.01-2.62 1.05-4.22 1.03-1.8-.02-3.18-1.85-4.21-3.48C-1.02 15.9-1.28 9.9 2.15 7.5c1.29-.9 2.87-1.28 4.05-1.28 1.63 0 3.03 1.07 4.35 1.07 1.28 0 2.42-1.13 4.28-1.13 1.05 0 3.05.28 4.35 2.11-3.82 2.09-3.2 7.55.32 8.75z" />
    </svg>
  );
}
