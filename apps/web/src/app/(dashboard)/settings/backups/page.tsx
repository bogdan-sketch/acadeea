'use client';

import { BackLink } from '@/components/back-link';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { orgSnapshots } from '@/lib/api';
import { usePermissions, useAuth } from '@/contexts/auth-context';
import type { OrgSnapshot } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Truncate } from '@/components/truncate';
import { IconAction, PageHead } from '../../stock/_ui/parts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Loader2, DatabaseBackup, Download, RotateCcw, Trash2, Info, Save } from 'lucide-react';
import { formatQty } from '@/lib/utils';

/** Nume de modele traduse în română acolo unde e evident; restul rămân ca în API. */
const MODEL_LABELS_RO: Record<string, string> = {
  Order: 'Comenzi',
  OrderItem: 'Articole comandă',
  Recipe: 'Rețete',
  Task: 'Taskuri',
  RawMaterial: 'Materii prime',
  Consumable: 'Consumabile',
  User: 'Utilizatori',
  UserInvitation: 'Invitații',
  Role: 'Roluri',
  Location: 'Locații',
  Supplier: 'Furnizori',
  Equipment: 'Echipamente',
  Notification: 'Notificări',
  StockMovement: 'Mișcări de stoc',
  StockTransfer: 'Transferuri',
  DeliveryNote: 'Avize de livrare',
  ConformityCertificate: 'Certificate de conformitate',
  Integration: 'Integrări',
};

