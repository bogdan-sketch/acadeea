'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, KeyRound, Loader2, Mail, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, usePermissions } from '@/contexts/auth-context';
import { useTutorial } from '@/contexts/tutorial-context';
import { auth as authApi, users as usersApi, ApiError } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';
import { SchemePicker } from '@/components/scheme-picker';
import { SCHEMES, useColorScheme } from '@/components/color-scheme-provider';
import { LinkedAccountRows } from '@/components/auth/linked-accounts-card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Truncate } from '@/components/truncate';
import { IconAction } from '@/app/(dashboard)/stock/_ui/parts';
import { FIELD_LABEL, FIELD_RO, Row, Section } from './section';

/**
 * Profil › Date — the person's own data: name, login email (read-only),
 * role chip; profile photo; preferences (colour scheme — per browser — and
 * tutorial); security (password link, Apple/Google); delete account.
 */
export function DateTab() {
  const { user, logout, refresh } = useAuth();
  const { can } = usePermissions();
  // No "update me" endpoint exists; PATCH /users/:id needs `update User`, so
  // only admins can edit their own name here — everyone else sees it read-only.
  const canEditName = can('update', 'User');
  const isRoot = can('manage', 'all');
  const { enabled: tutorialEnabled, setEnabled: setTutorialEnabled } = useTutorial();
  const { scheme } = useColorScheme();
  const current = SCHEMES.find((s) => s.id === scheme);

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Re-seed the inputs when the user record changes (e.g. after refresh()) —
  // "adjust state while rendering", no effect needed.
  const [seed, setSeed] = useState(`${user?.firstName ?? ''}\u0000${user?.lastName ?? ''}`);
  const nowSeed = `${user?.firstName ?? ''}\u0000${user?.lastName ?? ''}`;
  if (seed !== nowSeed) {
    setSeed(nowSeed);
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
  }

  const dirty =
    firstName.trim() !== (user?.firstName ?? '') || lastName.trim() !== (user?.lastName ?? '');
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || '—';

  const saveName = async () => {
    if (!user || !dirty || saving) return;
    const f = firstName.trim();
    const l = lastName.trim();
    if (!f || !l) {
      toast.error('Prenumele și numele nu pot fi goale.');
      return;
    }
    setSaving(true);
    try {
      await usersApi.update(user.id, { firstName: f, lastName: l });
      await refresh();
      toast.success('Datele tale au fost salvate');
    } catch (e) {
      toast.error('Nu am putut salva datele', {
        description: e instanceof ApiError ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!user?.email || sendingReset) return;
    setSendingReset(true);
    try {
      await authApi.forgotPassword(user.email);
      toast.success('Ți-am trimis un email cu linkul de schimbare a parolei');
    } catch {
      toast.error('Nu am putut trimite emailul. Încearcă din nou.');
    } finally {
      setSendingReset(false);
    }
  };

  const deleteAccount = async () => {
    if (!deletePassword || deleting) return;
    setDeleting(true);
    try {
      await authApi.deleteAccount(deletePassword);
      toast.success('Contul tău a fost șters');
      // Tokens are already revoked server-side; logout() drops the local session.
      await logout();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.message
          ? err.message
          : 'Nu am putut șterge contul. Încearcă din nou.';
      toast.error(msg);
      setDeleting(false);
    }
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
      {/* ── Left ──────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <Section
          title="Datele mele"
          desc="Numele apare pe taskuri, mișcări de stoc și în jurnal."
          footerNote={
            canEditName
              ? dirty
                ? 'Modificări nesalvate'
                : 'Numele tău, așa cum îl vede echipa'
              : 'Numele se schimbă de un administrator din Echipă & roluri'
          }
          footer={
            canEditName && (
              <IconAction
                icon={Check}
                word="Salvează"
                tone="primary"
                label="Salvează datele mele"
                title="Salvează prenumele și numele"
                disabled={!dirty || saving}
                spinning={saving}
                onClick={() => void saveName()}
              />
            )
          }
        >
          <div className="grid gap-4 px-6 pb-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="prenume" className={FIELD_LABEL}>
                Prenume
              </Label>
              {canEditName ? (
                <Input
                  id="prenume"
                  value={firstName}
                  autoComplete="given-name"
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={saving}
                />
              ) : (
                <div id="prenume" className={FIELD_RO}>
                  {user?.firstName || '—'}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="nume" className={FIELD_LABEL}>
                Nume
              </Label>
              {canEditName ? (
                <Input
                  id="nume"
                  value={lastName}
                  autoComplete="family-name"
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={saving}
                />
              ) : (
                <div id="nume" className={FIELD_RO}>
                  {user?.lastName || '—'}
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <span className={FIELD_LABEL}>Email de autentificare</span>
              <Truncate text={user?.email ?? '—'} className={`${FIELD_RO} text-muted-foreground`} />
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                Se schimbă doar din{' '}
                <Link href="/users" className="font-semibold text-primary-text hover:underline">
                  Echipă & roluri
                </Link>
                , de către un administrator.
              </p>
            </div>
            <div>
              <span className={FIELD_LABEL}>Rol</span>
              <span className="flex h-[var(--ctl-h)] items-center gap-2.5">
                <span className="inline-flex h-[34px] items-center rounded-full bg-accent px-3.5 text-[13px] font-bold text-primary-text">
                  {user?.role?.name ?? '—'}
                </span>
                {isRoot && (
                  <span className="text-[12.5px] text-muted-foreground">toate drepturile</span>
                )}
              </span>
            </div>
          </div>
        </Section>

        <Section
          title="Securitate"
          desc="Parola și conturile cu care te poți autentifica fără parolă."
        >
          <Row
            lead={
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-muted">
                <KeyRound className="h-[18px] w-[18px]" />
              </span>
            }
            title="Parolă"
            sub="Îți trimitem un link pe email, valabil 30 de minute"
          >
            <IconAction
              icon={Mail}
              word="Schimbă parola"
              label="Schimbă parola"
              title={`Trimite linkul de schimbare pe ${user?.email ?? 'emailul tău'}`}
              disabled={sendingReset}
              spinning={sendingReset}
              onClick={() => void sendPasswordReset()}
            />
          </Row>
          <LinkedAccountRows />
        </Section>
      </div>

      {/* ── Right ─────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <Section title="Poză de profil" desc="Apare în bara laterală și pe taskurile tale.">
          <div className="flex items-center gap-5 px-6 pb-5">
            <ImageUpload
              shape="circle"
              size={84}
              label="Poză de profil"
              value={user?.avatarUrl}
              onUpload={async (file) => {
                await usersApi.uploadMyAvatar(file);
                await refresh();
              }}
              onRemove={async () => {
                await usersApi.deleteMyAvatar();
                await refresh();
              }}
              fallback={
                <span className="flex h-full w-full items-center justify-center bg-accent font-serif text-[26px] font-semibold text-primary-text">
                  {initials}
                </span>
              }
            />
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              Orice format de imagine · max. 60 MB · se decupează pătrat și se comprimă automat.
              Apasă pe poză ca să încarci sau să o ștergi.
            </p>
          </div>
        </Section>

        <Section
          title="Preferințe"
          desc="Doar pentru contul tău, pe acest browser."
          aside={
            current &&
            `Acum: ${current.label} · ${current.mode === 'light' ? 'luminos' : 'întunecat'}`
          }
        >
          <div
            id="tema"
            className="flex scroll-mt-4 flex-col gap-3 border-t border-border px-6 py-4"
          >
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">Temă</span>
              <span className="text-[12.5px] text-muted-foreground">
                Trei scheme luminoase, trei întunecate — fiecare cu accentul ei. Se reține pe acest
                browser.
              </span>
            </span>
            <SchemePicker />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-sm font-semibold">Tutorial</span>
              <span className="text-[12.5px] text-muted-foreground">
                Sfaturi pe ecran cât explorezi aplicația
              </span>
            </span>
            <Switch
              aria-label="Tutorial"
              checked={tutorialEnabled}
              onCheckedChange={setTutorialEnabled}
            />
          </div>
        </Section>

        <Section title="Zonă de risc" desc="Acțiune definitivă — nu se poate anula." tone="danger">
          <Row
            title={<span className="text-destructive">Șterge contul meu</span>}
            sub="Datele personale se anonimizează; taskurile și mișcările rămân în istoric, fără numele tău. Îți cerem parola."
          >
            <IconAction
              icon={Trash2}
              word="Șterge contul"
              tone="danger"
              label="Șterge contul"
              title="Ștergere definitivă — îți cerem parola"
              onClick={() => {
                setDeletePassword('');
                setShowDelete(true);
              }}
            />
          </Row>
        </Section>
      </div>

      {/* Confirmare ștergere cont — cere parola curentă. */}
      <Dialog open={showDelete} onOpenChange={(o) => !deleting && setShowDelete(o)}>
        <DialogContent className="rounded-2xl p-6 sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-destructive">
              Șterge definitiv contul
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              Această acțiune este ireversibilă. Contul tău va fi dezactivat, datele personale
              anonimizate și vei fi deconectat de pe toate dispozitivele. Introdu parola curentă
              pentru a confirma.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void deleteAccount();
            }}
            className="flex flex-col"
          >
            <Label htmlFor="parola-curenta" className="text-xs font-semibold text-muted-foreground">
              Parola curentă
            </Label>
            <Input
              id="parola-curenta"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              disabled={deleting}
              autoFocus
              className="mt-1.5"
            />
            <DialogFooter className="mx-0 mb-0 mt-5 border-0 bg-transparent p-0">
              <Button
                type="button"
                variant="secondary"
                className="h-[42px]"
                onClick={() => setShowDelete(false)}
                disabled={deleting}
              >
                Renunță
              </Button>
              <Button
                type="submit"
                variant="destructive"
                className="h-[42px]"
                disabled={deleting || !deletePassword}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Șterge contul
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
