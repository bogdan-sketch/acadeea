'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { stock as stockApi, stockExtra } from '@/lib/api';
import type { StockMovement, StockMovementQuery } from '@/lib/types';
import { StockMovementType } from '@horae/shared-types';
import { movementTypeLabels } from '@/lib/constants';
import { usePermissions } from '@/contexts/auth-context';
import { formatUnitQty } from '@/lib/utils';
import { StockAdjustmentDialog } from '@/components/stock-adjustment-dialog';
import { BackLink } from '@/components/back-link';
import { DatePicker } from '@/components/ui/date-picker';
import { Download, Plus, Search, TrendingDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Truncate } from '@/components/truncate';
import { localizeNote } from '../_ui/notes';
import { CARD, IconAction, PageHead, Pill } from '../_ui/parts';
import { PillStrip, PinnedFilters } from '@/components/pinned-filters';
import { fmtDayHeader, fmtDayMonth, fmtTime, isoLocal, parseIsoLocal } from '../_ui/dates';

const PAGE_SIZE = 50;

// Movement-type capsules (design st-* utilities).
const TYPE_TONE: Record<StockMovementType, string> = {
  [StockMovementType.INTRARE]: 'st-green',
  [StockMovementType.INTRARE_PRODUCTIE]: 'st-green',
  [StockMovementType.IESIRE_PRODUCTIE]: 'st-orange',
  [StockMovementType.IESIRE_TESTE]: 'st-purple',
  [StockMovementType.IESIRE_VANZARE]: 'st-red',
  [StockMovementType.AJUSTARE]: 'st-gray',
  [StockMovementType.REZERVARE]: 'st-indigo',
  [StockMovementType.ELIBERARE]: 'st-blue',
};

const INTAKE = [StockMovementType.INTRARE, StockMovementType.INTRARE_PRODUCTIE];
const OUTTAKE = [
  StockMovementType.IESIRE_PRODUCTIE,
  StockMovementType.IESIRE_VANZARE,
  StockMovementType.IESIRE_TESTE,
];

