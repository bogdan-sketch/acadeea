'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  orders as ordersApi,
  recipes as recipesApi,
  organization as organizationApi,
} from '@/lib/api';
import type { Order, Organization, Recipe } from '@/lib/types';
import { OrderStatus } from '@/lib/types';
import { RecipeType, UnitType } from '@horae/shared-types';
import { orderStatusLabels, wooStatusLabels } from '@/lib/constants';
import { SignatureDialog } from '@/components/signature-dialog';
import { Hint } from '@/components/hint';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { hasTimeOfDay } from '@/components/time-of-day';
import { IconAction } from '../../stock/_ui/parts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronLeft,
  CircleX,
  FileText,
  Loader2,
  Upload,
  Download,
  Trash2,
  Receipt,
  Plus,
  PenLine,
  Printer,
  Ban,
} from 'lucide-react';
import { usePermissions } from '@/contexts/auth-context';
import { useWooDeliveryEnabled } from '@/hooks/use-woo-delivery';
import { deliveryMethodLabel, useDeliveryMethods } from '../orders-area';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { formatUnitQty } from '@/lib/utils';
import { locations as locationsApi, transfers as transfersApi } from '@/lib/api';
import {
  deliveryPointLabel,
  isSiteOrder,
  orderCustomer,
  orderNumberMeta,
  orderTitle,
  termLabel,
  whenLabel,
} from '../order-ui';

// Full order status machine (mirrors the backend VALID_TRANSITIONS map).
const allowedOrderTransitions: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.NOUA]: [OrderStatus.IN_PREGATIRE, OrderStatus.ANULATA],
  [OrderStatus.IN_PREGATIRE]: [OrderStatus.PREGATITA, OrderStatus.ANULATA],
  [OrderStatus.PREGATITA]: [OrderStatus.IN_TRANZIT, OrderStatus.ANULATA],
  [OrderStatus.IN_TRANZIT]: [OrderStatus.LIVRATA],
  [OrderStatus.LIVRATA]: [],
  [OrderStatus.ANULATA]: [],
};

// Items can only be added/removed while the order is still editable.
const EDITABLE_ITEM_STATUSES: OrderStatus[] = [OrderStatus.NOUA, OrderStatus.IN_PREGATIRE];

// Stepper steps (Anulată is a separate state, not a step).
const STEPS: OrderStatus[] = [
  OrderStatus.NOUA,
  OrderStatus.IN_PREGATIRE,
  OrderStatus.PREGATITA,
  OrderStatus.IN_TRANZIT,
  OrderStatus.LIVRATA,
];

type Availability = Record<string, { locationName: string; quantity: number; unit: string }[]>;

