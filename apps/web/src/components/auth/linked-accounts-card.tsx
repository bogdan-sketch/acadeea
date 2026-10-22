'use client';

import { useCallback, useState } from 'react';
import { Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { providerLinkErrorMessage, providerUnlinkErrorMessage } from '@/lib/auth-errors';
import { SocialAuthButtons } from '@/components/auth/social-auth-buttons';
import { Capsule, IconAction } from '@/app/(dashboard)/stock/_ui/parts';
import type { AuthProvider } from '@/lib/types';

const PROVIDER_LABEL: Record<AuthProvider, string> = {
  apple: 'Apple',
  google: 'Google',
};

// A provider is offered only when its client id is configured (same gate as
// SocialAuthButtons); a linked one is always listed so it can be unlinked.
const CONFIGURED: Record<AuthProvider, boolean> = {
  apple: !!process.env.NEXT_PUBLIC_APPLE_SERVICES_ID,
  google: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
};

const ALL_PROVIDERS: AuthProvider[] = ['apple', 'google'];

/**
 * Profil › Securitate — one row per provider (Apple, Google): glyph, name,
 * "Conectat · …" / "Neconectat · …", a status capsule and ONE action
 * (Deconectează / Conectează cu …). Rendered inside the Securitate card.
 */
export function LinkedAccountRows() {
  const { user, refresh } = useAuth();
  const linked = user?.linkedProviders ?? [];
  // Which provider is being disconnected (null when idle).
  const [unlinking, setUnlinking] = useState<AuthProvider | null>(null);

  const handleConnected = useCallback(async () => {
    // Provider linked server-side — re-hydrate the user so linkedProviders updates.
    await refresh();
    toast.success('Cont conectat');
  }, [refresh]);

  const handleGoogleConnect = useCallback(
    async (credential: string) => {
      try {
        await auth.linkProvider('google', { identityToken: credential });
        await handleConnected();
      } catch (err) {
        toast.error(providerLinkErrorMessage(err));
      }
    },
    [handleConnected],
  );

  const handleAppleConnect = useCallback(
    async (cred: { identityToken: string; nonce: string }) => {
      try {
        await auth.linkProvider('apple', { identityToken: cred.identityToken, nonce: cred.nonce });
        await handleConnected();
      } catch (err) {
        toast.error(providerLinkErrorMessage(err));
      }
    },
    [handleConnected],
  );

  const handleDisconnect = async (provider: AuthProvider) => {
    setUnlinking(provider);
    try {
      await auth.unlinkProvider(provider);
      await refresh();
      toast.success(`${PROVIDER_LABEL[provider]} deconectat`);
    } catch (err) {
      toast.error(providerUnlinkErrorMessage(err));
    } finally {
      setUnlinking(null);
    }
  };

  // Removing the sole remaining provider would leave the user with no way to log
  // in via a provider; the backend also enforces this (400 LAST_LOGIN_METHOD).
  const isLastMethod = linked.length <= 1;

  return (
    <>
      {ALL_PROVIDERS.filter((p) => linked.includes(p) || CONFIGURED[p]).map((provider) => {
        const on = linked.includes(provider);
        const name = PROVIDER_LABEL[provider];
        return (
          <div
            key={provider}
            className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-3.5"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-muted text-[14px] font-bold"
            >
              {name[0]}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="text-sm font-semibold">{name}</span>
              <span className="text-[12.5px] text-muted-foreground">
                {on ? 'Conectat' : 'Neconectat · autentificare într-un pas, fără parolă'}
              </span>
            </span>
            <Capsule tone={on ? 'st-green' : 'st-gray'}>{on ? 'Conectat' : 'Neconectat'}</Capsule>
            {on ? (
              <IconAction
                icon={Unlink}
                word="Deconectează"
                label={`Deconectează ${name}`}
                title={
                  isLastMethod
                    ? 'Nu poți deconecta ultima metodă de autentificare'
                    : `Deconectează ${name} — rămâne autentificarea cu parolă`
                }
                disabled={isLastMethod || unlinking !== null}
                spinning={unlinking === provider}
                onClick={() => void handleDisconnect(provider)}
              />
            ) : (
              <div className="w-full sm:w-[240px]">
                <SocialAuthButtons
                  variant="default"
                  providers={[provider]}
                  onGoogle={handleGoogleConnect}
                  onApple={handleAppleConnect}
                  onError={(m) => toast.error(m)}
                  labels={{ apple: 'Conectează cu Apple', google: 'Conectează cu Google' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
