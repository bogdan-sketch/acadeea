'use client';

import { useCallback, useEffect, useState } from 'react';
import { roles as rolesApi } from '@/lib/api';
import type { RoleInfo, PermissionRule } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Check, Loader2, Lock, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { toast } from 'sonner';

// Romanian labels for each CASL subject the backend exposes.
const SUBJECT_LABELS: Record<string, string> = {
  Recipe: 'Rețete',
  RecipeCost: 'Cost producție rețete',
  Task: 'Task-uri',
  Order: 'Comenzi',
  OrderItem: 'Articole comandă',
  RawMaterial: 'Materii prime',
  Consumable: 'Consumabile',
  StockMovement: 'Mișcări stoc',
  StockReservation: 'Rezervări stoc',
  Location: 'Locații',
  StockTransfer: 'Transferuri stoc',
  User: 'Utilizatori',
  UserInvitation: 'Invitații',
  DeliveryNote: 'Avize livrare',
  Organization: 'Organizație',
  Role: 'Roluri',
};

const ACTIONS = [
  { key: 'read', label: 'Vede' },
  { key: 'create', label: 'Adaugă' },
  { key: 'update', label: 'Modifică' },
  { key: 'delete', label: 'Șterge' },
];
const ACTION_ORDER = ACTIONS.map((a) => a.key);

type Perms = Record<string, string[]>;

interface RoleState {
  info: RoleInfo;
  perms: Perms;
  /** Rules on subjects outside the editable list — preserved on every PUT. */
  extras: PermissionRule[];
}

