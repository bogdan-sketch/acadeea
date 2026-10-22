'use client';

import { useState } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, MailCheck, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await auth.forgotPassword(email);
    } finally {
      // Always show success — no account enumeration.
      setSent(true);
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--st-green-bg)] dark:bg-green-900/30">
              <MailCheck className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Verifică emailul</CardTitle>
            <CardDescription>
              Dacă există un cont pentru{' '}
              <span className="font-medium text-foreground">{email}</span>, ai primit un email cu un
              link de resetare a parolei. Linkul expiră în 1 oră.
            </CardDescription>
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-2xl">
            A
          </div>
          <CardTitle className="text-2xl">Resetare parolă</CardTitle>
          <CardDescription>
            Introdu adresa de email și îți trimitem un link pentru a-ți seta o parolă nouă.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplu.ro"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Trimite linkul de resetare
            </Button>
            <Link
              href="/login"
              className={buttonVariants({ variant: 'ghost', className: 'w-full' })}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Înapoi la conectare
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