function formatSize(sizeBytes: string): string {
  const bytes = Number(sizeBytes) || 0;
  if (bytes >= 1024 * 1024) return `${formatQty(Math.round((bytes / (1024 * 1024)) * 10) / 10)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** „Comenzi: 120, Rețete: 85…" — doar modelele cu rânduri, cele mai mari primele. */
function summaryLines(summary: Record<string, number>): string[] {
  return Object.entries(summary)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => `${MODEL_LABELS_RO[model] ?? model}: ${count}`);
}

const CONFIRM_WORD = 'RESTAUREAZA';

export default function BackupsPage() {
  const { can } = usePermissions();
  const { logout } = useAuth();
  const router = useRouter();
  const isAdmin = can('manage', 'all');

  const [items, setItems] = useState<OrgSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // action key while running
  const [label, setLabel] = useState('');
  const { ask, dialog } = useConfirmDialog();

  // Restore dialog state — double-guarded (dialog + typed confirmation).
  const [restoreTarget, setRestoreTarget] = useState<OrgSnapshot | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await orgSnapshots.list();
      setItems(
        [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      );
    } catch {
      toast.error('Nu am putut încărca lista de backup-uri');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/profil');
      return;
    }
    void load();
  }, [isAdmin, router, load]);

  if (!isAdmin) return null;

  const createNow = async () => {
    setBusy('create');
    try {
      await orgSnapshots.create(label.trim() || undefined);
      toast.success('Starea a fost salvată');
      setLabel('');
      await load();
    } catch {
      toast.error('Salvarea stării a eșuat');
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!restoreTarget || confirmText !== CONFIRM_WORD) return;
    setRestoring(true);
    try {
      const { restored } = await orgSnapshots.restore(restoreTarget.id);
      const total = Object.values(restored ?? {}).reduce((s, n) => s + n, 0);
      const top = summaryLines(restored ?? {})
        .slice(0, 3)
        .join(', ');
      toast.success(
        `Datele au fost restaurate (${total} înregistrări${top ? ` — ${top}` : ''}). Vei fi delogat…`,
        { duration: 4000 },
      );
      setRestoreTarget(null);
      // Sesiunile tuturor utilizatorilor sunt invalidate — delogare + login.
      setTimeout(() => {
        void logout().finally(() => {
          window.location.assign('/login');
        });
      }, 1500);
    } catch {
      toast.error('Restaurarea a eșuat — datele NU au fost modificate');
      setRestoring(false);
    }
  };

  const download = async (snap: OrgSnapshot) => {
    setBusy(`download-${snap.id}`);
    try {
      const blob = await orgSnapshots.download(snap.id);
      const stamp = formatDate(snap.createdAt).replace(/[.:]/g, '-').replace(' ', '_');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snapshot-${stamp}.json.gz`;
      // Anchor must be in the DOM before click (some engines ignore detached
      // anchors), removed after, and the object URL revoked on a later tick so
      // the download has started before it's freed.
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success('Backup descărcat');
    } catch (err) {
      if ((err as { status?: number }).status === 403) {
        toast.error('Doar administratorii platformei pot descărca fișierul de backup');
      } else {
        toast.error('Descărcarea a eșuat');
      }
    } finally {
      setBusy(null);
    }
  };

  const remove = async (snap: OrgSnapshot) => {
    const ok = await ask({
      title: `Ștergi backup-ul din ${formatDate(snap.createdAt)}?`,
      description: 'Fișierul dispare definitiv; backup-urile automate zilnice nu sunt afectate.',
      confirmLabel: 'Șterge backup-ul',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(`delete-${snap.id}`);
    try {
      await orgSnapshots.remove(snap.id);
      toast.success('Backup șters');
      await load();
    } catch {
      toast.error('Ștergerea a eșuat');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/profil?tab=setari#backup" label="Profil & setări" />
      <PageHead
        title="Backup & restaurare"
        meta="Salvările automate și manuale ale datelor organizației"
      />
      <div className="flex max-w-3xl flex-col gap-5">
        {/* Manual save */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseBackup className="h-4 w-4" />
              Salvează starea organizației
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Un backup se face automat în fiecare noapte la 01:30 (se păstrează ultimele 30). Poți
              salva manual starea oricând — de exemplu înainte de un inventar sau de o modificare
              mare.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void createNow();
              }}
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <Label
                  htmlFor="snapshot-label"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Etichetă (opțional)
                </Label>
                <Input
                  id="snapshot-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="ex. înainte de inventar"
                  maxLength={120}
                  disabled={busy !== null}
                  className="mt-1.5"
                />
              </div>
              <Button type="submit" className="h-[42px]" disabled={busy !== null}>
                {busy === 'create' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvează starea acum
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Snapshot list */}
        <Card>
          <CardHeader>
            <CardTitle>Backup-uri salvate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                compact
                icon={DatabaseBackup}
                title="Niciun backup încă"
                description="Primul se face automat la noapte — sau salvează manual starea acum."
              />
            ) : (
              items.map((snap) => {
                const lines = snap.summary ? summaryLines(snap.summary) : [];
                return (
                  <div
                    key={snap.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-ctl)] px-3 py-2.5 hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium">
                        <span className="whitespace-nowrap">{formatDate(snap.createdAt)}</span>
                        {snap.auto ? (
                          <Badge variant="secondary">Automat</Badge>
                        ) : (
                          snap.label && (
                            <Truncate
                              text={snap.label}
                              className="font-normal text-muted-foreground"
                            />
                          )
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(snap.sizeBytes)}
                        {snap.createdBy ? ` · de ${snap.createdBy}` : ''}
                      </p>
                    </div>

                    {lines.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Conținutul backup-ului"
                            />
                          }
                        >
                          <Info className="h-4 w-4" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[260px]">
                          <span className="block py-0.5 leading-relaxed">{lines.join(', ')}</span>
                        </TooltipContent>
                      </Tooltip>
                    )}

                    <IconAction
                      row
                      icon={Download}
                      label="Descarcă fișierul de backup"
                      title="Descarcă fișierul de backup (.json.gz)"
                      onClick={() => void download(snap)}
                      disabled={busy !== null}
                      spinning={busy === `download-${snap.id}`}
                    />

                    <IconAction
                      row
                      icon={RotateCcw}
                      label="Restaurează la această stare"
                      title="Restaurează datele la această stare"
                      onClick={() => {
                        setConfirmText('');
                        setRestoreTarget(snap);
                      }}
                      disabled={busy !== null}
                    />

                    {!snap.auto && (
                      <span className="[&_button]:text-destructive">
                        <IconAction
                          row
                          icon={Trash2}
                          label="Șterge acest backup"
                          title="Șterge acest backup"
                          onClick={() => void remove(snap)}
                          disabled={busy !== null}
                          spinning={busy === `delete-${snap.id}`}
                        />
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {dialog}

      {/* Restore confirmation — dialog + typed RESTAUREAZA */}
      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(o) => !restoring && !o && setRestoreTarget(null)}
      >
        <DialogContent className="rounded-2xl p-6 sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-destructive">
              Restaurează datele organizației
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              Toate datele organizației revin la starea din{' '}
              <strong>{restoreTarget ? formatDate(restoreTarget.createdAt) : ''}</strong>.
              Modificările făcute după acest moment se pierd definitiv. Toți utilizatorii vor fi
              delogați.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void restore();
            }}
            className="flex flex-col"
          >
            <Label
              htmlFor="restore-confirm"
              className="text-xs font-semibold text-muted-foreground"
            >
              Scrie {CONFIRM_WORD} pentru a confirma
            </Label>
            <Input
              id="restore-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={restoring}
              autoFocus
              autoComplete="off"
              placeholder={CONFIRM_WORD}
              className="mt-1.5"
            />
            <DialogFooter className="mx-0 mb-0 mt-5 border-0 bg-transparent p-0">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRestoreTarget(null)}
                disabled={restoring}
              >
                Anulează
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={restoring || confirmText !== CONFIRM_WORD}
              >
                {restoring ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Restaurează
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