export function RolesMatrix({
  canManage,
  onChanged,
}: {
  canManage: boolean;
  onChanged?: () => void;
}) {
  const { ask, dialog } = useConfirmDialog();
  const [subjects, setSubjects] = useState<string[]>([]);
  const [cols, setCols] = useState<RoleState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RoleInfo | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, meta] = await Promise.all([rolesApi.list(), rolesApi.subjects()]);
      const details = await Promise.all(list.map((r) => rolesApi.get(r.id)));
      setSubjects(meta.subjects);
      setCols(
        list.map((info, i) => {
          const perms: Perms = {};
          const extras: PermissionRule[] = [];
          for (const p of details[i].permissions) {
            if (!meta.subjects.includes(p.subject)) {
              extras.push(p);
            } else if (p.action === 'manage') {
              perms[p.subject] = [...ACTION_ORDER];
            } else {
              perms[p.subject] = [...(perms[p.subject] ?? []), p.action];
            }
          }
          return { info, perms, extras };
        }),
      );
    } catch {
      toast.error('Eroare la încărcarea rolurilor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) load();
    else setLoading(false);
  }, [canManage, load]);

  const toRules = (perms: Perms, extras: PermissionRule[]): PermissionRule[] => {
    const rules: PermissionRule[] = [...extras];
    for (const subject of subjects) {
      const actions = perms[subject] ?? [];
      if (actions.length === 0) continue;
      if (ACTION_ORDER.every((a) => actions.includes(a))) {
        rules.push({ action: 'manage', subject });
      } else {
        for (const action of actions) rules.push({ action, subject });
      }
    }
    return rules;
  };

  const toggle = async (col: RoleState, subject: string, action: string) => {
    if (col.info.slug === 'administrator' || busy) return;
    const cur = new Set(col.perms[subject] ?? []);
    if (cur.has(action)) cur.delete(action);
    else cur.add(action);
    const next: Perms = { ...col.perms, [subject]: ACTION_ORDER.filter((a) => cur.has(a)) };
    const apply = (perms: Perms) =>
      setCols((prev) => prev.map((c) => (c.info.id === col.info.id ? { ...c, perms } : c)));
    apply(next);
    setBusy(col.info.id);
    try {
      await rolesApi.setPermissions(col.info.id, toRules(next, col.extras));
    } catch (err) {
      apply(col.perms);
      toast.error((err as { message?: string }).message || 'Eroare la salvare');
    } finally {
      setBusy(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setDialogOpen(true);
  };

  const openEdit = (role: RoleInfo) => {
    setEditing(role);
    setName(role.name);
    setDescription(role.description ?? '');
    setDialogOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Numele rolului este obligatoriu');
      return;
    }
    setSaving(true);
    try {
      const body = { name, description: description || undefined };
      if (editing) await rolesApi.update(editing.id, body);
      else await rolesApi.create(body);
      toast.success(editing ? 'Rol actualizat' : 'Rol creat');
      setDialogOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error((err as { message?: string }).message || 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (role: RoleInfo) => {
    const ok = await ask({
      title: `Ștergi rolul „${role.name}”?`,
      description:
        'Persoanele cu acest rol trebuie mutate pe altul înainte; altfel ștergerea e refuzată.',
      confirmLabel: 'Șterge rolul',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await rolesApi.remove(role.id);
      toast.success('Rol șters');
      await load();
      onChanged?.();
    } catch (err) {
      toast.error((err as { message?: string }).message || 'Nu se poate șterge rolul');
    }
  };

  if (!canManage) {
    return (
      <section className="rounded-[18px] border border-border bg-card px-5 py-10 text-center text-muted-foreground">
        Nu ai permisiunea de a administra roluri.
      </section>
    );
  }

  const gridCols = `minmax(0,1fr) repeat(${Math.max(cols.length, 1)}, 130px)`;

  return (
    <section className="overflow-hidden rounded-[18px] border border-border bg-card">
      <div className="flex items-start justify-between gap-3 px-5 pb-1.5 pt-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-bold">Ce poate face fiecare rol</h2>
          <span className="text-[13px] text-muted-foreground">
            Apasă un cerc ca să schimbi dreptul (Vede · Adaugă · Modifică · Șterge). Administratorul
            le are pe toate și nu poate fi modificat.
          </span>
        </div>
        <Button size="icon-sm" onClick={openCreate} title="Rol nou" aria-label="Rol nou">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 260 + cols.length * 142 }}>
            <div
              className="grid items-start gap-3 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
              style={{ gridTemplateColumns: gridCols }}
            >
              <span>Drept</span>
              {cols.map((c) => (
                <span key={c.info.id} className="flex flex-col items-center gap-1 text-center">
                  <span className="flex items-center gap-1">
                    {c.info.slug === 'administrator' && <Lock className="h-3 w-3" />}
                    {c.info.name}
                  </span>
                  <span className="font-medium normal-case tracking-normal">
                    {c.info.userCount} pers.
                  </span>
                  <span className="flex gap-0.5">
                    <button
                      type="button"
                      onClick={() => openEdit(c.info)}
                      title={`Editează rolul ${c.info.name}`}
                      aria-label={`Editează rolul ${c.info.name}`}
                      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-muted"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    {!c.info.isSystem && (
                      <button
                        type="button"
                        onClick={() => remove(c.info)}
                        disabled={c.info.userCount > 0}
                        title={
                          c.info.userCount > 0
                            ? 'Rolul are utilizatori asignați'
                            : `Șterge rolul ${c.info.name}`
                        }
                        aria-label={`Șterge rolul ${c.info.name}`}
                        className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-destructive hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                </span>
              ))}
            </div>
            {subjects.map((subject) => (
              <div
                key={subject}
                className="grid items-center gap-3 border-t border-border px-5 py-1.5 text-[13px]"
                style={{ gridTemplateColumns: gridCols }}
              >
                <span className="font-semibold">{SUBJECT_LABELS[subject] ?? subject}</span>
                {cols.map((c) => {
                  const locked = c.info.slug === 'administrator';
                  return (
                    <span key={c.info.id} className="flex justify-center gap-1">
                      {ACTIONS.map((a) => {
                        const on = locked || (c.perms[subject] ?? []).includes(a.key);
                        const aria = `${c.info.name}: ${a.label} ${SUBJECT_LABELS[subject] ?? subject} — ${on ? 'permis' : 'nepermis'}`;
                        return (
                          <button
                            key={a.key}
                            type="button"
                            aria-pressed={on}
                            aria-label={aria}
                            title={aria}
                            disabled={locked}
                            onClick={() => toggle(c, subject, a.key)}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 p-0 text-white transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 ${
                              on
                                ? 'border-[var(--st-green)] bg-[var(--st-green)]'
                                : 'border-border bg-card'
                            } ${locked ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                          >
                            {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                          </button>
                        );
                      })}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl p-6 sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editing ? 'Editează rol' : 'Rol nou'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col">
            <Label htmlFor="role-name" className="text-xs font-semibold text-muted-foreground">
              Nume *
            </Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={editing?.isSystem}
              placeholder="ex: Cofetar"
              className="mt-1.5 h-auto rounded-[10px] border-0 bg-muted px-3.5 py-[11px] text-[13.5px] dark:bg-muted"
            />
            {editing?.isSystem && (
              <p className="mt-1 text-xs text-muted-foreground">
                Rol de sistem — numele nu poate fi schimbat, dar permisiunile da.
              </p>
            )}
            <Label htmlFor="role-desc" className="mt-3 text-xs font-semibold text-muted-foreground">
              Descriere
            </Label>
            <Input
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opțional"
              className="mt-1.5 h-auto rounded-[10px] border-0 bg-muted px-3.5 py-[11px] text-[13.5px] dark:bg-muted"
            />
            {!editing && (
              <p className="mt-2 text-xs text-muted-foreground">
                După creare, bifează drepturile în matrice.
              </p>
            )}
          </div>
          <DialogFooter className="mx-0 mb-0 border-0 bg-transparent p-0">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              title="Anulează"
              aria-label="Anulează"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              onClick={save}
              disabled={saving}
              title={editing ? 'Salvează rolul' : 'Creează rolul'}
              aria-label={editing ? 'Salvează rolul' : 'Creează rolul'}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </section>
  );
}