type Preset = '7' | '30' | 'luna';

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date();
  if (p === 'luna') {
    return {
      from: isoLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: isoLocal(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  const days = p === '7' ? 7 : 30;
  return { from: isoLocal(new Date(now.getTime() - days * 86_400_000)), to: isoLocal(now) };
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: '7', label: '7 zile' },
  { key: '30', label: '30 zile' },
  { key: 'luna', label: 'Luna trecută' },
];

function qtyView(m: StockMovement): { text: string; cls: string } {
  const q = formatUnitQty(m.quantity, m.unit);
  switch (m.movementType) {
    // AJUSTARE stores the ABSOLUTE value the stock was set to, not a delta.
    case StockMovementType.AJUSTARE:
      return { text: `= ${q}`, cls: '' };
    case StockMovementType.INTRARE:
    case StockMovementType.INTRARE_PRODUCTIE:
      return { text: `+ ${q}`, cls: 'text-[var(--st-green)]' };
    case StockMovementType.REZERVARE:
      return { text: `⤵ ${q}`, cls: 'text-[var(--st-blue)]' };
    case StockMovementType.ELIBERARE:
      return { text: `⤴ ${q}`, cls: 'text-[var(--st-blue)]' };
    default:
      return { text: `− ${q}`, cls: 'text-[var(--st-red)]' };
  }
}

const ROW_GRID =
  'grid min-w-[760px] grid-cols-[64px_150px_minmax(0,1fr)_120px_160px_110px] items-center gap-3 px-5';

function MovementsView() {
  const params = useSearchParams();
  const { can } = usePermissions();
  const canCreate = can('create', 'StockMovement');

  const initial = useMemo(() => presetRange('30'), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [type, setType] = useState<StockMovementType | null>(null);
  const [searchText, setSearchText] = useState(params.get('search') ?? '');
  const [search, setSearch] = useState(params.get('search') ?? '');
  // Item / location filters arriving from the Stoc rows (history icon).
  const [entity, setEntity] = useState({
    rawMaterialId: params.get('rawMaterialId') ?? undefined,
    consumableId: params.get('consumableId') ?? undefined,
    recipeId: params.get('recipeId') ?? undefined,
    locationId: params.get('locationId') ?? undefined,
  });

  const [rows, setRows] = useState<StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sums, setSums] = useState<{ in: number; out: number; adj: number; res: number } | null>(
    null,
  );

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const base = useMemo<StockMovementQuery>(
    () => ({
      from: from || undefined,
      to: to || undefined,
      search: search || undefined,
      ...entity,
    }),
    [from, to, search, entity],
  );
  const query = useMemo<StockMovementQuery>(
    () => ({ ...base, movementType: type ?? undefined }),
    [base, type],
  );

  // Page 1 (and every filter change) replaces the list; later pages append.
  const reqId = useRef(0);
  const load = useCallback(
    async (p: number) => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const res = await stockApi.movements({ ...query, page: p, limit: PAGE_SIZE });
        if (id !== reqId.current) return;
        setRows((prev) => (p === 1 ? res.data : [...prev, ...res.data]));
        setTotal(res.total);
        setPage(p);
      } catch (err: unknown) {
        if (id === reqId.current)
          toast.error((err as { message?: string }).message || 'Nu am putut încărca mișcările');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    load(1);
  }, [load, reloadKey]);

  // Period totals: one count request per type (limit 1 → `total`), so the
  // cards cover the whole period, not just the rows loaded below.
  useEffect(() => {
    let cancelled = false;
    const count = (t: StockMovementType) =>
      stockApi.movements({ ...base, movementType: t, page: 1, limit: 1 }).then((r) => r.total);
    const sum = (types: StockMovementType[]) =>
      Promise.all(types.map(count)).then((a) => a.reduce((x, y) => x + y, 0));
    Promise.all([
      sum(INTAKE),
      sum(OUTTAKE),
      sum([StockMovementType.AJUSTARE]),
      sum([StockMovementType.REZERVARE]),
    ])
      .then(([i, o, a, r]) => {
        if (!cancelled) setSums({ in: i, out: o, adj: a, res: r });
      })
      .catch(() => {
        if (!cancelled) setSums(null);
      });
    return () => {
      cancelled = true;
    };
  }, [base, reloadKey]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await stockExtra.movementsExport(query);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `miscari-stoc-${query.from ?? ''}-${query.to ?? isoLocal(new Date())}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success('Jurnalul a fost exportat');
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Exportul a eșuat');
    } finally {
      setExporting(false);
    }
  };

  const activePreset = PRESETS.find((p) => {
    const r = presetRange(p.key);
    return r.from === from && r.to === to;
  })?.key;

  const days = useMemo(() => {
    const out: { key: string; label: string; rows: StockMovement[] }[] = [];
    for (const m of rows) {
      const d = new Date(m.createdAt);
      const key = isoLocal(d);
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(m);
      else out.push({ key, label: fmtDayHeader(d), rows: [m] });
    }
    return out;
  }, [rows]);

  const range =
    from && to ? `${fmtDayMonth(parseIsoLocal(from))} – ${fmtDayMonth(parseIsoLocal(to))}` : null;
  const meta = [
    activePreset === '30' ? 'Jurnalul ultimei luni' : 'Jurnal',
    range,
    `${total} ${total === 1 ? 'mișcare' : 'mișcări'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const hasEntity = Object.values(entity).some(Boolean);
  const summary = [
    { label: 'Intrări (recepții + producție)', value: sums?.in, cls: 'text-[var(--st-green)]' },
    {
      label: 'Ieșiri (vânzări + producție + teste)',
      value: sums?.out,
      cls: 'text-[var(--st-red)]',
    },
    { label: 'Ajustări (revizii, transferuri)', value: sums?.adj, cls: '' },
    { label: 'Rezervări în perioadă', value: sums?.res, cls: 'text-[var(--st-blue)]' },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <BackLink href="/stock" label="Stoc" />
      <PageHead title="Mișcări de stoc" meta={meta}>
        <label className="flex h-[42px] min-w-[220px] items-center gap-2 rounded-[var(--radius-ctl)] border border-border bg-card px-3.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 max-sm:min-w-0 max-sm:flex-[1_1_100%]">
          <Search aria-hidden className="h-4 w-4 flex-none text-muted-foreground" />
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Produs, notă, cine"
            aria-label="Caută mișcare"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        {/* Interval: two 42px pickers, same height as the buttons beside them (M-2). */}
        <DatePicker
          value={from}
          onChange={setFrom}
          aria-label="De la data"
          placeholder="De la"
          className="h-[42px] w-[150px]"
        />
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
        <DatePicker
          value={to}
          onChange={setTo}
          aria-label="Până la data"
          placeholder="Până la"
          className="h-[42px] w-[150px]"
        />
        <IconAction
          icon={Download}
          word="Excel"
          label="Exportă în Excel"
          title="Jurnalul filtrat, ca fișier Excel"
          onClick={handleExport}
          disabled={exporting}
          spinning={exporting}
        />
        {canCreate && (
          <IconAction
            icon={Plus}
            tone="primary"
            word="Nouă"
            label="Mișcare nouă"
            title="Intrare, ieșire sau ajustare manuală"
            onClick={() => setNewOpen(true)}
          />
        )}
      </PageHead>

      <PinnedFilters>
        <PillStrip label="Perioadă și tip">
          {PRESETS.map((p) => (
            <Pill
              key={p.key}
              on={activePreset === p.key}
              onClick={() => {
                const r = presetRange(p.key);
                setFrom(r.from);
                setTo(r.to);
              }}
            >
              {p.label}
            </Pill>
          ))}
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          {Object.values(StockMovementType).map((t) => (
            <Pill key={t} on={type === t} onClick={() => setType(type === t ? null : t)}>
              <span
                aria-hidden
                className={`size-2 rounded-full ${TYPE_TONE[t]}`}
                style={{ backgroundColor: 'currentColor' }}
              />
              {movementTypeLabels[t]}
            </Pill>
          ))}
          {hasEntity && (
            <Pill
              on
              title="Scoate filtrul de produs"
              onClick={() =>
                setEntity({
                  rawMaterialId: undefined,
                  consumableId: undefined,
                  recipeId: undefined,
                  locationId: undefined,
                })
              }
            >
              Filtrat pe produs
              <X className="h-3.5 w-3.5" />
            </Pill>
          )}
        </PillStrip>
      </PinnedFilters>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {summary.map((s) => (
          <div key={s.label} className={`${CARD} flex flex-col gap-1 px-4 py-3.5`}>
            <span className="text-xs font-semibold text-muted-foreground">{s.label}</span>
            <span className={`font-serif text-[26px] font-semibold leading-none ${s.cls}`}>
              {s.value ?? '—'}
            </span>
          </div>
        ))}
      </div>

      <section className={`${CARD} overflow-x-auto`}>
        {days.map((d) => (
          <div key={d.key}>
            <div className="border-t border-border/60 bg-muted/40 px-5 pb-1.5 pt-2.5 text-xs font-bold uppercase tracking-[0.4px] text-muted-foreground">
              {d.label}
            </div>
            {d.rows.map((m) => {
              const q = qtyView(m);
              return (
                <div
                  key={m.id}
                  className={`${ROW_GRID} border-t border-border/60 py-2.5 text-[13px]`}
                >
                  <span className="font-bold text-muted-foreground">
                    {fmtTime(new Date(m.createdAt))}
                  </span>
                  <span
                    className={`inline-flex h-6 items-center justify-self-start whitespace-nowrap rounded-full px-[9px] text-xs font-bold ${TYPE_TONE[m.movementType] ?? 'st-gray'}`}
                  >
                    {movementTypeLabels[m.movementType] ?? m.movementType}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <Truncate text={m.itemTitle || '—'} className="font-semibold" />
                    {m.referenceNote && (
                      <Truncate
                        text={localizeNote(m.referenceNote)}
                        className="text-xs text-muted-foreground"
                      />
                    )}
                  </span>
                  <span className={`text-right font-bold ${q.cls}`}>{q.text}</span>
                  <Truncate text={m.locationName || '—'} className="text-muted-foreground" />
                  <Truncate text={m.createdByName || '—'} className="text-muted-foreground" />
                </div>
              );
            })}
          </div>
        ))}
        {rows.length === 0 && !loading && (
          <EmptyState
            compact
            icon={TrendingDown}
            title="Nicio mișcare"
            description="Schimbă perioada sau scoate filtrele."
          />
        )}
        {loading && rows.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">Se încarcă…</div>
        )}
        <div className="flex min-w-[760px] items-center justify-between gap-2.5 border-t border-border/60 px-5 py-3 text-[13px] text-muted-foreground">
          <span>
            Se arată {rows.length} din {total} · cele mai noi sus
          </span>
          {rows.length < total && (
            <button
              type="button"
              disabled={loading}
              onClick={() => load(page + 1)}
              className="cursor-pointer font-semibold text-primary disabled:opacity-50"
            >
              {loading ? 'Se încarcă…' : 'Încarcă mai multe'}
            </button>
          )}
        </div>
      </section>

      <StockAdjustmentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSuccess={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}

export default function StockMovementsPage() {
  return (
    <Suspense fallback={null}>
      <MovementsView />
    </Suspense>
  );
}
