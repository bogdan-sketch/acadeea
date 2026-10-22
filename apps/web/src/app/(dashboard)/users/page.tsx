'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth as authApi, users as usersApi, roles as rolesApi, resolveApiUrl } from '@/lib/api';
import type { User, InviteUserRequest, RoleInfo, UserInvitation } from '@/lib/types';
import { userRoleLabels } from '@/lib/constants';
import type { UserRole } from '@horae/shared-types';
import { FilterChips } from '@/components/filter-chips';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Hint } from '@/components/hint';
import { Truncate } from '@/components/truncate';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { Button } from '@/components/ui/button';
import { IconAction, PageHead } from '../stock/_ui/parts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Ban, KeyRound, Loader2, RotateCcw, Send, UserCog, UserPlus, Users } from 'lucide-react';
import { usePermissions, useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';

/** Verificare simplă de format; API-ul validează oricum (IsEmail). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
import { RolesMatrix } from './roles-matrix';

// Per-role colour: administrator = brand accent, the rest cycle semantic tokens.
const ROLE_TONES = ['blue', 'green', 'orange', 'purple', 'indigo'] as const;

function roleTone(slug: string | undefined, roles: RoleInfo[]) {
  if (!slug) return { solid: 'var(--st-gray)', bg: 'var(--st-gray-bg)', ink: 'var(--st-gray)' };
  if (slug.toLowerCase() === 'administrator')
    return { solid: 'var(--primary)', bg: 'var(--accent)', ink: 'var(--primary)' };
  const others = roles.filter((r) => r.slug.toLowerCase() !== 'administrator');
  const i = Math.max(
    0,
    others.findIndex((r) => r.slug.toLowerCase() === slug.toLowerCase()),
  );
  const t = ROLE_TONES[i % ROLE_TONES.length];
  return { solid: `var(--st-${t})`, bg: `var(--st-${t}-bg)`, ink: `var(--st-${t})` };
}

const pill =
  'inline-flex h-6 items-center whitespace-nowrap rounded-full px-[9px] text-xs font-bold';
const rowGrid = 'grid grid-cols-[minmax(0,1.8fr)_150px_130px_130px_110px] items-center gap-3';

type View = 'people' | 'roles';

function UsersInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = usePermissions();
  const { user: me } = useAuth();
  const canManageRoles = can('read', 'all');
  const view: View = params.get('tab') === 'roles' && canManageRoles ? 'roles' : 'people';

  const [data, setData] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<RoleInfo[]>([]);
  const [invite, setInvite] = useState<InviteUserRequest>({ email: '', roleId: '' });
  const { ask, dialog } = useConfirmDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersApi.list({ page: 1, limit: 200 });
      setData(res.data);
    } catch {
      toast.error('Eroare la încărcarea utilizatorilor');
    } finally {
      setLoading(false);
    }
    usersApi
      .invitations()
      .then(setInvitations)
      .catch(() => setInvitations([]));
  }, []);

  const loadRoles = useCallback(() => {
    rolesApi
      .list()
      .then(setAvailableRoles)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadRoles();
  }, [load, loadRoles]);

  const pending = useMemo(
    () => invitations.filter((i) => !i.acceptedAt && new Date(i.expiresAt) > new Date()),
    [invitations],
  );

  const setView = (v: View) => router.replace(v === 'roles' ? '/users?tab=roles' : '/users');

  const emailValid = EMAIL_RE.test(invite.email.trim());
  // Mesajul apare doar după ce s-a scris ceva — un câmp gol nu e o greșeală.
  const emailInvalid = invite.email.trim() !== '' && !emailValid;

  const handleInvite = async () => {
    if (!emailValid) return;
    setSaving(true);
    try {
      await usersApi.invite({ ...invite, email: invite.email.trim() });
      toast.success('Invitație trimisă');
      setShowInvite(false);
      setInvite({ email: '', roleId: '' });
      load();
    } catch {
      toast.error('Invitația a eșuat');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (u: User) => {
    const ok = await ask({
      title: 'Trimiți link de resetare a parolei?',
      description: `${u.firstName} ${u.lastName} primește pe ${u.email} un link valabil o oră pentru a-și seta o parolă nouă.`,
      confirmLabel: 'Trimite linkul',
    });
    if (!ok) return;
    try {
      await authApi.forgotPassword(u.email);
      toast.success('Link de resetare trimis');
    } catch {
      toast.error('Trimiterea a eșuat');
    }
  };

  const toggleActive = async (u: User) => {
    if (u.isActive) {
      const ok = await ask({
        title: `Dezactivezi contul lui ${u.firstName} ${u.lastName}?`,
        description:
          'Nu se mai poate autentifica, dar istoricul acțiunilor rămâne. Poți reactiva contul oricând.',
        confirmLabel: 'Dezactivează',
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      if (u.isActive) await usersApi.deactivate(u.id);
      else await usersApi.reactivate(u.id);
      toast.success(u.isActive ? 'Cont dezactivat' : 'Cont reactivat');
      load();
    } catch (err) {
      toast.error((err as { message?: string }).message || 'Acțiunea a eșuat');
    }
  };

  const meta = `${data.length} persoane · ${availableRoles.length} roluri · ${pending.length} ${
    pending.length === 1 ? 'invitație' : 'invitații'
  } în așteptare`;

  // Segmented control inside the 42px header row: 42 outer, 36 inner (M-2).
  const segBtn = (on: boolean) =>
    `h-9 cursor-pointer rounded-[9px] px-3.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 ${
      on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Echipă & roluri" meta={meta}>
        {canManageRoles && (
          <div
            role="group"
            aria-label="Secțiune"
            className="inline-flex h-[42px] items-center gap-0.5 rounded-[var(--radius-ctl)] bg-muted p-[3px]"
          >
            <Hint label="Persoane" detail="Membrii echipei și invitațiile în așteptare">
              <button
                type="button"
                aria-pressed={view === 'people'}
                onClick={() => setView('people')}
                className={segBtn(view === 'people')}
              >
                Persoane
              </button>
            </Hint>
            <Hint label="Roluri & drepturi" detail="Ce poate face fiecare rol">
              <button
                type="button"
                aria-pressed={view === 'roles'}
                onClick={() => setView('roles')}
                className={segBtn(view === 'roles')}
              >
                Roluri & drepturi
              </button>
            </Hint>
          </div>
        )}
        {can('create', 'User') && (
          <TutorialAnchor id="users.roles.invite">
            <IconAction
              icon={UserPlus}
              tone="primary"
              word="Invită"
              label="Invită o persoană"
              title="Invită prin e-mail, cu rolul ales"
              onClick={() => setShowInvite(true)}
            />
          </TutorialAnchor>
        )}
      </PageHead>

      {view === 'roles' ? (
        <TutorialAnchor id="users.roles.permissions">
          <div>
            <RolesMatrix canManage={canManageRoles} onChanged={loadRoles} />
          </div>
        </TutorialAnchor>
      ) : (
        <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-card">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div
                className={`${rowGrid} px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground`}
              >
                <span>Persoană</span>
                <span>Rol</span>
                <span>Din</span>
                <span>Stare</span>
                <span className="sr-only">Acțiuni</span>
              </div>

              {loading && (
                <div className="flex justify-center border-t border-border py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {!loading &&
                data.map((u) => {
                  const tone = roleTone(u.role?.slug, availableRoles);
                  const initials =
                    `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();
                  const isMe = me?.id === u.id;
                  return (
                    <div
                      key={u.id}
                      className={`${rowGrid} border-t border-border px-5 py-[7px] text-[13px]`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        {u.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolveApiUrl(u.avatarUrl)}
                            alt=""
                            className={`h-8 w-8 flex-none rounded-full object-cover ${u.isActive ? '' : 'opacity-60'}`}
                          />
                        ) : (
                          <span
                            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ background: u.isActive ? tone.solid : 'var(--st-gray)' }}
                          >
                            {initials}
                          </span>
                        )}
                        <span className="flex min-w-0 flex-col leading-tight">
                          <Truncate
                            text={`${u.firstName} ${u.lastName}`}
                            className={`font-semibold ${u.isActive ? '' : 'text-muted-foreground'}`}
                          />
                          <Truncate text={u.email} className="text-xs text-muted-foreground" />
                        </span>
                      </span>
                      <span>
                        <span className={pill} style={{ background: tone.bg, color: tone.ink }}>
                          {u.role?.name ?? '—'}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        {format(new Date(u.createdAt), 'd MMM yyyy', { locale: ro })}
                      </span>
                      <span>
                        <span
                          className={pill}
                          style={
                            u.isActive
                              ? { background: 'var(--st-green-bg)', color: 'var(--st-green)' }
                              : { background: 'var(--st-gray-bg)', color: 'var(--st-gray)' }
                          }
                        >
                          {u.isActive ? 'Activ' : 'Inactiv'}
                        </span>
                      </span>
                      <span className="flex justify-end gap-0.5">
                        {can('update', 'User') && (
                          <IconAction
                            row
                            icon={KeyRound}
                            label="Resetează parola"
                            title="Trimite link de resetare a parolei"
                            onClick={() => resetPassword(u)}
                          />
                        )}
                        <IconAction
                          row
                          icon={UserCog}
                          href={`/users/${u.id}`}
                          label="Deschide persoana"
                          title="Deschide: rol, stare cont, detalii"
                        />
                        {can('delete', 'User') && !isMe && (
                          <span
                            className={
                              u.isActive ? 'text-destructive [&_button]:text-destructive' : ''
                            }
                          >
                            <IconAction
                              row
                              icon={u.isActive ? Ban : RotateCcw}
                              label={u.isActive ? 'Dezactivează contul' : 'Reactivează contul'}
                              title={
                                u.isActive
                                  ? 'Dezactivează contul (păstrează istoricul)'
                                  : 'Reactivează contul'
                              }
                              onClick={() => toggleActive(u)}
                            />
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}

              {!loading &&
                pending.map((inv) => {
                  const label =
                    userRoleLabels[inv.role as UserRole] ?? String(inv.role).replace(/_/g, ' ');
                  const tone = roleTone(String(inv.role), availableRoles);
                  return (
                    <div
                      key={inv.id}
                      className={`${rowGrid} border-t border-border px-5 py-[7px] text-[13px]`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                          {inv.email[0]?.toUpperCase()}
                        </span>
                        <span className="flex min-w-0 flex-col leading-tight">
                          <Truncate
                            text={
                              `${inv.firstName ?? ''} ${inv.lastName ?? ''}`.trim() || inv.email
                            }
                            className="font-semibold"
                          />
                          <Truncate text={inv.email} className="text-xs text-muted-foreground" />
                        </span>
                      </span>
                      <span>
                        <span className={pill} style={{ background: tone.bg, color: tone.ink }}>
                          {label}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        {format(new Date(inv.createdAt), 'd MMM yyyy', { locale: ro })}
                      </span>
                      <span>
                        <span
                          className={pill}
                          style={{ background: 'var(--st-gray-bg)', color: 'var(--st-gray)' }}
                        >
                          Invitație trimisă
                        </span>
                      </span>
                      <span />
                    </div>
                  );
                })}

              {!loading && data.length === 0 && pending.length === 0 && (
                <div className="border-t border-border">
                  <EmptyState
                    compact
                    icon={Users}
                    title="Niciun utilizator"
                    description="Invită prima persoană din echipă."
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {dialog}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-[calc(100vw-2rem)] p-6 sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Invită membru nou</DialogTitle>
          </DialogHeader>
          {/* min-w-0: ca element de grid, altfel lățimea intrinsecă a chip-urilor
              lățește dialogul peste ecranul de 390 px. */}
          <div className="flex min-w-0 flex-col">
            <Label htmlFor="invite-email" className="text-xs font-semibold text-muted-foreground">
              Email *
            </Label>
            <Input
              id="invite-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              aria-invalid={emailInvalid || undefined}
              aria-describedby={emailInvalid ? 'invite-email-error' : undefined}
              className="mt-1.5 h-auto rounded-[10px] border-0 bg-muted px-3.5 py-[11px] text-[13.5px] dark:bg-muted"
            />
            {emailInvalid && (
              <p id="invite-email-error" role="alert" className="mt-1.5 text-xs text-destructive">
                Adresa de email nu e validă (ex: nume@firma.ro).
              </p>
            )}
            <Label className="mt-3 text-xs font-semibold text-muted-foreground">Rol</Label>
            <div role="group" aria-label="Rol" className="mt-1.5 flex flex-wrap gap-2">
              <FilterChips
                layout="bare"
                options={availableRoles.map((r) => ({ value: r.id, label: r.name }))}
                value={invite.roleId || null}
                onChange={(v) => setInvite({ ...invite, roleId: v ?? '' })}
              />
            </div>
          </div>
          <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0">
            <Button variant="secondary" className="h-[42px]" onClick={() => setShowInvite(false)}>
              Anulează
            </Button>
            <Button
              className="h-[42px]"
              onClick={handleInvite}
              disabled={saving || !emailValid || !invite.roleId}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Trimite invitația
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersInner />
    </Suspense>
  );
}
