'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useParams } from 'next/navigation';
import {
  transfers as transfersApi,
  users as usersApi,
  organization as organizationApi,
} from '@/lib/api';
import type { Transfer, TransferAviz, TransferConformity, User } from '@/lib/types';
import { TransferStatus } from '@/lib/types';
import { transferStatusLabels, transferStatusColors, unitTypeLabels } from '@/lib/constants';
import { StatusBadge } from '@/components/status-badge';
import { BackLink } from '@/components/back-link';
import { ActionTiles, type ActionTile } from '@/components/action-tiles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceListField } from '@/components/choice-list';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  Truck,
  CheckCircle2,
  Ban,
  Loader2,
  Printer,
  FileText,
  PenLine,
  X,
} from 'lucide-react';
import { SignatureDialog } from '@/components/signature-dialog';
import { usePermissions } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { formatQty, formatUnitQty, scaleUnitQty, formatAmount } from '@/lib/utils';
import type { UnitType } from '@horae/shared-types';

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  return format(new Date(value), 'dd MMM yyyy', { locale: ro });
}

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = usePermissions();

  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [userList, setUserList] = useState<User[]>([]);
  const [showTransitDialog, setShowTransitDialog] = useState(false);
  // In-app confirmation for cancelling the transfer (no native confirm()).
  const [cancelOpen, setCancelOpen] = useState(false);
  const [transitUserId, setTransitUserId] = useState('');
  // Org name for the "UNITATEA" header on the printed foaie de parcurs. Best-effort.
  const [orgName, setOrgName] = useState('');

  // Which printable document is currently visible. Only one print-only section is
  // rendered visible for `window.print()` at a time; null = normal (nothing to print).
  const [printDoc, setPrintDoc] = useState<'foaie' | 'aviz' | 'conformitate' | null>(null);
  const [aviz, setAviz] = useState<TransferAviz | null>(null);
  const [avizLoading, setAvizLoading] = useState(false);
  const [conformity, setConformity] = useState<TransferConformity | null>(null);
  // Receipt signature (semnătura de primire) capture + rendering.
  const [signOpen, setSignOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await transfersApi.get(id);
      setTransfer(t);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    usersApi
      .list({ limit: 100, isActive: true })
      .then((res) => setUserList(res.data))
      .catch(() => {});
    organizationApi
      .get()
      .then((o) => o?.name && setOrgName(o.name))
      .catch(() => {});
  }, [load]);

  // Load the receipt signature image (authed blob → object URL) when present, so
  // the printed aviz shows the actual signature. Revoke the URL on change/unmount.
  useEffect(() => {
    if (!transfer?.hasReceiverSignature) {
      setSignatureUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    transfersApi
      .signatureBlob(id)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSignatureUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, transfer?.hasReceiverSignature]);

  const handleSign = async (signature: Blob, receiverName: string) => {
    setSigning(true);
    try {
      const updated = await transfersApi.signAviz(id, { signature, receiverName });
      setTransfer(updated);
      setAviz(null); // force the aviz payload to refetch with the new signature data
      setSignOpen(false);
      toast.success('Primire semnată');
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Eroare la semnare');
    } finally {
      setSigning(false);
    }
  };

  // Fire the browser print dialog once the chosen document is mounted/visible, then
  // reset so the page returns to normal (and a later reprint re-triggers cleanly).
  useEffect(() => {
    if (!printDoc) return;
    if (printDoc === 'aviz' && !aviz) return; // wait for the aviz payload
    if (printDoc === 'conformitate' && !conformity) return;
    const reset = () => setPrintDoc(null);
    // Fallback: if `afterprint` never fires (some engines/headless cases), a
    // safety timer still resets printDoc so the buttons re-enable and a reprint
    // works. afterprint stays the primary reset; both are cleared on cleanup.
    let fallback: number | undefined;
    const timer = window.setTimeout(() => {
      window.print();
      fallback = window.setTimeout(reset, 2000);
    }, 60);
    window.addEventListener('afterprint', reset);
    return () => {
      window.clearTimeout(timer);
      if (fallback !== undefined) window.clearTimeout(fallback);
      window.removeEventListener('afterprint', reset);
    };
  }, [printDoc, aviz, conformity]);

  const handlePrintFoaie = () => setPrintDoc('foaie');

  const handlePrintConformity = async () => {
    setAvizLoading(true);
    try {
      // Serial (CB-...) assigned + persisted server-side on the first call.
      const data = conformity ?? (await transfersApi.conformity(id));
      setConformity(data);
      setPrintDoc('conformitate');
    } catch {
      toast.error('Eroare la generarea declarației de conformitate');
    } finally {
      setAvizLoading(false);
    }
  };

  const handlePrintAviz = async () => {
    setAvizLoading(true);
    try {
      // Serial is assigned + persisted server-side on first call; reprints keep it.
      const data = aviz ?? (await transfersApi.aviz(id));
      setAviz(data);
      setPrintDoc('aviz');
    } catch {
      toast.error('Eroare la generarea avizului');
    } finally {
      setAvizLoading(false);
    }
  };

  const runStatus = async (status: TransferStatus, assignedToId?: string) => {
    setUpdating(true);
    try {
      const updated = await transfersApi.updateStatus(id, { status, assignedToId });
      setTransfer(updated);
      // Status change can alter the aviz/conformity payloads — drop the cached
      // ones so the next print refetches (serials persist server-side).
      setAviz(null);
      setConformity(null);
      toast.success('Transfer actualizat');
    } catch {
      toast.error('Eroare la actualizarea transferului');
    } finally {
      setUpdating(false);
    }
  };

  const handleApproval = async (action: 'approve' | 'reject') => {
    setUpdating(true);
    try {
      const updated = await (action === 'approve'
        ? transfersApi.approve(id)
        : transfersApi.reject(id));
      setTransfer(updated);
      // Status change can alter the aviz/conformity payloads — drop the cached
      // ones so the next print refetches (serials persist server-side).
      setAviz(null);
      setConformity(null);
      toast.success(action === 'approve' ? 'Transfer aprobat' : 'Transfer respins');
    } catch {
      toast.error('Eroare');
    } finally {
      setUpdating(false);
    }
  };

  const handleMarkInTransit = () => {
    if (!transfer) return;
    // A transfer can't teleport — it needs a transporter before going into transit.
    if (transfer.assignedTo) {
      runStatus(TransferStatus.IN_TRANZIT);
    } else {
      setTransitUserId('');
      setShowTransitDialog(true);
    }
  };

  const confirmTransit = () => {
    if (!transitUserId) return;
    setShowTransitDialog(false);
    runStatus(TransferStatus.IN_TRANZIT, transitUserId);
  };

  const handleCancel = () => setCancelOpen(true);

  const confirmCancel = async () => {
    setCancelOpen(false);
    await runStatus(TransferStatus.ANULAT);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (notFound || !transfer) {
    return (
      <div>
        <BackLink href="/stock/transfers" label="Transferuri" />
        <p className="mt-4 text-sm text-muted-foreground">Transferul nu a fost găsit.</p>
      </div>
    );
  }

  const isPending = transfer.status === TransferStatus.IN_ASTEPTARE;
  const isInTransit = transfer.status === TransferStatus.IN_TRANZIT;
  const canManage = can('manage', 'Transfer');
  const canUpdate = can('update', 'Transfer');

  // Page-level status actions — approval + status flow in one tile group
  // (transporter required before IN_TRANZIT; cancel restores stock).
  const statusActions: ActionTile[] = [
    ...(isPending && canManage
      ? [
          {
            key: 'approve',
            label: 'Aprobă',
            icon: Check,
            onClick: () => handleApproval('approve'),
            disabled: updating,
            title: 'Aprobă transferul',
          },
          {
            key: 'reject',
            label: 'Respinge',
            icon: X,
            tone: 'destructive' as const,
            onClick: () => handleApproval('reject'),
            disabled: updating,
            title: 'Respinge transferul',
          },
        ]
      : []),
    ...((isPending || isInTransit) && canUpdate
      ? [
          ...(isPending
            ? [
                {
                  key: 'transit',
                  label: 'Marchează în tranzit',
                  icon: Truck,
                  onClick: handleMarkInTransit,
                  disabled: updating,
                  tutorialId: 'stock.transfers.transit',
                },
              ]
            : []),
          ...(isInTransit
            ? [
                {
                  key: 'finalize',
                  /* Ad-hoc: goods leave stock at delivery (no destination stock). */
                  label: transfer.adhocDestination ? 'Livrat la destinație' : 'Finalizează',
                  icon: CheckCircle2,
                  onClick: () => runStatus(TransferStatus.FINALIZAT),
                  disabled: updating,
                  tutorialId: 'stock.transfers.finalize',
                },
              ]
            : []),
          {
            key: 'cancel',
            label: 'Anulează',
            icon: Ban,
            tone: 'destructive' as const,
            onClick: handleCancel,
            disabled: updating,
            title: 'Anulează transferul',
          },
        ]
      : []),
  ];

  return (
    <div className="max-w-[620px]">
      {/* Back link (design: chevron + parent, accent, 13.5/600) */}
      <BackLink href="/stock/transfers" label="Transferuri" />

      {/* Title + status capsule (design isTransferDetail) */}
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="font-serif text-[26px] font-bold leading-[1.15] tracking-[-0.3px]">
          Transfer #{transfer.id.slice(0, 8)}
        </h1>
        <StatusBadge
          label={transferStatusLabels[transfer.status]}
          colorClass={transferStatusColors[transfer.status]}
        />
        {transfer.adhocDestination && (
          <Badge variant="secondary" className="rounded-full text-[11px]">
            Eveniment
          </Badge>
        )}
      </div>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        {transfer.fromLocationName} → {transfer.toLocationName}
        {transfer.createdByName ? ` · cerut de ${transfer.createdByName}` : ''} ·{' '}
        {format(new Date(transfer.createdAt), 'dd MMM', { locale: ro })}
      </p>

      {/* Status actions — approval + status flow tiles */}
      {statusActions.length > 0 && (
        <div className="mt-3.5">
          <ActionTiles columns={2} actions={statusActions} />
        </div>
      )}

      {/* In-transit banner (design: soft blue strip with truck icon) */}
      {isInTransit && (
        <div className="mt-3.5 flex items-center gap-2.5 rounded-[var(--radius-ctl)] bg-[var(--st-blue-bg)] px-[15px] py-[13px]">
          <Truck className="h-[18px] w-[18px] shrink-0 text-[var(--st-blue)]" />
          <span className="text-[13px]">
            Transfer în tranzit — {transfer.toLocationName} confirmă primirea la destinație.
          </span>
        </div>
      )}

      {/* Items (design: "Articole · N" card with hairline-separated rows) */}
      <div className="mt-3.5 overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
        <div className="px-6 pb-4 pt-5 text-[15px] font-bold">
          Articole · {transfer.items.length}
        </div>
        {transfer.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between border-t border-border px-6 py-[11px] text-[13.5px]"
          >
            <span className="font-semibold">{item.rawMaterialTitle}</span>
            <span className="font-bold">{formatUnitQty(item.quantity, item.unit)}</span>
          </div>
        ))}
      </div>

      {/* Aviz de însoțire + documente (not in the design — styled consistently) */}
      <div className="mt-3.5 overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
        <div className="px-6 pb-4 pt-5 text-[15px] font-bold">Documente</div>
        <div className="border-t border-border px-6 py-3">
          <ActionTiles
            columns={3}
            actions={[
              {
                key: 'foaie',
                label: 'Foaia de parcurs',
                icon: Printer,
                onClick: handlePrintFoaie,
                disabled: avizLoading || printDoc !== null,
                title: 'Printează foaia de parcurs',
              },
              {
                key: 'aviz',
                label: 'Avizul de însoțire',
                icon: avizLoading ? Loader2 : FileText,
                onClick: handlePrintAviz,
                disabled: avizLoading || printDoc !== null,
                title: 'Printează avizul de însoțire a mărfii',
              },
              {
                key: 'conformitate',
                label: 'Declarație de conformitate',
                icon: avizLoading ? Loader2 : FileText,
                onClick: handlePrintConformity,
                disabled: avizLoading || printDoc !== null,
                title: 'Printează declarația de conformitate',
              },
            ]}
          />
        </div>
        {(transfer.hasReceiverSignature ||
          (canUpdate && transfer.status === TransferStatus.FINALIZAT)) && (
          <div className="border-t border-border px-6 py-2.5">
            {transfer.hasReceiverSignature ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-[var(--st-green)]" />
                Primit{transfer.receiverName ? ` de ${transfer.receiverName}` : ''}
                {transfer.receivedAt ? `, ${fmtDate(transfer.receivedAt)}` : ''}
              </span>
            ) : (
              // Receipt signature is only valid once the transfer is delivered (FINALIZAT).
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setSignOpen(true)}
                title="Semnează primirea"
                aria-label="Semnează primirea"
              >
                <PenLine className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Locations */}
      <div className="mt-3.5 overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
        <div className="px-6 pb-4 pt-5 text-[15px] font-bold">Locații</div>
        <div className="space-y-3 border-t border-border px-6 py-4">
          <div className="flex items-start gap-3">
            <ArrowUpRight className="mt-0.5 h-5 w-5 text-[var(--st-orange)]" />
            <div>
              <p className="text-xs text-muted-foreground">De la</p>
              <p className="text-[13.5px] font-medium">{transfer.fromLocationName}</p>
              {transfer.fromLocationAddress && (
                <p className="text-xs text-muted-foreground">{transfer.fromLocationAddress}</p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ArrowDownLeft className="mt-0.5 h-5 w-5 text-[var(--st-green)]" />
            <div>
              <p className="text-xs text-muted-foreground">Către</p>
              <p className="text-[13.5px] font-medium">{transfer.toLocationName}</p>
              {transfer.toLocationAddress && (
                <p className="text-xs text-muted-foreground">{transfer.toLocationAddress}</p>
              )}
              {transfer.destinationContact && (
                <p className="text-xs text-muted-foreground">
                  Destinatar: {transfer.destinationContact}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Meta — krow rows: 13.5px, muted key / value, hairline dividers */}
      <div className="mt-3.5 overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
        <div className="px-6 pb-4 pt-5 text-[15px] font-bold">Informații</div>
        <div className="divide-y divide-border border-t border-border text-[13.5px]">
          <MetaRow label="Creat de" value={transfer.createdByName || '—'} />
          <MetaRow
            label="Transport"
            value={
              transfer.assignedTo
                ? `${transfer.assignedTo.firstName} ${transfer.assignedTo.lastName}`
                : 'Neasignat'
            }
          />
          <MetaRow label="Data creare" value={fmtDate(transfer.createdAt)} />
          {transfer.completedAt && (
            <MetaRow label="Finalizat" value={fmtDate(transfer.completedAt)} />
          )}
          {transfer.notes && <MetaRow label="Note" value={transfer.notes} />}
        </div>
      </div>

      {/* Transporter picker for mark-in-transit */}
      <Dialog open={showTransitDialog} onOpenChange={setShowTransitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignează transport</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Persoană transport *</Label>
            {userList.length <= 10 ? (
              <ChoiceChips
                label="Persoană transport"
                value={transitUserId}
                onChange={(v) => v && setTransitUserId(v)}
                options={userList.map((u) => ({
                  value: u.id,
                  label: `${u.firstName} ${u.lastName}`,
                }))}
              />
            ) : (
              <ChoiceListField
                title="Alege persoana"
                aria-label="Persoană transport"
                placeholder="Selectează persoana"
                searchPlaceholder="Caută persoana…"
                value={transitUserId}
                onChange={(v) => setTransitUserId(v)}
                options={userList.map((u) => ({
                  value: u.id,
                  label: `${u.firstName} ${u.lastName}`,
                }))}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Un transfer nu poate intra în tranzit fără o persoană care îl transportă.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowTransitDialog(false)}
              title="Anulează"
              aria-label="Anulează"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              onClick={confirmTransit}
              disabled={!transitUserId || updating}
              title="Pune în tranzit"
              aria-label="Pune în tranzit"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Truck className="h-4 w-4" />
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Printable legal foaie de parcurs (A4) — only visible while chosen for print */}
      <FoaieDeParcurs transfer={transfer} orgName={orgName} active={printDoc === 'foaie'} />

      {/* Printable legal aviz de însoțire a mărfii (A4) — only visible while chosen */}
      {aviz && (
        <AvizTransfer aviz={aviz} active={printDoc === 'aviz'} signatureUrl={signatureUrl} />
      )}

      {/* Printable declarație de conformitate (A4) — only visible while chosen */}
      {conformity && (
        <DeclaratieConformitate data={conformity} active={printDoc === 'conformitate'} />
      )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Anulezi acest transfer?"
        description="Stocul se întoarce la locația sursă."
        confirmLabel="Anulează transferul"
        cancelLabel="Păstrează transferul"
        tone="danger"
        busy={updating}
        onConfirm={confirmCancel}
      />

      {/* Receipt signature capture (semnătura de primire) */}
      <SignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        onConfirm={handleSign}
        submitting={signing}
      />
    </div>
  );
}

// krow (design): muted key left / value right, px-6 py-[11px], dividers via parent.
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-6 py-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

// ---------- Printable legal "Foaie de parcurs" (Romanian standard template) ----------

const FP_CELL: CSSProperties = { border: '0.75px solid #000', padding: '2px 4px', fontSize: 11 };
const FP_EMPTY_ROW_H = 22;

function FpBox({
  label,
  children,
  style,
}: {
  label: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ border: '0.75px solid #000', padding: '3px 6px', ...style }}>
      <div style={{ fontSize: 10, fontWeight: 700 }}>{label}</div>
      <div style={{ minHeight: 22, fontSize: 11 }}>{children}</div>
    </div>
  );
}

function FoaieDeParcurs({
  transfer,
  orgName,
  active,
}: {
  transfer: Transfer;
  orgName: string;
  active: boolean;
}) {
  const dataCreare = transfer.createdAt
    ? new Date(transfer.createdAt).toLocaleDateString('ro-RO')
    : '';
  const soferName = transfer.assignedTo
    ? `${transfer.assignedTo.firstName} ${transfer.assignedTo.lastName}`
    : '';
  const nrAct = `TR-${transfer.id.slice(0, 8)}`;
  const observatii = `${transfer.items.length} produse`;
  const emptyRows = Array.from({ length: 14 });

  return (
    <>
      {/* Show-rule only emitted while this doc is the active one, so the aviz stays hidden. */}
      {active && (
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #foaie-print, #foaie-print * { visibility: visible !important; }
            #foaie-print {
              position: absolute; inset: 0; display: block !important;
              margin: 0; padding: 24px;
            }
            #foaie-print table { page-break-inside: avoid; }
          }
        `}</style>
      )}
      <div
        id="foaie-print"
        className="hidden bg-white text-black"
        style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11, lineHeight: 1.35 }}
      >
        {/* Header: unitatea + title */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11 }}>UNITATEA </span>
          <span style={{ fontWeight: 700 }}>{orgName || '________________________'}</span>
        </div>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            textAlign: 'center',
            letterSpacing: 1,
            margin: '0 0 12px',
          }}
        >
          FOAIE DE PARCURS
        </h1>

        {/* Tip autovehicul + combustibil */}
        <div style={{ display: 'flex', gap: 32, marginBottom: 4 }}>
          <span>
            <strong>Tip autovehicul:</strong> Persoane <span style={{ fontSize: 14 }}>☐</span>
            &nbsp;&nbsp;&nbsp;Mărfuri <span style={{ fontSize: 14 }}>☐</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 32, marginBottom: 10 }}>
          <span>
            <strong>Tip combustibil:</strong> Benzină <span style={{ fontSize: 14 }}>☐</span>
            &nbsp;&nbsp;&nbsp;Motorină <span style={{ fontSize: 14 }}>☐</span>
          </span>
        </div>

        {/* Info strip */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={{ ...FP_CELL, width: '33%' }}>
                <strong>Data:</strong> {dataCreare}
              </td>
              <td style={{ ...FP_CELL, width: '33%' }}>
                <strong>Nr. auto:</strong>
              </td>
              <td style={FP_CELL}>
                <strong>Nume șofer:</strong> {soferName}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Main table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={{ ...FP_CELL, fontWeight: 700 }} colSpan={2}>
                Plecare
              </th>
              <th style={{ ...FP_CELL, fontWeight: 700 }} colSpan={2}>
                Sosire
              </th>
              <th style={{ ...FP_CELL, fontWeight: 700, width: '8%' }} rowSpan={2}>
                Km
              </th>
              <th style={{ ...FP_CELL, fontWeight: 700, width: '18%' }} rowSpan={2}>
                Nr. act de însoțire
              </th>
              <th style={{ ...FP_CELL, fontWeight: 700, width: '16%' }} rowSpan={2}>
                Observații
              </th>
            </tr>
            <tr>
              <th style={{ ...FP_CELL, fontWeight: 700 }}>Locul</th>
              <th style={{ ...FP_CELL, fontWeight: 700, width: '8%' }}>Ora</th>
              <th style={{ ...FP_CELL, fontWeight: 700 }}>Locul</th>
              <th style={{ ...FP_CELL, fontWeight: 700, width: '8%' }}>Ora</th>
            </tr>
          </thead>
          <tbody>
            {/* First row prefilled from the transfer */}
            <tr style={{ height: FP_EMPTY_ROW_H }}>
              <td style={FP_CELL}>{transfer.fromLocationName}</td>
              <td style={FP_CELL} />
              <td style={FP_CELL}>{transfer.toLocationName}</td>
              <td style={FP_CELL} />
              <td style={FP_CELL} />
              <td style={FP_CELL}>{nrAct}</td>
              <td style={FP_CELL}>{observatii}</td>
            </tr>
            {emptyRows.map((_, i) => (
              <tr key={i} style={{ height: FP_EMPTY_ROW_H }}>
                <td style={FP_CELL} />
                <td style={FP_CELL} />
                <td style={FP_CELL} />
                <td style={FP_CELL} />
                <td style={FP_CELL} />
                <td style={FP_CELL} />
                <td style={FP_CELL} />
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer boxes */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <FpBox label="Consum specific" />
            <FpBox label="Consum specific" />
          </div>
          <FpBox label="TOTAL KM" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <FpBox label="Din care: în oraș" />
            <FpBox label="Din care: în exterior" />
          </div>
        </div>

        <p style={{ margin: '0 0 24px' }}>
          <strong>Calculație</strong> ______________ (Nr. de km x 10 &nbsp;&nbsp; consum specific x
          preț combustibil)
        </p>

        {/* Signatures */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
          <span>Calculat,</span>
          <span>Șofer,</span>
        </div>
      </div>
    </>
  );
}

// ---------- Printable legal "Aviz de însoțire a mărfii" (bon de transfer între gestiuni) ----------

const AV_CELL: CSSProperties = {
  border: '0.75px solid #000',
  padding: '3px 6px',
  fontSize: 11,
  verticalAlign: 'top',
};
const AV_TH: CSSProperties = { ...AV_CELL, fontWeight: 700, textAlign: 'center' };
const BLANK_LINE = '________________________';

/**
 * Declarație de conformitate — printable A4, faithful to the company's paper
 * model: letterhead with the full legal identity, CB serial, the standard
 * declaration text (R852/2004/CE etc.), delivered goods list and the
 * administrator signature block.
 */
function DeclaratieConformitate({ data, active }: { data: TransferConformity; active: boolean }) {
  const issued = new Date(data.issuedAt).toLocaleDateString('ro-RO');
  const delivery = new Date(data.deliveryDate).toLocaleDateString('ro-RO');
  const org = data.organization;

  return (
    <>
      {active && (
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #conformitate-print, #conformitate-print * { visibility: visible !important; }
            #conformitate-print { display: block !important; position: absolute; inset: 0; }
          }
        `}</style>
      )}
      <div id="conformitate-print" className="hidden bg-white p-10 text-[12px] text-black">
        <div className="leading-5">
          <p className="font-bold text-[14px]">{org.name}</p>
          {org.legalAddress && <p>{org.legalAddress}</p>}
          {org.contactPhone && <p>Tel. {org.contactPhone}</p>}
          {org.contactEmail && <p>{org.contactEmail}</p>}
          {org.website && <p>{org.website}</p>}
          {org.cui && <p>CUI: {org.cui}</p>}
          {org.regCom && <p>REG COM. {org.regCom}</p>}
        </div>

        <h1 className="mt-8 text-center text-[16px] font-bold tracking-wide">
          DECLARAȚIE DE CONFORMITATE
        </h1>
        <p className="mt-1 text-center">
          NR. {data.serial} DIN DATA {issued}
        </p>

        <p className="mt-6 text-justify leading-6">
          Prin prezenta declarație de conformitate noi {org.name}, declarăm pe proprie răspundere că
          produsele livrate către <b>{data.deliveredTo}</b> în data de <b>{delivery}</b>, nu pun în
          pericol viața, sănătatea, siguranța alimentară, securitatea muncii și protecția mediului
          și sunt în conformitate cu legislația sanitară, sanitar-veterinară și pentru siguranța
          alimentelor în vigoare, întrunind toate condițiile și normele legale de producere,
          comercializare și consum, cu respectarea R852/2004/CE, R853/2004/CE, R 2073/2005/CE și
          expiră după caz: 8 ore după livrare la maxim 20°C, respectiv 48 de ore la temperaturi de
          4°C.
        </p>
        <p className="mt-3 text-justify leading-6">
          Garantăm calitatea produselor pe timpul termenului de valabilitate cu condiția respectării
          condițiilor de depozitare. Nu ne asumăm nicio responsabilitate în cazul depozitării în
          condiții neconforme.
        </p>

        <div className="mt-5">
          <p className="font-semibold">Produse livrate:</p>
          <ul className="mt-1 list-disc pl-5 leading-6">
            {data.items.map((item, i) => (
              <li key={i}>
                {item.name} — {formatUnitQty(item.quantity, item.unit)}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-14 flex items-end justify-between">
          <div>
            <p className="font-semibold">
              Administrator: {org.administratorName ?? '____________________'}
            </p>
          </div>
          <div className="text-center">
            <p>Semnătura</p>
            <p className="mt-8">____________________</p>
          </div>
        </div>
      </div>
    </>
  );
}

function AvPartyBox({ title, party }: { title: string; party: TransferAviz['supplier'] }) {
  return (
    <div style={{ border: '0.75px solid #000', padding: '6px 8px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11, lineHeight: 1.5 }}>
        <div>
          <strong>Denumire:</strong> {party.name}
        </div>
        <div>
          <strong>Punct de lucru:</strong> {party.locationName}
        </div>
        <div>
          <strong>Adresa:</strong> {party.address || BLANK_LINE}
        </div>
        <div>
          <strong>CUI:</strong> {party.cui || BLANK_LINE}
        </div>
      </div>
    </div>
  );
}

function AvizTransfer({
  aviz,
  active,
  signatureUrl,
}: {
  aviz: TransferAviz;
  active: boolean;
  signatureUrl?: string | null;
}) {
  const dataEmiterii = aviz.issuedAt ? new Date(aviz.issuedAt).toLocaleDateString('ro-RO') : '';

  // Value per line only when the unit price is known; TOTAL sums the known ones.
  // Cantitatea se tipărește scalată la unitatea lizibilă (100000 mg → 100 g);
  // prețul unitar se rescalează invers, ca pe hârtie Cantitate × Preț unitar
  // să dea în continuare Valoarea.
  const rows = aviz.items.map((item, i) => {
    const hasPrice = item.unitPrice != null;
    const value = hasPrice ? item.unitPrice! * item.quantity : null;
    const scaled = scaleUnitQty(item.quantity, item.unit);
    const unitPrice =
      hasPrice && scaled.value !== 0 ? value! / scaled.value : (item.unitPrice ?? null);
    return { i, item, hasPrice, value, scaled, unitPrice };
  });
  const knownValues = rows.filter((r) => r.value != null);
  const anyKnown = knownValues.length > 0;
  const totalKnown = knownValues.reduce((sum, r) => sum + (r.value ?? 0), 0);

  return (
    <>
      {/* Show-rule only emitted while this doc is the active one, so the foaie stays hidden. */}
      {active && (
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #aviz-transfer-print, #aviz-transfer-print * { visibility: visible !important; }
            #aviz-transfer-print {
              position: absolute; inset: 0; display: block !important;
              margin: 0; padding: 24px;
            }
            #aviz-transfer-print table { page-break-inside: avoid; }
          }
        `}</style>
      )}
      <div
        id="aviz-transfer-print"
        className="hidden bg-white text-black"
        style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11, lineHeight: 1.35 }}
      >
        {/* Title */}
        <h1
          style={{
            fontSize: 18,
            fontWeight: 700,
            textAlign: 'center',
            letterSpacing: 1,
            margin: '0 0 2px',
          }}
        >
          AVIZ DE ÎNSOȚIRE A MĂRFII
        </h1>
        <p style={{ textAlign: 'center', fontSize: 11, margin: '0 0 12px' }}>
          (bon de transfer între gestiuni)
        </p>

        {/* Serial + issue date */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span>
            <strong>Seria și nr.:</strong> {aviz.serial}
          </span>
          <span>
            <strong>Data emiterii:</strong> {dataEmiterii}
          </span>
        </div>

        {/* Furnizor / Cumpărător */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <AvPartyBox title="FURNIZOR" party={aviz.supplier} />
          <AvPartyBox title="CUMPĂRĂTOR" party={aviz.buyer} />
        </div>

        {/* Goods */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={{ ...AV_TH, width: '6%' }}>Nr. crt</th>
              <th style={{ ...AV_TH, textAlign: 'left' }}>Denumirea bunurilor</th>
              <th style={{ ...AV_TH, width: '13%' }}>Cantitate</th>
              <th style={{ ...AV_TH, width: '8%' }}>U.M.</th>
              <th style={{ ...AV_TH, width: '16%' }}>Preț unitar (lei)</th>
              <th style={{ ...AV_TH, width: '16%' }}>Valoare (lei)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ i, item, hasPrice, value, scaled, unitPrice }) => (
              <tr key={i}>
                <td style={{ ...AV_CELL, textAlign: 'center' }}>{i + 1}</td>
                <td style={AV_CELL}>{item.name}</td>
                <td style={{ ...AV_CELL, textAlign: 'right' }}>{formatQty(scaled.value)}</td>
                <td style={{ ...AV_CELL, textAlign: 'center' }}>
                  {unitTypeLabels[scaled.unit as UnitType] || scaled.unitLabel || item.unit}
                </td>
                <td style={{ ...AV_CELL, textAlign: 'right' }}>
                  {hasPrice && unitPrice != null ? formatAmount(unitPrice) : ''}
                </td>
                <td style={{ ...AV_CELL, textAlign: 'right' }}>
                  {value != null ? formatAmount(value) : ''}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...AV_CELL, fontWeight: 700, textAlign: 'right' }} colSpan={5}>
                TOTAL
              </td>
              <td style={{ ...AV_CELL, fontWeight: 700, textAlign: 'right' }}>
                {anyKnown ? formatAmount(totalKnown) : ''}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Expedition data */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Date privind expediția:</div>
          <div style={{ lineHeight: 1.7 }}>
            <div>Numele delegatului: {aviz.delegateName || BLANK_LINE}</div>
            <div>Destinatar (primește marfa): {aviz.recipientName || BLANK_LINE}</div>
            <div>Seria și nr. CI/buletin: {aviz.delegateIdCard || BLANK_LINE}</div>
            <div>Mijloc de transport: {aviz.transportMeans || BLANK_LINE}</div>
            <div>
              {/* Document fiscal — formularul standard cere si ORA expeditiei. */}
              Data și ora expedierii:{' '}
              {aviz.dispatchedAt
                ? new Date(aviz.dispatchedAt).toLocaleString('ro-RO', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                : BLANK_LINE}
            </div>
          </div>
        </div>

        {/* Receipt footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
          <span>
            Data primirii în gestiune:{' '}
            {aviz.receivedAt ? new Date(aviz.receivedAt).toLocaleDateString('ro-RO') : BLANK_LINE}
          </span>
          <span style={{ textAlign: 'right' }}>
            <div>Semnătura gestionarului primitor:</div>
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signatureUrl}
                alt="Semnătură primire"
                style={{ height: 56, maxWidth: 220, objectFit: 'contain' }}
              />
            ) : (
              <div>{aviz.receiverName || BLANK_LINE}</div>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
