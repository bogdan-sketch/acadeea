'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { auth } from '@/lib/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, Eye, EyeOff, ArrowLeft } from 'lucide-react';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tokenStatus, setTokenStatus] = useState<{
    valid: boolean;
    reason?: string;
    purpose?: 'RESET' | 'REACTIVATION';
  } | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    auth.resetStatus(token).then((status) => {
      setTokenStatus(status);
      setChecking(false);
    });
  }, [token]);

  if (!token) {
    return (
      <StatusCard
        title="Link invalid"
        description="Linkul de resetare nu conține un token valid. Verifică emailul primit."
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
        title: 'Link folosit',
        desc: 'Acest link a fost deja folosit. Dacă ți-ai setat parola, conectează-te din pagina de login. Altfel, solicită un nou link.',
      },
      expired: {
        title: 'Link expirat',
        desc: 'Acest link a expirat. Solicită un nou link de resetare din pagina de conectare.',
      },
      invalid: {
        title: 'Link invalid',
        desc: 'Tokenul de resetare nu este valid. Verifică emailul primit.',
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
            <CardTitle className="text-2xl">Parolă setată!</CardTitle>
            <CardDescription>Vei fi redirecționat către pagina de conectare...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isReactivation = tokenStatus?.purpose === 'REACTIVATION';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Parola trebuie să aibă minim 8 caractere');
      return;
    }
    if (password !== confirmPassword) {
      setError('Parolele nu coincid');
      return;
    }

    setLoading(true);
    try {
      await auth.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message || '';
      if (msg.includes('reuse') || msg.includes('last') || msg.includes('PASSWORD_REUSED')) {
        setError('Nu poți reutiliza niciuna dintre ultimele 3 parole. Alege o parolă nouă.');
      } else if (msg.includes('expired')) {
        setError('Acest link a expirat. Solicită un nou link de resetare.');
      } else if (msg.includes('already been used')) {
        setError('Acest link a fost deja folosit.');
      } else {
        setError(msg || 'A apărut o eroare. Încearcă din nou.');
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
          <CardTitle className="text-2xl">
            {isReactivation ? 'Cont reactivat' : 'Setează o parolă nouă'}
          </CardTitle>
          <CardDescription>
            {isReactivation
              ? 'Contul tău a fost reactivat. Pentru securitate, setează-ți o parolă nouă pentru a continua.'
              : 'Alege o parolă nouă pentru contul tău.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Parolă nouă</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minim 8 caractere"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoFocus
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Ascunde parola' : 'Arată parola'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmă parola nouă</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Setează parola
            </Button>
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
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/login"
            className={buttonVariants({ variant: 'outline', className: 'w-full' })}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Înapoi la conectare
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
