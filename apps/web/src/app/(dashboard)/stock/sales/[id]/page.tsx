'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Check,
  ChevronsUpDown,
  CirclePlus,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';

import { salesDeductions as api } from '@/lib/api';
import type {
  ConfirmSalesDeductionLine,
  SalesDeduction,
  SalesDeductionDecision,
  SalesDeductionLine,
  SalesMatchCandidate,
  SalesProductOption,
} from '@/lib/types';
import { UnitType } from '@horae/shared-types';
import { selectableUnits, unitTypeLabels } from '@/lib/constants';
import { SALES_DEDUCTIONS_ENABLED } from '@/lib/features';
import { cn, formatQty, formatUnitQty } from '@/lib/utils';
import { usePermissions } from '@/contexts/auth-context';
import { PageHeader } from '@/components/page-header';
import { BackLink } from '@/components/back-link';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/choice-chips';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { matchBadge, salesStatusBadge, sourceLabels } from '../labels';
import { parseDecimal } from '@/lib/ro-number';

const UNIT_OPTIONS = selectableUnits.map((u) => ({ value: u, label: unitTypeLabels[u] }));

// ── Editable row model ───────────────────────────────────────────────────

type StockMode = 'normal' | 'clamp' | 'override';

interface Row {
  key: string;
  id?: string;
  rawName: string;
  rawUnit: string | null;
  quantityReported: number | null;
  matchKind: string | null;
  matchScore: number | null;
  candidates: SalesMatchCandidate[];
  decision: SalesDeductionDecision;
  recipeId: string | null;
  /** Signed: >0 scade, <0 adaugă înapoi. Text so "2," can be typed. */
  qty: string;
  stockMode: StockMode;
  override: string;
  newName: string;
  newUnit: UnitType;
  newStock: string;
}

// RO keyboards type decimals with a comma.
const toNum = (s: string): number | null => parseDecimal(s);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function rowFromLine(l: SalesDeductionLine): Row {
  return {
    key: l.id,
    id: l.id,
    rawName: l.rawName,
    rawUnit: l.rawUnit,
    quantityReported: l.quantityReported,
    matchKind: l.matchKind,
    matchScore: l.matchScore,
    candidates: l.candidates,
    decision: l.decision,
    recipeId: l.recipeId,
    qty: l.quantity == null ? '' : String(l.quantity).replace('.', ','),
    stockMode: 'normal',
    override: '',
    newName: l.rawName,
    newUnit: UnitType.BUCATI,
    newStock: '',
  };
}

function manualRow(): Row {
  return {
    key: crypto.randomUUID(),
    rawName: '',
    rawUnit: null,
    quantityReported: null,
    matchKind: 'MANUAL',
    matchScore: null,
    candidates: [],
    decision: 'ACCEPT',
    recipeId: null,
    qty: '1',
    stockMode: 'normal',
    override: '',
    newName: '',
    newUnit: UnitType.BUCATI,
    newStock: '',
  };
}

interface Computed {
  before: number;
  after: number;
  qty: number | null;
  shortfall: number;
  /** Shortfall without a clamp/override decision yet. */
  unresolved: boolean;
  invalid: string | null;
}

/** Stock preview, walking rows in order so the same product twice compounds. */
function computeRows(
  rows: Row[],
  products: Map<string, SalesProductOption>,
): Map<string, Computed> {
  const running = new Map<string, number>();
  const out = new Map<string, Computed>();
  for (const r of rows) {
    const qty = toNum(r.qty);
    if (r.decision === 'DECLINE') {
      out.set(r.key, { before: 0, after: 0, qty, shortfall: 0, unresolved: false, invalid: null });
      continue;
    }
    if (r.decision === 'CREATE_NEW') {
      const stock = toNum(r.newStock);
      const invalid = !r.newName.trim()
        ? 'Numele produsului nou'
        : stock == null || stock < 0
          ? 'Stocul actual al produsului nou'
          : null;
      out.set(r.key, {
        before: 0,
        after: stock ?? 0,
        qty,
        shortfall: 0,
        unresolved: false,
        invalid,
      });
      continue;
    }
    const product = r.recipeId ? products.get(r.recipeId) : undefined;
    if (!product) {
      out.set(r.key, {
        before: 0,
        after: 0,
        qty,
        shortfall: 0,
        unresolved: false,
        invalid: 'Alege produsul',
      });
      continue;
    }
    const before = running.get(product.id) ?? product.stock;
    const override = toNum(r.override);
    const isOverride = r.stockMode === 'override';
    let invalid: string | null = null;
    if (qty == null && !isOverride) invalid = 'Cantitatea';
    if (isOverride && (override == null || override < 0)) invalid = 'Stocul suprascris';
    const q = qty ?? 0;
    const after = isOverride && override != null ? override : Math.max(0, round3(before - q));
    const shortfall = !isOverride && q > before ? round3(q - before) : 0;
    running.set(product.id, after);
    out.set(r.key, {
      before,
      after,
      qty,
      shortfall,
      unresolved: shortfall > 0 && r.stockMode !== 'clamp',
      invalid,
    });
  }
  return out;
}

