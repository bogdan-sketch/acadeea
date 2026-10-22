'use client';

import { useCallback, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { auth } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { providerAuthErrorMessage } from '@/lib/auth-errors';
import { SocialAuthButtons, type AppleCredential } from '@/components/auth/social-auth-buttons';
import type { AuthProvider } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, XCircle, CheckCircle2 } from 'lucide-react';
import { BRAND_NAME } from '@/lib/brand';

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { providerLogin } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tokenStatus, setTokenStatus] = useState<{
    valid: boolean;
    reason?: string;
    email?: string;
  } | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    auth.checkInvite(token).then((status) => {
      setTokenStatus(status);
      setChecking(false);
    });
  }, [token]);

  // Sign up with a provider — the invite token authorizes account creation
  // (no password). On success the AuthResponse tokens are persisted and we land
  // in the app, same as password acceptance. Declared before the early returns
  // below so the hooks order stays stable.
  const runProviderSignup = useCallback(
    async (provider: AuthProvider, body: Parameters<typeof providerLogin>[1]) => {
      if (!token) return;
      setError('');
      try {
        await providerLogin(provider, { ...body, invitationToken: token }, false);
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/';
        }, 1200);
      } catch (err: unknown) {
        setError(providerAuthErrorMessage(err));
      }
    },
    [token, providerLogin],
  );

  const handleGoogle = useCallback(
    (credential: string) => runProviderSignup('google', { identityToken: credential }),
    [runProviderSignup],
  );

  const handleApple = useCallback(
    (cred: AppleCredential) =>
      runProviderSignup('apple', {
        identityToken: cred.identityToken,
        nonce: cred.nonce,
        firstName: cred.firstName,
        lastName: cred.lastName,
      }),
    [runProviderSignup],
  );

  if (!token) {
    return (
      <StatusCard
        title="Link invalid"
        description="Linkul de invitatie nu contine un token valid. Verifica emailul primit."
      />
    );
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tokenStatus && !tokenStatus.valid) {
    const messages: Record<string, { title: string; desc: string }> = {
      used: {
        title: 'Invitatie folosita',
        desc: 'Aceasta invitatie a fost deja folosita. Contul tau este activ — conecteaza-te din pagina de login.',
      },
      expired: {
        title: 'Invitatie expirata',
        desc: 'Aceasta invitatie a expirat. Solicita o noua invitatie de la administrator.',
      },
      invalid: {
        title: 'Invitatie invalida',
        desc: 'Tokenul de invitatie nu este valid. Verifica emailul primit.',
      },
    };
    const msg = messages[tokenStatus.reason || 'invalid'];
    return <StatusCard title={msg.title} description={msg.desc} />;
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--st-green-bg)] dark:bg-green-900/30">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Cont creat!</CardTitle>
            <CardDescription>Vei fi redirectionat catre aplicatie...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Parola trebuie sa aiba minim 8 caractere');
      return;
    }

    if (password !== confirmPassword) {
      setError('Parolele nu coincid');
      return;
    }

    setLoading(true);
    try {
      const res = await auth.acceptInvite({ token, firstName, lastName, password });
      localStorage.setItem('accessToken', res.accessToken);
      localStorage.setItem('refreshToken', res.refreshToken);
      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/';
      }, 1500);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      if (apiErr.message?.includes('expired')) {
        setError('Invitatia a expirat. Solicita o noua invitatie de la administrator.');
      } else if (apiErr.message?.includes('already been accepted')) {
        setError('Aceasta invitatie a fost deja folosita.');
      } else if (apiErr.message?.includes('Invalid invitation')) {
        setError('Token de invitatie invalid.');
      } else {
        setError(apiErr.message || 'A aparut o eroare. Incearca din nou.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-2xl">
            A
          </div>
          <CardTitle className="text-2xl">Creeaza-ti contul</CardTitle>
          <CardDescription>
            Completeaza datele pentru a-ti activa contul {BRAND_NAME}
            {tokenStatus?.email && (
              <span className="block mt-1 font-medium text-foreground">{tokenStatus.email}</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prenume</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nume</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Parola</Label>
              <Input
                id="password"
                type="password"
                placeholder="Minim 8 caractere"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirma parola</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Creeaza contul
            </Button>

            <SocialAuthButtons
              variant="default"
              separator
              disabled={loading}
              onGoogle={handleGoogle}
              onApple={handleApple}
              onError={setError}
            />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