/** Header action in the red tint — same 42px/word/Hint shell as IconAction. */
function DangerAction({
  icon: Icon,
  word,
  label,
  title,
  onClick,
  disabled,
}: {
  icon: typeof Ban;
  word: string;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Hint label={label} detail={title}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className="inline-flex h-[42px] flex-none cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-ctl)] border border-[var(--st-red)]/30 bg-[var(--st-red-bg)] pl-3 pr-3.5 text-[13px] font-semibold text-[var(--st-red)] transition-colors hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <Icon className="h-[18px] w-[18px]" />
        <span>{word}</span>
      </button>
    </Hint>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = usePermissions();
  // Shop delivery-method short names (only with the woo-delivery switch on).
  const deliveryMethods = useDeliveryMethods(useWooDeliveryEnabled()).list;
  const [order, setOrder] = useState<Order | null>(null);
  // Furnizor details for the printed legal aviz. Best-effort — never blocks the view.
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const { ask, dialog } = useConfirmDialog();

  // Add-item dialog
  const [addOpen, setAddOpen] = useState(false);
  const [finalRecipes, setFinalRecipes] = useState<Recipe[]>([]);
  const [addRecipeId, setAddRecipeId] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addUnit, setAddUnit] = useState<UnitType>(UnitType.BUCATI);
  const [addingItem, setAddingItem] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

  // Signature dialog
  const [signOpen, setSignOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  // Design flow: "Confirmă livrarea" signs the foaie de livrare, then marks LIVRATA.
  const [deliverAfterSign, setDeliverAfterSign] = useState(false);

  useEffect(() => {
    ordersApi
      .get(id)
      .then(setOrder)
      .catch(() => toast.error('Nu s-a putut încărca comanda'))
      .finally(() => setLoading(false));
    organizationApi
      .get()
      .then(setOrg)
      .catch(() => {});
  }, [id]);

  // "De unde": finished-product stock per location (best-effort; unknown = "—").
  useEffect(() => {
    if (!order?.items?.some((i) => i.recipeId)) return;
    let cancelled = false;
    locationsApi
      .myLocations()
      .then(async (locs) => {
        const per = await Promise.all(
          locs.map((l) =>
            transfersApi
              .recipeStock(l.id)
              .then((rows) => rows.map((r) => ({ ...r, locationName: l.name })))
              .catch(() => []),
          ),
        );
        if (cancelled) return;
        const map: Availability = {};
        for (const r of per.flat()) {
          (map[r.recipeId] ??= []).push({
            locationName: r.locationName,
            quantity: r.quantity - (r.reservedCount ?? 0),
            unit: r.unit,
          });
        }
        setAvailability(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [order?.id, order?.items]);

  const changeStatus = async (next: OrderStatus) => {
    if (next === OrderStatus.ANULATA) {
      const ok = await ask({
        title: 'Anulezi comanda?',
        description:
          'Comanda trece în „Anulată”: stocul rezervat revine, iar taskurile de producție legate rămân așa cum sunt.',
        confirmLabel: 'Anulează comanda',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setUpdating(true);
    try {
      const updated = await ordersApi.update(id, { status: next });
      setOrder(updated);
      toast.success(
        next === OrderStatus.ANULATA
          ? 'Comandă anulată'
          : `Comandă mutată la ${orderStatusLabels[next]}`,
      );
    } catch {
      toast.error('Actualizarea a eșuat');
    } finally {
      setUpdating(false);
    }
  };

  const openAddItem = async () => {
    setAddOpen(true);
    if (finalRecipes.length === 0) {
      try {
        const r = await recipesApi.list({ type: RecipeType.FINAL, limit: 200 });
        setFinalRecipes(r.data);
      } catch {
        //
      }
    }
  };

  // Client-side mirror of the API rule (quantity ≥ 0.01) so the button and
  // the reason are visible before the request (QA m6).
  const addQtyNum = parseFloat(addQty);
  const addQtyError = !Number.isFinite(addQtyNum)
    ? 'Scrie o cantitate.'
    : addQtyNum < 0.01
      ? 'Cantitatea trebuie să fie cel puțin 0,01.'
      : null;

  const submitAddItem = async () => {
    if (!addRecipeId || addQtyError) return;
    setAddingItem(true);
    try {
      const updated = await ordersApi.addItem(id, {
        recipeId: addRecipeId,
        quantity: addQtyNum,
        unit: addUnit,
      });
      setOrder(updated);
      toast.success('Produs adăugat');
      setAddOpen(false);
      setAddRecipeId('');
      setAddQty('1');
      setAddUnit(UnitType.BUCATI);
    } catch {
      toast.error('Eroare la adăugarea produsului');
    } finally {
      setAddingItem(false);
    }
  };

  const removeItem = async (itemId: string) => {
    const last = (order?.items?.length ?? 0) <= 1;
    const ok = await ask(
      last
        ? {
            title: 'E singurul produs din comandă',
            description:
              'Fără el comanda rămâne goală, dar activă. Dacă nu mai e nevoie de ea, mai bine anulează comanda.',
            confirmLabel: 'Elimină oricum',
            tone: 'danger',
          }
        : {
            title: 'Elimini produsul din comandă?',
            description: 'Rezervarea de stoc pentru el se eliberează.',
            confirmLabel: 'Elimină',
            tone: 'danger',
          },
    );
    if (!ok) return;
    setRemovingItemId(itemId);
    try {
      const updated = await ordersApi.deleteItem(id, itemId);
      setOrder(updated);
      toast.success('Produs eliminat');
    } catch {
      toast.error('Eroare la eliminarea produsului');
    } finally {
      setRemovingItemId(null);
    }
  };

  const generateNote = async () => {
    setCreatingNote(true);
    try {
      const updated = await ordersApi.createDeliveryNote(id);
      setOrder(updated);
      toast.success('Aviz de livrare creat');
    } catch {
      toast.error('Eroare la creare aviz');
    } finally {
      setCreatingNote(false);
    }
  };

  const signNote = async (signature: Blob, signedByName: string) => {
    setSigning(true);
    try {
      const updated = await ordersApi.signDeliveryNote(id, { signature, signedByName });
      setOrder(updated);
      toast.success('Aviz semnat');
      setSignOpen(false);
      if (deliverAfterSign) {
        setDeliverAfterSign(false);
        await changeStatus(OrderStatus.LIVRATA);
      }
    } catch {
      toast.error('Eroare la semnare');
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!order) return <p className="text-muted-foreground">Comanda nu a fost găsită.</p>;

  const transitions = allowedOrderTransitions[order.status] ?? [];
  const canEditItems = can('update', 'Order') && EDITABLE_ITEM_STATUSES.includes(order.status);
  const note = order.deliveryNote;
  const signatureSrc = note?.signatureImageBase64
    ? `data:image/png;base64,${note.signatureImageBase64}`
    : null;

  // Design: confirming delivery captures the signature first, then marks LIVRATA.
  const handleTransition = (next: OrderStatus) => {
    if (
      next === OrderStatus.LIVRATA &&
      note &&
      !note.hasSignature &&
      can('manage', 'DeliveryNote')
    ) {
      setDeliverAfterSign(true);
      setSignOpen(true);
      return;
    }
    changeStatus(next);
  };

  const downloadInvoice = () => {
    const url = ordersApi.downloadInvoice(id);
    const token = localStorage.getItem('accessToken');
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = order.invoiceFileName || 'factura';
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const removeInvoice = async () => {
    try {
      const updated = await ordersApi.deleteInvoice(id);
      setOrder(updated);
      toast.success('Factură ștearsă');
    } catch {
      toast.error('Eroare la ștergere');
    }
  };

  const toggleArchive = async () => {
    const archiving = !order?.isArchived;
    if (archiving) {
      const ok = await ask({
        title: 'Arhivezi comanda?',
        description:
          'Nu va mai apărea în liste, statistici sau calendar. O regăsești sub „Arhivate”.',
        confirmLabel: 'Arhivează',
      });
      if (!ok) return;
    }
    try {
      const updated = await ordersApi.setArchived(id, archiving);
      setOrder(updated);
      toast.success(archiving ? 'Comandă arhivată' : 'Comandă restaurată');
    } catch {
      toast.error('Eroare la arhivare');
    }
  };

  const canUpdateOrder = can('update', 'Order');
  const canAviz = can('manage', 'DeliveryNote');
  const closedOrder = order.status === OrderStatus.LIVRATA || order.status === OrderStatus.ANULATA;
  const cancelled = order.status === OrderStatus.ANULATA;

  const saveNotes = async () => {
    if (notesDraft === null) return;
    setSavingNotes(true);
    try {
      const updated = await ordersApi.update(id, { notes: notesDraft });
      setOrder(updated);
      setNotesDraft(null);
      toast.success('Notă salvată');
    } catch {
      toast.error('Nu s-a putut salva nota');
    } finally {
      setSavingNotes(false);
    }
  };

  const isSite = isSiteOrder(order);
  const eyebrow = isSite
    ? `Site · WooCommerce · plasată ${whenLabel(order.createdAt)}`
    : `Manuală · creată ${whenLabel(order.createdAt)}`;
  const titleClient = orderCustomer(order);
  const term = order.dueDate ? termLabel(order.dueDate) : null;
  const itemCount = order.items?.length ?? 0;
  const subParts = [
    term ? `${order.deliveryAddress ? 'Livrare' : 'Termen'} ${term.text}` : null,
    order.deliveryAddress,
    `${itemCount} ${itemCount === 1 ? 'produs' : 'produse'}`,
    order.assignedTo ? `${order.assignedTo.firstName} ${order.assignedTo.lastName}` : null,
  ].filter(Boolean);

  const currentStepIdx = STEPS.indexOf(order.status);
  const stepWhen = (step: OrderStatus, idx: number): string => {
    if (step === OrderStatus.NOUA) return whenLabel(order.createdAt);
    if (idx === currentStepIdx) return whenLabel(order.updatedAt);
    return '';
  };

  // Istoric: the API exposes no event log, only timestamps on the order/aviz.
  const history: { text: string; when: string; at: number; tone: string }[] = [
    {
      text: isSite
        ? `Comandă primită de pe site (WooCommerce)${
            order.externalStatus
              ? `, status „${wooStatusLabels[order.externalStatus] ?? order.externalStatus}”`
              : ''
          }`
        : 'Comandă creată manual',
      when: whenLabel(order.createdAt),
      at: new Date(order.createdAt).getTime(),
      tone: 'bg-[var(--st-green)]',
    },
    ...(new Date(order.updatedAt).getTime() - new Date(order.createdAt).getTime() > 60_000
      ? [
          {
            text: `Ultima modificare — status „${orderStatusLabels[order.status]}”`,
            when: whenLabel(order.updatedAt),
            at: new Date(order.updatedAt).getTime(),
            tone: 'bg-primary',
          },
        ]
      : []),
    ...(note
      ? [
          {
            text: `Aviz de livrare generat${note.serialNumber ? ` (${note.serialNumber})` : ''}`,
            when: whenLabel(note.generatedAt),
            at: new Date(note.generatedAt).getTime(),
            tone: 'bg-[var(--st-blue)]',
          },
        ]
      : []),
    ...(note?.signedAt
      ? [
          {
            text: `Aviz semnat${note.signedByName ? ` de ${note.signedByName}` : ''}`,
            when: whenLabel(note.signedAt),
            at: new Date(note.signedAt).getTime(),
            tone: 'bg-[var(--st-green)]',
          },
        ]
      : []),
  ].sort((x, y) => y.at - x.at);

  const sourcePill = (it: Order['items'][number]) => {
    if (!availability || !it.recipeId) return null;
    const lots = availability[it.recipeId] ?? [];
    const hit = lots.find((l) => l.unit === it.unit && l.quantity >= it.quantity);
    return hit ? `Din stoc · ${hit.locationName}` : 'Producție';
  };

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/orders"
        className="inline-flex items-center gap-0.5 self-start text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronLeft className="h-[17px] w-[17px]" />
        Comenzi
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-primary">{eyebrow}</span>
          <h1 className="font-serif text-[34px] font-semibold leading-[1.05] tracking-[-0.4px]">
            {orderTitle(order)}
          </h1>
          <span className="text-[15px] font-semibold">
            {titleClient}
            <span className="text-xs font-medium text-muted-foreground">
              {titleClient ? ' · ' : ''}
              {orderNumberMeta(order)}
            </span>
          </span>
          <span className="text-sm text-muted-foreground">{subParts.join(' · ')}</span>
        </div>
        <TutorialAnchor id="orders.create.status">
          <div className="flex flex-wrap items-center gap-2.5">
            {canAviz && (
              <IconAction
                icon={note ? Printer : FileText}
                word="Aviz"
                label={note ? 'Aviz de livrare PDF' : 'Generează aviz de livrare'}
                title={
                  note
                    ? 'Aviz de livrare (PDF) — printează sau salvează ca PDF'
                    : 'Generează avizul de livrare'
                }
                onClick={() => (note ? window.print() : generateNote())}
                disabled={creatingNote}
                spinning={creatingNote}
              />
            )}
            {canAviz && note && !note.hasSignature && (
              <span data-tutorial-id="orders.create.deliveryNote">
                <IconAction
                  icon={PenLine}
                  word="Semnătură"
                  label="Semnătură la predare"
                  title="Semnătură la predare (pe tabletă sau telefon)"
                  onClick={() => setSignOpen(true)}
                />
              </span>
            )}
            {canUpdateOrder && (order.isArchived || closedOrder) && (
              <IconAction
                icon={order.isArchived ? ArchiveRestore : Archive}
                word={order.isArchived ? 'Restaurează' : 'Arhivează'}
                label={order.isArchived ? 'Restaurează comanda' : 'Arhivează comanda'}
                title={
                  order.isArchived
                    ? 'Scoate comanda din arhivă'
                    : 'Ascunde comanda din liste, statistici și calendar'
                }
                onClick={toggleArchive}
                disabled={updating}
              />
            )}
            {canUpdateOrder &&
              (order.hasInvoice ? (
                <>
                  <IconAction
                    icon={Download}
                    word="Factură"
                    label="Descarcă factura"
                    title="Descarcă factura atașată"
                    onClick={downloadInvoice}
                  />
                  <DangerAction
                    icon={Trash2}
                    word="Șterge"
                    label="Șterge factura"
                    title="Șterge factura atașată"
                    onClick={removeInvoice}
                  />
                </>
              ) : (
                <IconAction
                  icon={Upload}
                  word="Factură"
                  label="Încarcă factură"
                  title="Încarcă factura (PDF, JPG sau PNG)"
                  onClick={() => invoiceRef.current?.click()}
                  disabled={uploadingInvoice}
                  spinning={uploadingInvoice}
                />
              ))}
            {canUpdateOrder && transitions.includes(OrderStatus.ANULATA) && (
              <DangerAction
                icon={Ban}
                word="Anulează"
                label="Anulează comanda"
                title="Anulează comanda — stocul rezervat revine"
                onClick={() => changeStatus(OrderStatus.ANULATA)}
                disabled={updating}
              />
            )}
          </div>
        </TutorialAnchor>
      </header>

      {cancelled && (
        <div className="inline-flex items-center gap-2 self-start rounded-full bg-[var(--st-red-bg)] px-3 py-1 text-[13px] font-bold text-[var(--st-red)]">
          <CircleX className="size-4" />
          Comandă anulată · {whenLabel(order.updatedAt)}
        </div>
      )}

      <ol aria-label="Stare comandă" className="m-0 flex list-none flex-wrap gap-1.5 p-0 py-1">
        {STEPS.map((step, idx) => {
          const done = !cancelled && idx < currentStepIdx;
          const cur = !cancelled && idx === currentStepIdx;
          const reachable = canUpdateOrder && !updating && transitions.includes(step);
          const label = orderStatusLabels[step];
          const when = stepWhen(step, idx);
          return (
            <li key={step} className="min-w-0 flex-[1_1_140px]">
              <button
                type="button"
                aria-current={cur ? 'step' : undefined}
                disabled={!reachable}
                onClick={() => handleTransition(step)}
                title={
                  reachable
                    ? `Trece comanda în „${label}”`
                    : cur
                      ? `Starea curentă: ${label}`
                      : done
                        ? `${label} — etapă încheiată`
                        : `Etapele se parcurg în ordine`
                }
                className={`flex w-full flex-col gap-2 rounded-[var(--radius-ctl)] border px-3 pb-2.5 pt-2 text-left text-[13px] font-bold disabled:cursor-default ${
                  cur ? 'border-primary bg-accent' : 'border-border bg-card'
                } ${done || cur ? 'text-foreground' : 'text-muted-foreground'} ${
                  reachable ? 'cursor-pointer hover:bg-muted' : ''
                }`}
              >
                <span
                  className={`block h-1 w-full rounded-full ${
                    done ? 'bg-[var(--st-green)]' : cur ? 'bg-primary' : 'bg-muted'
                  }`}
                />
                <span className="flex items-center justify-between gap-1.5">
                  <span>{label}</span>
                  <span className="text-[11px] font-semibold opacity-80">{when}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-start gap-[18px]">
        <section className="flex min-w-0 flex-[2_1_460px] flex-col gap-[18px]">
          <div className="overflow-hidden rounded-[18px] border border-border bg-card">
            <div className="flex items-center justify-between px-5 pb-2.5 pt-4">
              <h2 className="text-base font-bold">Produse</h2>
              {canEditItems && (
                <button
                  type="button"
                  onClick={openAddItem}
                  className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-primary hover:bg-muted"
                  title="Adaugă produs în comandă"
                  aria-label="Adaugă produs în comandă"
                >
                  <Plus className="size-4" />
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[620px]">
                <div className="grid grid-cols-[minmax(0,1.6fr)_90px_minmax(0,1.3fr)_minmax(0,0.8fr)] items-center gap-3 border-t border-border px-5 py-2 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground">
                  <span>Produs</span>
                  <span className="text-right">Cant.</span>
                  <span>De unde</span>
                  <span>Producție</span>
                </div>
                {itemCount === 0 && (
                  <div className="border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
                    Niciun produs
                  </div>
                )}
                {order.items?.map((item) => {
                  const pill = sourcePill(item);
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[minmax(0,1.6fr)_90px_minmax(0,1.3fr)_minmax(0,0.8fr)] items-center gap-3 border-t border-border px-5 py-3 text-[13px]"
                    >
                      <span className="min-w-0">
                        {item.recipeId ? (
                          <Link
                            href={`/recipes/${item.recipeId}`}
                            className="font-semibold text-foreground hover:text-primary"
                          >
                            {item.recipeName}
                          </Link>
                        ) : (
                          <span className="font-semibold">{item.recipeName}</span>
                        )}
                        {!item.recipeId && (
                          <span className="block text-xs text-muted-foreground">
                            Produs nemapat din magazin
                          </span>
                        )}
                      </span>
                      <span className="flex items-center justify-end gap-1 text-right font-bold">
                        {formatUnitQty(item.quantity, item.unit)}
                        {canEditItems && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive"
                            onClick={() => removeItem(item.id)}
                            disabled={removingItemId === item.id}
                            title="Șterge produsul din comandă"
                            aria-label="Șterge produsul din comandă"
                          >
                            {removingItemId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </span>
                      <span>
                        {pill ? (
                          <span
                            className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-[9px] text-xs font-bold ${
                              pill.startsWith('Din stoc')
                                ? 'bg-[var(--st-green-bg)] text-[var(--st-green)]'
                                : 'bg-[var(--st-blue-bg)] text-[var(--st-blue)]'
                            }`}
                          >
                            {pill}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                      <span
                        className="text-muted-foreground"
                        title="Taskurile de producție nu sunt încă legate de comenzi"
                      >
                        —
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-[18px] border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
              <span>
                Total{' '}
                <b className="text-foreground">
                  {itemCount} {itemCount === 1 ? 'produs' : 'produse'}
                </b>
              </span>
            </div>
          </div>

          <div className="overflow-hidden rounded-[18px] border border-border bg-card">
            <div className="px-5 pb-2.5 pt-4">
              <h2 className="text-base font-bold">Istoric</h2>
            </div>
            {history.map((h, i) => (
              <div key={i} className="flex gap-3 border-t border-border px-5 py-2.5">
                <span className={`mt-1 size-2.5 flex-none rounded-full ${h.tone}`} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] leading-snug">{h.text}</span>
                  <span className="text-[11px] text-muted-foreground">{h.when}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-[18px]">
          <div className="flex flex-col gap-2.5 rounded-[18px] border border-border bg-card px-5 py-[18px]">
            <h2 className="text-base font-bold">Client</h2>
            <span className="text-sm font-semibold">{titleClient || '—'}</span>
            {order.customerName &&
              deliveryPointLabel(order) &&
              order.deliveryPoint !== order.customerName && (
                <span className="text-[13px] text-muted-foreground">{order.deliveryPoint}</span>
              )}
            {order.deliveryAddress && (
              <span className="text-[13px] text-muted-foreground">{order.deliveryAddress}</span>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-card px-5 py-[18px]">
            <h2 className="text-base font-bold">Predare</h2>
            {order.fulfillmentType && (
              <div
                role="group"
                aria-label="Mod de predare"
                className="inline-flex self-start gap-0.5 rounded-[12px] bg-muted p-1"
              >
                {(['PICKUP', 'DELIVERY'] as const).map((m) => {
                  const on = order.fulfillmentType === m;
                  return (
                    <span
                      key={m}
                      aria-current={on ? 'true' : undefined}
                      className={`h-[34px] rounded-[9px] px-3.5 text-[13px] font-bold leading-[34px] ${
                        on
                          ? 'bg-card text-foreground shadow-(--shadow-card-sm)'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {m === 'PICKUP' ? 'Ridicare' : 'Livrare'}
                    </span>
                  );
                })}
              </div>
            )}
            <dl className="m-0 grid grid-cols-[56px_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-1.5 text-[13px]">
              <dt className="text-muted-foreground">Când</dt>
              <dd className="m-0 font-semibold">
                {order.dueDate
                  ? format(
                      new Date(order.dueDate),
                      hasTimeOfDay(order.dueDate) ? 'EEEE, d MMM, HH:mm' : 'EEEE, d MMM',
                      { locale: ro },
                    )
                  : '—'}
              </dd>
              {order.deliveryMethod && (
                <>
                  <dt className="text-muted-foreground">Metodă</dt>
                  <dd className="m-0 font-semibold" title={order.deliveryMethod}>
                    {deliveryMethodLabel(order.deliveryMethod, deliveryMethods)}
                  </dd>
                </>
              )}
              {order.deliveryAddress && (
                <>
                  <dt className="text-muted-foreground">Adresă</dt>
                  <dd className="m-0 font-semibold">{order.deliveryAddress}</dd>
                </>
              )}
            </dl>
            <Link
              href="/orders/calendar"
              className="text-[13px] font-semibold text-primary hover:underline"
            >
              Vezi în calendar →
            </Link>
          </div>

          <div className="flex flex-col gap-2.5 rounded-[18px] border border-border bg-card px-5 py-[18px]">
            <h2 className="text-base font-bold">Note</h2>
            <p className="text-[13px] leading-snug text-foreground/80">
              Sursă: {isSite ? 'WooCommerce' : 'comandă manuală'}
            </p>
            {canUpdateOrder ? (
              <>
                <textarea
                  aria-label="Notă internă pentru echipă"
                  rows={3}
                  placeholder="Notă internă pentru echipă"
                  className="resize-y rounded-[10px] border border-border bg-background p-2.5 text-[13px] outline-none focus-visible:border-ring"
                  value={notesDraft ?? order.notes ?? ''}
                  onChange={(e) => setNotesDraft(e.target.value)}
                />
                {notesDraft !== null && notesDraft !== (order.notes ?? '') && (
                  <Button
                    size="icon"
                    className="self-end"
                    onClick={saveNotes}
                    disabled={savingNotes}
                    title="Salvează nota"
                    aria-label="Salvează nota"
                  >
                    {savingNotes ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </>
            ) : (
              order.notes && <p className="text-[13px] text-muted-foreground">{order.notes}</p>
            )}
          </div>
        </aside>
      </div>

      {/* Factură + Aviz (app features), styled to the design card language */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Invoice section */}
        {can('update', 'Order') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <Receipt className="h-4 w-4" />
                Factură
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.hasInvoice ? (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[13px] font-medium">{order.invoiceFileName}</span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nicio factură încărcată — folosește „Încarcă factură” (PDF, JPG sau PNG).
                </p>
              )}
              <input
                ref={invoiceRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const typeOk =
                    ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) ||
                    /\.(pdf|jpe?g|png)$/i.test(file.name);
                  if (!typeOk) {
                    toast.error('Fișier neacceptat', {
                      description: 'Factura trebuie să fie PDF, JPG sau PNG.',
                    });
                    e.target.value = '';
                    return;
                  }
                  setUploadingInvoice(true);
                  try {
                    const updated = await ordersApi.uploadInvoice(id, file);
                    setOrder(updated);
                    toast.success('Factură încărcată');
                  } catch {
                    toast.error('Eroare la încărcare');
                  } finally {
                    setUploadingInvoice(false);
                    if (invoiceRef.current) invoiceRef.current.value = '';
                  }
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Delivery note section */}
        {can('manage', 'DeliveryNote') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-bold">
                <FileText className="h-4 w-4" />
                Aviz de livrare
              </CardTitle>
            </CardHeader>
            <CardContent>
              {note ? (
                <div className="space-y-3">
                  {note.serialNumber && (
                    <div className="flex justify-between text-[13px]">
                      <span className="text-muted-foreground">Serie</span>
                      <span className="font-medium">{note.serialNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground">Creat</span>
                    <span>{format(new Date(note.generatedAt), 'dd MMM yyyy', { locale: ro })}</span>
                  </div>
                  {note.signedByName && (
                    <div className="flex justify-between text-[13px]">
                      <span className="text-muted-foreground">Semnat de</span>
                      <span>{note.signedByName}</span>
                    </div>
                  )}
                  {note.signedAt && (
                    <div className="flex justify-between text-[13px]">
                      <span className="text-muted-foreground">Data semnării</span>
                      <span>{format(new Date(note.signedAt), 'dd MMM yyyy', { locale: ro })}</span>
                    </div>
                  )}
                  {signatureSrc && (
                    <div className="space-y-1">
                      <span className="text-[13px] text-muted-foreground">Semnătură</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signatureSrc}
                        alt="Semnătură"
                        className="h-24 rounded-md border bg-white"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Avizul nu a fost generat încă — folosește „Generează aviz”.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add item dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă produs</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Produs (rețetă finală)</Label>
              <div className="rounded-md border">
                <Command>
                  <CommandInput placeholder="Caută rețetă..." />
                  <CommandList>
                    <CommandEmpty>Nicio rețetă</CommandEmpty>
                    {finalRecipes.map((r) => (
                      <CommandItem
                        key={r.id}
                        value={`${r.name} ${r.id}`}
                        data-checked={addRecipeId === r.id}
                        onSelect={() => {
                          setAddRecipeId(r.id);
                          setAddUnit(r.unit);
                        }}
                      >
                        {r.name}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cantitate</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={addQty}
                aria-invalid={!!addQtyError}
                onChange={(e) => setAddQty(e.target.value)}
              />
              {addQtyError && <p className="text-xs text-destructive">{addQtyError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-[42px]" onClick={() => setAddOpen(false)}>
              Renunță
            </Button>
            <Button
              className="h-[42px]"
              onClick={submitAddItem}
              disabled={addingItem || !addRecipeId || !!addQtyError}
            >
              {addingItem ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Adaugă în comandă
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dialog}

      {/* Signature dialog */}
      <SignatureDialog
        open={signOpen}
        onOpenChange={(v) => {
          setSignOpen(v);
          if (!v) setDeliverAfterSign(false);
        }}
        onConfirm={signNote}
        submitting={signing}
      />

      {/* Printable delivery note (A4) */}
      {note && (
        <>
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #aviz-print, #aviz-print * { visibility: visible !important; }
              #aviz-print { position: absolute; inset: 0; display: block !important; margin: 0; padding: 24px; }
            }
          `}</style>
          <div
            id="aviz-print"
            className="hidden bg-white text-black print:block"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                textAlign: 'center',
                letterSpacing: 1,
                margin: '0 0 4px',
              }}
            >
              AVIZ DE ÎNSOȚIRE A MĂRFII
            </h1>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 12,
                fontSize: 12,
              }}
            >
              <span>Serie: {note.serialNumber || '________'}</span>
              <span>Comandă: #{order.orderNumber}</span>
              <span>Data: {format(new Date(note.generatedAt), 'dd.MM.yyyy', { locale: ro })}</span>
            </div>

            {/* Furnizor / Cumpărător */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginBottom: 12,
                fontSize: 12,
              }}
            >
              <div style={{ border: '0.75px solid #000', padding: '6px 8px' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>FURNIZOR</div>
                <div style={{ lineHeight: 1.5 }}>
                  <div>
                    <strong>Denumire:</strong> {org?.name || '________________________'}
                  </div>
                  <div>
                    <strong>Adresa:</strong> {org?.legalAddress || '________________________'}
                  </div>
                  <div>
                    <strong>CUI:</strong> {org?.cui || '________________________'}
                  </div>
                </div>
              </div>
              <div style={{ border: '0.75px solid #000', padding: '6px 8px' }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>CUMPĂRĂTOR</div>
                <div style={{ lineHeight: 1.5 }}>
                  <div>
                    <strong>Punct de livrare:</strong>{' '}
                    {note.deliveryPoint || '________________________'}
                  </div>
                  <div>
                    <strong>Adresa:</strong> {note.deliveryAddress || '________________________'}
                  </div>
                  <div>
                    <strong>CUI:</strong> ________________________
                  </div>
                </div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      borderBottom: '1px solid #000',
                      padding: '4px 8px',
                    }}
                  >
                    Produs
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      borderBottom: '1px solid #000',
                      padding: '4px 8px',
                    }}
                  >
                    Cantitate
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((item) => (
                  <tr key={item.id}>
                    <td style={{ borderBottom: '1px solid #ccc', padding: '4px 8px' }}>
                      {item.recipeName}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        borderBottom: '1px solid #ccc',
                        padding: '4px 8px',
                      }}
                    >
                      {formatUnitQty(item.quantity, item.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Date privind expediția */}
            <div style={{ marginTop: 12, fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Date privind expediția:</div>
              <div style={{ lineHeight: 1.7 }}>
                <div>
                  Numele delegatului:{' '}
                  {order.assignedTo
                    ? `${order.assignedTo.firstName} ${order.assignedTo.lastName}`
                    : '________________________'}
                </div>
                <div>Seria și nr. CI/buletin: ________________________</div>
                <div>Mijloc de transport: ________________________</div>
                <div>Data și ora expedierii: ________________________</div>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <p style={{ marginBottom: 4 }}>
                Semnat de: {note.signedByName || '__________________'}
              </p>
              {note.signedAt && (
                <p style={{ marginBottom: 4 }}>
                  Data: {format(new Date(note.signedAt), 'dd.MM.yyyy', { locale: ro })}
                </p>
              )}
              {signatureSrc && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={signatureSrc} alt="Semnătură" style={{ height: 96, marginTop: 8 }} />
              )}
            </div>

            {/* Receipt footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 32,
                fontSize: 12,
              }}
            >
              <span>Data primirii în gestiune: ________________________</span>
              <span>Semnătura gestionarului primitor: ________________________</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