const fmtDateTime = (iso: string) => format(new Date(iso), 'dd.MM.yyyy HH:mm');

type Filter = 'all' | 'review' | 'stock' | 'new' | 'declined';

// ── Page ─────────────────────────────────────────────────────────────────

export default function SalesDeductionDetailPage() {
  if (!SALES_DEDUCTIONS_ENABLED) notFound();
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<SalesDeduction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await api.get(id));
    } catch (err: unknown) {
      setError((err as { message?: string }).message || 'Scăderea nu a fost găsită');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div>
        <BackLink href="/stock/sales" label="Vânzări → stoc" />
        <p className="py-16 text-center text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return d.status === 'DRAFT' ? (
    <Confirmer deduction={d} onConfirmed={setD} />
  ) : (
    <ReadOnlyDetail deduction={d} onChange={setD} />
  );
}

// ── Draft: the confirmer ─────────────────────────────────────────────────

function Confirmer({
  deduction: d,
  onConfirmed,
}: {
  deduction: SalesDeduction;
  onConfirmed: (d: SalesDeduction) => void;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const canWrite = can('create', 'StockMovement');
  // Manual sessions start with one empty row ready to fill.
  const [rows, setRows] = useState<Row[]>(() =>
    d.source === 'MANUAL' && (d.lines ?? []).length === 0
      ? [manualRow()]
      : (d.lines ?? []).map(rowFromLine),
  );
  const [products, setProducts] = useState<SalesProductOption[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showInvalid, setShowInvalid] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    api
      .products(d.locationId)
      .then(setProducts)
      .catch(() => toast.error('Nu am putut încărca produsele'));
  }, [d.locationId]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const computed = useMemo(() => computeRows(rows, productById), [rows, productById]);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const stats = useMemo(() => {
    let accept = 0,
      created = 0,
      declined = 0,
      stock = 0,
      unresolved = 0,
      invalid = 0,
      review = 0;
    for (const r of rows) {
      const c = computed.get(r.key);
      if (r.decision === 'ACCEPT') accept++;
      if (r.decision === 'CREATE_NEW') created++;
      if (r.decision === 'DECLINE') declined++;
      if (c && (c.shortfall > 0 || r.stockMode === 'override')) stock++;
      if (c?.unresolved) unresolved++;
      if (c?.invalid) invalid++;
      if (needsReview(r)) review++;
    }
    return { accept, created, declined, stock, unresolved, invalid, review };
  }, [rows, computed]);

  const visible = rows.filter((r) => {
    const c = computed.get(r.key);
    switch (filter) {
      case 'review':
        return needsReview(r) || !!c?.invalid;
      case 'stock':
        return !!c && (c.shortfall > 0 || r.stockMode === 'override');
      case 'new':
        return r.decision === 'CREATE_NEW';
      case 'declined':
        return r.decision === 'DECLINE';
      default:
        return true;
    }
  });

  const openConfirm = () => {
    if (rows.length === 0) {
      toast.error('Nu există niciun produs de confirmat');
      return;
    }
    if (stats.invalid > 0) {
      setShowInvalid(true);
      setFilter('review');
      toast.error(`${stats.invalid} ${stats.invalid === 1 ? 'rând are' : 'rânduri au'} date lipsă`);
      return;
    }
    setConfirmOpen(true);
  };

  const discard = async () => {
    setDiscarding(true);
    try {
      await api.discard(d.id);
      toast.success('Scăderea a fost abandonată — stocul nu s-a modificat');
      router.push('/stock/sales');
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Eroare');
      setDiscarding(false);
    }
  };

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'Toate', count: rows.length },
    { key: 'review', label: 'De verificat', count: stats.review },
    { key: 'stock', label: 'Probleme stoc', count: stats.stock },
    { key: 'new', label: 'Produse noi', count: stats.created },
    { key: 'declined', label: 'Ignorate', count: stats.declined },
  ];

  return (
    <div className="pb-28">
      <BackLink href="/stock/sales" label="Vânzări → stoc" />
      <PageHeader
        title="Confirmă vânzările"
        eyebrow={`${sourceLabels[d.source]} · ${d.locationName}`}
        description="Verifică fiecare produs: acceptă, corectează, ignoră sau adaugă-l ca produs nou. Stocul se modifică doar după „Confirmă tot”."
      />

      {d.duplicateOf.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-ctl)] bg-[var(--st-orange-bg)] px-3.5 py-3 text-sm text-[var(--st-orange)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Acest fișier a mai fost confirmat o dată.{' '}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => router.push(`/stock/sales/${d.duplicateOf[0]}`)}
            >
              Vezi scăderea anterioară
            </button>{' '}
            — confirmând din nou, vânzările se scad de două ori.
          </span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              filter === f.key
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label} · {f.count}
          </button>
        ))}
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRows((prev) => [...prev, manualRow()]);
            setFilter('all');
          }}
        >
          <CirclePlus className="mr-1.5 h-4 w-4" />
          Adaugă produs
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? 'Niciun produs încă — adaugă unul.' : 'Nimic în acest filtru.'}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((r) => (
            <LineEditor
              key={r.key}
              row={r}
              c={computed.get(r.key)}
              products={products}
              productById={productById}
              showInvalid={showInvalid}
              onChange={(patch) => update(r.key, patch)}
              onRemove={() => remove(r.key)}
            />
          ))}
        </div>
      )}

      {canWrite && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:left-[var(--sidebar-width,0px)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{stats.accept}</span> de scăzut ·{' '}
              <span className="font-semibold text-foreground">{stats.created}</span> noi ·{' '}
              {stats.declined} ignorate
              {stats.unresolved > 0 && (
                <span className="ml-1 font-semibold text-[var(--st-orange)]">
                  · {stats.unresolved} cu stoc insuficient
                </span>
              )}
            </div>
            <Button variant="ghost" onClick={discard} disabled={discarding}>
              {discarding && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Renunță
            </Button>
            <Button onClick={openConfirm}>
              <Check className="mr-1.5 h-4 w-4" />
              Confirmă tot
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        deduction={d}
        rows={rows}
        computed={computed}
        productById={productById}
        onDone={(res) => {
          setConfirmOpen(false);
          toast.success('Stocul a fost actualizat', {
            description: `${res.summary.accepted} scăzute · ${res.summary.created} noi · ${res.summary.declined} ignorate`,
          });
          onConfirmed(res);
        }}
        onApplyClampAll={() =>
          setRows((prev) =>
            prev.map((r) =>
              computed.get(r.key)?.unresolved ? { ...r, stockMode: 'clamp' as StockMode } : r,
            ),
          )
        }
      />
    </div>
  );
}

function needsReview(r: Row): boolean {
  if (r.decision !== 'ACCEPT') return r.decision === 'CREATE_NEW' && r.matchKind !== 'MANUAL';
  if (!r.recipeId) return true;
  return r.matchKind === 'FUZZY' || (r.matchKind === 'CONTAINS' && (r.matchScore ?? 0) < 0.85);
}

// ── One line ─────────────────────────────────────────────────────────────

function LineEditor({
  row: r,
  c,
  products,
  productById,
  showInvalid,
  onChange,
  onRemove,
}: {
  row: Row;
  c: Computed | undefined;
  products: SalesProductOption[];
  productById: Map<string, SalesProductOption>;
  showInvalid: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const product = r.recipeId ? productById.get(r.recipeId) : undefined;
  const badge = matchBadge(r.matchKind, r.matchScore);
  const isManual = r.matchKind === 'MANUAL';
  const step = (delta: number) => {
    const cur = toNum(r.qty) ?? 0;
    onChange({ qty: String(round3(cur + delta)).replace('.', ',') });
  };
  const invalid = showInvalid && c?.invalid;

  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border bg-card px-4 py-3',
        r.decision === 'DECLINE' && 'opacity-60',
        invalid ? 'border-[var(--st-red)]' : 'border-border',
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Din raport */}
        <div className="min-w-0 lg:w-[30%]">
          {isManual ? (
            <span className="text-xs font-semibold uppercase tracking-[.4px] text-muted-foreground">
              Adăugat manual
            </span>
          ) : (
            <>
              <div className="truncate text-sm font-semibold" title={r.rawName}>
                {r.rawName}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {r.quantityReported != null && (
                  <span>
                    raport: {formatQty(r.quantityReported)} {r.rawUnit ?? ''}
                  </span>
                )}
                <StatusBadge label={badge.label} colorClass={badge.color} />
              </div>
            </>
          )}
        </div>

        {/* Decizie */}
        <div className="flex shrink-0 rounded-[var(--radius-ctl)] bg-muted p-0.5 text-xs font-semibold">
          {(
            [
              ['ACCEPT', 'Scade'],
              ['CREATE_NEW', 'Produs nou'],
              ['DECLINE', 'Ignoră'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange({ decision: k, newName: r.newName || r.rawName })}
              className={cn(
                'rounded-[calc(var(--radius-ctl)-2px)] px-2.5 py-1.5 transition-colors',
                r.decision === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
              aria-pressed={r.decision === k}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Detalii pe decizie */}
        <div className="min-w-0 flex-1">
          {r.decision === 'ACCEPT' && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[200px] flex-1">
                <ProductCombobox
                  products={products}
                  candidates={r.candidates}
                  value={r.recipeId}
                  onSelect={(p) => onChange({ recipeId: p.id, rawName: r.rawName || p.name })}
                />
              </div>
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-r-none"
                  onClick={() => step(-1)}
                  aria-label="Scade 1"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Input
                  value={r.qty}
                  onChange={(e) => onChange({ qty: e.target.value })}
                  inputMode="decimal"
                  className="h-9 w-20 rounded-none border-x-0 text-center font-semibold"
                  aria-label="Cantitate vândută"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-l-none"
                  onClick={() => step(1)}
                  aria-label="Adaugă 1"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {product && c && (
                <div className="min-w-[110px] text-xs">
                  <div className="text-muted-foreground">stoc</div>
                  <div className="font-semibold">
                    {formatQty(c.before)} → {formatUnitQty(c.after, product.unit)}
                  </div>
                </div>
              )}
            </div>
          )}

          {r.decision === 'CREATE_NEW' && (
            <div className="flex flex-wrap items-center gap-2">
              <PackagePlus className="h-4 w-4 shrink-0 text-[var(--st-blue)]" />
              <Input
                value={r.newName}
                onChange={(e) => onChange({ newName: e.target.value })}
                placeholder="Nume produs nou"
                className="h-9 min-w-[180px] flex-1"
              />
              <ChoiceChips<UnitType>
                label="Unitate de măsură"
                value={r.newUnit}
                onChange={(v) => v && onChange({ newUnit: v })}
                options={UNIT_OPTIONS}
                height="h-9"
                className="basis-full"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                stoc acum
                <Input
                  value={r.newStock}
                  onChange={(e) => onChange({ newStock: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                  className="h-9 w-20 text-center font-semibold"
                />
              </label>
            </div>
          )}

          {r.decision === 'DECLINE' && (
            <span className="text-xs text-muted-foreground">
              Nu se modifică nimic pentru acest rând.
            </span>
          )}
        </div>

        {isManual && (
          <button
            type="button"
            onClick={onRemove}
            className="self-start text-[var(--st-red)] hover:opacity-80 lg:self-center"
            aria-label="Șterge rândul"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Sub-rânduri: corecție, deficit, suprascriere */}
      {r.decision === 'ACCEPT' && c && product && (
        <div className="mt-2 space-y-2">
          {c.qty != null && c.qty < 0 && (
            <p className="text-xs text-[var(--st-green)]">
              Cantitate negativă: se adaugă înapoi {formatUnitQty(-c.qty, product.unit)} în stoc.
            </p>
          )}
          {(c.shortfall > 0 || r.stockMode !== 'normal') && (
            <div
              className={cn(
                'rounded-[var(--radius-ctl)] px-3 py-2.5 text-xs',
                c.unresolved
                  ? 'bg-[var(--st-orange-bg)] text-[var(--st-orange)]'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {c.shortfall > 0 && (
                <div className="mb-2 flex items-center gap-1.5 font-semibold">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  Ai vândut {formatQty(c.qty)}, dar în stoc sunt doar {formatQty(c.before)}. Stocul
                  nu poate fi negativ.
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-foreground">
                {c.shortfall > 0 && (
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={r.stockMode === 'clamp'}
                      onChange={() => onChange({ stockMode: 'clamp' })}
                    />
                    Scade până la 0 (vânzarea rămâne înregistrată: {formatQty(c.qty)})
                  </label>
                )}
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={r.stockMode === 'override'}
                    onChange={() => onChange({ stockMode: 'override' })}
                  />
                  Suprascrie stocul la
                  <Input
                    value={r.override}
                    onChange={(e) => onChange({ override: e.target.value, stockMode: 'override' })}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-7 w-20 text-center"
                  />
                  {product.unit && unitTypeLabels[product.unit]}
                </label>
                {r.stockMode !== 'normal' && c.shortfall === 0 && (
                  <button
                    type="button"
                    className="text-muted-foreground underline"
                    onClick={() => onChange({ stockMode: 'normal', override: '' })}
                  >
                    anulează suprascrierea
                  </button>
                )}
              </div>
            </div>
          )}
          {c.shortfall === 0 && r.stockMode === 'normal' && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => onChange({ stockMode: 'override' })}
            >
              Suprascrie stocul
            </button>
          )}
        </div>
      )}

      {invalid && (
        <p className="mt-2 text-xs font-semibold text-[var(--st-red)]">Lipsește: {c?.invalid}</p>
      )}
    </div>
  );
}

function ProductCombobox({
  products,
  candidates,
  value,
  onSelect,
}: {
  products: SalesProductOption[];
  candidates: SalesMatchCandidate[];
  value: string | null;
  onSelect: (p: SalesProductOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value);
  const suggested = candidates
    .map((c) => products.find((p) => p.id === c.id))
    .filter((p): p is SalesProductOption => !!p);
  const suggestedIds = new Set(suggested.map((p) => p.id));

  const item = (p: SalesProductOption) => (
    <CommandItem
      key={p.id}
      value={`${p.name} ${p.id}`}
      onSelect={() => {
        onSelect(p);
        setOpen(false);
      }}
    >
      <Check
        className={cn('mr-2 h-4 w-4 shrink-0', value === p.id ? 'opacity-100' : 'opacity-0')}
      />
      <span className="flex-1 truncate">{p.name}</span>
      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
        {formatUnitQty(p.stock, p.unit)}
      </span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-ctl)] border bg-card px-3 text-[13px] font-semibold outline-hidden',
          selected ? 'border-input' : 'border-[var(--st-orange)]',
        )}
      >
        <span className={selected ? 'truncate' : 'truncate text-muted-foreground'}>
          {selected
            ? selected.name
            : suggested.length
              ? `Sugestie: ${suggested[0].name}?`
              : 'Alege produsul'}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,90vw)] p-0">
        <Command>
          <CommandInput placeholder="Caută produs..." />
          <CommandList>
            <CommandEmpty>Niciun produs găsit.</CommandEmpty>
            {suggested.length > 0 && (
              <CommandGroup heading="Sugestii după nume">{suggested.map(item)}</CommandGroup>
            )}
            <CommandGroup heading="Toate produsele">
              {products.filter((p) => !suggestedIds.has(p.id)).map(item)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SummarySection({
  title,
  items,
  tone,
  render,
  nameOf,
}: {
  title: string;
  items: Row[];
  tone?: 'warn' | 'info' | 'muted';
  render: (r: Row) => string;
  nameOf: (r: Row) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div
        className={cn(
          'mb-1 text-xs font-bold uppercase tracking-[.4px]',
          tone === 'warn'
            ? 'text-[var(--st-orange)]'
            : tone === 'info'
              ? 'text-[var(--st-blue)]'
              : 'text-muted-foreground',
        )}
      >
        {title} · {items.length}
      </div>
      <ul className="max-h-36 space-y-0.5 overflow-y-auto text-sm">
        {items.map((r) => (
          <li key={r.key} className="flex justify-between gap-3">
            <span className="truncate">{nameOf(r)}</span>
            <span className="shrink-0 text-muted-foreground">{render(r)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Bulk confirmation ────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  onOpenChange,
  deduction: d,
  rows,
  computed,
  productById,
  onDone,
  onApplyClampAll,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deduction: SalesDeduction;
  rows: Row[];
  computed: Map<string, Computed>;
  productById: Map<string, SalesProductOption>;
  onDone: (d: SalesDeduction) => void;
  onApplyClampAll: () => void;
}) {
  const [note, setNote] = useState('');
  const [ackAll, setAckAll] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setAckAll(false);
  }, [open]);

  const accepted = rows.filter((r) => r.decision === 'ACCEPT');
  const unresolved = accepted.filter((r) => computed.get(r.key)?.unresolved);
  const clamped = accepted.filter(
    (r) => r.stockMode === 'clamp' && (computed.get(r.key)?.shortfall ?? 0) > 0,
  );
  const overrides = accepted.filter((r) => r.stockMode === 'override');
  const ok = accepted.filter(
    (r) => !unresolved.includes(r) && !clamped.includes(r) && !overrides.includes(r),
  );
  const created = rows.filter((r) => r.decision === 'CREATE_NEW');
  const declined = rows.filter((r) => r.decision === 'DECLINE');
  const blocked = unresolved.length > 0 && !ackAll;

  const nameOf = (r: Row) =>
    (r.recipeId && productById.get(r.recipeId)?.name) || r.rawName || 'Produs';

  const submit = async () => {
    setSaving(true);
    try {
      const lines: ConfirmSalesDeductionLine[] = rows.map((r) => {
        const c = computed.get(r.key);
        const base = { id: r.id, rawName: r.rawName.trim() || nameOf(r), decision: r.decision };
        if (r.decision === 'CREATE_NEW') {
          return {
            ...base,
            newProduct: {
              name: r.newName.trim(),
              unit: r.newUnit,
              initialStock: toNum(r.newStock) ?? 0,
            },
          };
        }
        if (r.decision === 'DECLINE') return { ...base, recipeId: r.recipeId ?? undefined };
        return {
          ...base,
          recipeId: r.recipeId ?? undefined,
          quantity: c?.qty ?? 0,
          stockOverride: r.stockMode === 'override' ? (toNum(r.override) ?? 0) : undefined,
          acceptShortfall: r.stockMode === 'clamp' || (ackAll && !!c?.unresolved) || undefined,
        };
      });
      if (ackAll) onApplyClampAll();
      const res = await api.confirm(d.id, lines, note.trim() || undefined);
      onDone(res);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Confirmarea a eșuat');
    } finally {
      setSaving(false);
    }
  };

  const qtyText = (r: Row) => {
    const c = computed.get(r.key);
    const q = c?.qty ?? 0;
    return `${q < 0 ? '+' + formatQty(-q) : '−' + formatQty(q)} · ${formatQty(c?.before)} → ${formatQty(c?.after)}`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Confirmă toate modificările</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <p className="text-xs text-muted-foreground">
            {d.locationName} · totul se aplică într-un singur pas și primești o singură notificare
            cu rezumatul.
          </p>
          <SummarySection
            nameOf={nameOf}
            title="Stoc insuficient — nerezolvat"
            items={unresolved}
            tone="warn"
            render={(r) => {
              const c = computed.get(r.key);
              return `vândut ${formatQty(c?.qty)}, stoc ${formatQty(c?.before)}`;
            }}
          />
          {unresolved.length > 0 && (
            <label className="flex items-start gap-2 rounded-[var(--radius-ctl)] bg-[var(--st-orange-bg)] px-3 py-2.5 text-xs text-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={ackAll}
                onChange={(e) => setAckAll(e.target.checked)}
              />
              Am înțeles: pentru aceste {unresolved.length} produse se scade cât e în stoc (ajung la
              0), iar vânzarea rămâne înregistrată integral.
            </label>
          )}
          <SummarySection
            nameOf={nameOf}
            title="Aduse la 0 (stoc insuficient, confirmat)"
            items={clamped}
            tone="warn"
            render={qtyText}
          />
          <SummarySection
            nameOf={nameOf}
            title="Stoc suprascris"
            items={overrides}
            tone="info"
            render={(r) => `stoc nou: ${formatQty(toNum(r.override) ?? 0)}`}
          />
          <SummarySection
            nameOf={nameOf}
            title="Produse noi"
            items={created}
            tone="info"
            render={(r) => `stoc: ${r.newStock || 0}`}
          />
          <SummarySection nameOf={nameOf} title="Se scad normal" items={ok} render={qtyText} />
          <SummarySection
            nameOf={nameOf}
            title="Ignorate"
            items={declined}
            tone="muted"
            render={() => '—'}
          />
          <div className="space-y-1">
            <Label className="text-xs">Notă (opțional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Înapoi
          </Button>
          <Button onClick={submit} disabled={saving || blocked}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Confirmă și actualizează stocul
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Confirmed / reverted: the log entry ──────────────────────────────────

function ReadOnlyDetail({
  deduction: d,
  onChange,
}: {
  deduction: SalesDeduction;
  onChange: (d: SalesDeduction) => void;
}) {
  const { can } = usePermissions();
  const [revertOpen, setRevertOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  const badge = salesStatusBadge[d.status];

  const revert = async () => {
    setReverting(true);
    try {
      const res = await api.revert(d.id);
      toast.success('Scăderea a fost anulată — stocul a fost pus la loc');
      setRevertOpen(false);
      onChange(res);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Anularea a eșuat');
    } finally {
      setReverting(false);
    }
  };

  const observation = (l: SalesDeductionLine) => {
    if (l.decision === 'DECLINE') return 'ignorat';
    if (l.decision === 'CREATE_NEW') return 'produs nou creat';
    const parts: string[] = [];
    if (l.shortfall) parts.push(`stoc insuficient, lipsă ${formatQty(l.shortfall)}`);
    if (l.stockOverride != null) parts.push(`stoc suprascris la ${formatQty(l.stockOverride)}`);
    if (l.quantity != null && l.quantity < 0) parts.push('adăugat înapoi');
    return parts.join(' · ');
  };

  return (
    <div>
      <BackLink href="/stock/sales" label="Vânzări → stoc" />
      <PageHeader
        title={`${sourceLabels[d.source]} · ${d.locationName}`}
        eyebrow={d.confirmedAt ? `Confirmată ${fmtDateTime(d.confirmedAt)}` : undefined}
        description={[d.confirmedByName && `de ${d.confirmedByName}`, d.fileName, d.note]
          .filter(Boolean)
          .join(' · ')}
        actions={
          d.status === 'CONFIRMED' && can('create', 'StockMovement') ? (
            <Button variant="outline" onClick={() => setRevertOpen(true)}>
              <Undo2 className="mr-1.5 h-4 w-4" />
              Anulează scăderea
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge label={badge.label} colorClass={badge.color} />
        {d.revertedAt && (
          <span className="text-muted-foreground">anulată {fmtDateTime(d.revertedAt)}</span>
        )}
        <span className="text-muted-foreground">
          {d.summary.accepted} scăzute · {d.summary.created} noi · {d.summary.declined} ignorate
          {d.summary.shortfalls ? ` · ${d.summary.shortfalls} cu stoc insuficient` : ''}
        </span>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted text-left text-[11px] font-semibold uppercase tracking-[.4px] text-muted-foreground">
              <th className="px-4 py-2.5">Din raport</th>
              <th className="px-4 py-2.5">Produs</th>
              <th className="px-4 py-2.5 text-right">Vândut</th>
              <th className="px-4 py-2.5 text-right">Stoc</th>
              <th className="px-4 py-2.5">Observații</th>
            </tr>
          </thead>
          <tbody>
            {(d.lines ?? []).map((l) => (
              <tr
                key={l.id}
                className={cn('border-t border-border', l.decision === 'DECLINE' && 'opacity-60')}
              >
                <td className="px-4 py-2.5">
                  <div className="font-medium">{l.rawName}</div>
                  {l.quantityReported != null && (
                    <div className="text-xs text-muted-foreground">
                      raport: {formatQty(l.quantityReported)} {l.rawUnit ?? ''}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5">{l.recipeName ?? '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold">
                  {l.decision === 'ACCEPT' && l.quantity != null ? formatQty(l.quantity) : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  {l.stockBefore != null
                    ? `${formatQty(l.stockBefore)} → ${formatQty(l.stockAfter)}`
                    : '—'}
                </td>
                <td
                  className={cn(
                    'px-4 py-2.5 text-xs',
                    l.shortfall ? 'text-[var(--st-orange)]' : 'text-muted-foreground',
                  )}
                >
                  {observation(l)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={revertOpen} onOpenChange={(o) => !reverting && setRevertOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anulezi scăderea?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cantitățile scăzute se pun înapoi în stocul din {d.locationName} (peste stocul de acum).
            Produsele noi create din raport rămân în aplicație.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevertOpen(false)} disabled={reverting}>
              <X className="mr-1.5 h-4 w-4" />
              Nu
            </Button>
            <Button onClick={revert} disabled={reverting}>
              {reverting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-4 w-4" />
              )}
              Da, anulează
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
