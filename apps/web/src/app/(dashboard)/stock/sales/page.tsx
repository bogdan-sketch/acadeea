'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronRight, Download, FileSpreadsheet, Loader2, Plus, Receipt, X } from 'lucide-react';

import {
  locations as locationsApi,
  organization as orgApi,
  salesDeductions as api,
} from '@/lib/api';
import { pickDefaultLocation } from '@/lib/default-location';
import type { Location, SalesDeduction, SalesDeductionSource } from '@/lib/types';
import { SALES_DEDUCTIONS_ENABLED } from '@/lib/features';
import { formatQty } from '@/lib/utils';
import {
  matchBadge,
  salesStatusBadge as statusBadge,
  sourceChips,
  sourceLabels,
  sourceRowLabels,
} from './labels';
import { usePermissions } from '@/contexts/auth-context';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import { BulkSelectBar, BulkSelectToggle } from '@/components/bulk-select-bar';
import type { BulkActionDef } from '@/components/bulk-actions';
import { BackLink } from '@/components/back-link';
import { EmptyState } from '@/components/empty-state';
import { Truncate } from '@/components/truncate';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { CARD, Capsule, DropZone, IconAction, PageHead, Pill } from '../_ui/parts';
import { fmtRelative, isoLocal } from '../_ui/dates';
import { BRAND_NAME } from '@/lib/brand';

const PAGE_SIZE = 20;
const MONTHS = [
  'ianuarie',
  'februarie',
  'martie',
  'aprilie',
  'mai',
  'iunie',
  'iulie',
  'august',
  'septembrie',
  'octombrie',
  'noiembrie',
  'decembrie',
];

const whenOf = (d: SalesDeduction) => new Date(d.confirmedAt ?? d.createdAt);

/**
 * Jurnalul scăderilor de stoc pe bază de vânzări + panoul inline „Scădere
 * nouă” (sursa: Excel/CSV, manual sau comenzile de pe site) → `stock/sales/[id]`,
 * care rămâne confirmatorul.
 */
export default function SalesDeductionsPage() {
  // Constant → hook order stable (see lib/features.ts).
  if (!SALES_DEDUCTIONS_ENABLED) notFound();

  const router = useRouter();
  const { can } = usePermissions();
  const canCreate = can('create', 'StockMovement');
  const canDelete = can('delete', 'StockMovement');
  const select = useBulkSelect();
  const bulkActions: BulkActionDef[] = [
    { key: 'discard', label: 'Renunță la ciorne' },
    { key: 'revert', label: 'Anulează confirmările' },
  ];

  const [rows, setRows] = useState<SalesDeduction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [srcFilter, setSrcFilter] = useState<SalesDeductionSource | null>(null);
  const [latest, setLatest] = useState<SalesDeduction | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await api.list(p, PAGE_SIZE);
      setRows((prev) => (p === 1 ? res.data : [...prev, ...res.data]));
      setTotal(res.total);
      setPage(p);
      if (p === 1) {
        // The list carries no lines — fetch the newest entry for its card.
        const first = res.data[0];
        if (first)
          api
            .get(first.id)
            .then(setLatest)
            .catch(() => setLatest(first));
        else setLatest(null);
      }
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Nu am putut încărca jurnalul');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  const shown = useMemo(
    () => (srcFilter ? rows.filter((d) => d.source === srcFilter) : rows),
    [rows, srcFilter],
  );

  const now = new Date();
  const thisMonth = rows.filter((d) => {
    const w = whenOf(d);
    return w.getFullYear() === now.getFullYear() && w.getMonth() === now.getMonth();
  }).length;
  const meta = [
    'Scăderi din stoc pe bază de vânzări · eBriza, manual sau site',
    rows.length >= total && !loading
      ? `${thisMonth} în ${MONTHS[now.getMonth()]}`
      : `${total} în total`,
  ].join(' · ');

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/stock" label="Stoc" />
      <PageHead title="Vânzări → stoc" meta={meta}>
        {canCreate && (
          <IconAction
            icon={newOpen ? X : Plus}
            tone="primary"
            word={newOpen ? 'Închide' : 'Nouă'}
            label="Scădere nouă"
            title="Din raport Excel/CSV, manual sau din comenzile de pe site"
            pressed={newOpen}
            onClick={() => setNewOpen((o) => !o)}
          />
        )}
      </PageHead>

      {newOpen && canCreate && (
        <NewDeductionPanel
          onClose={() => setNewOpen(false)}
          onCreated={(d) => router.push(`/stock/sales/${d.id}`)}
        />
      )}

      {latest && <LatestCard d={latest} />}

      <section className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 pb-2.5 pt-4">
          <h2 className="text-base font-bold">Istoric scăderi</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {sourceChips.map((c) => (
              <Pill
                key={c.key}
                height="h-8"
                on={srcFilter === c.key}
                title={`Doar ${sourceLabels[c.key]}`}
                onClick={() => setSrcFilter(srcFilter === c.key ? null : c.key)}
              >
                {c.label}
              </Pill>
            ))}
            {(canDelete || canCreate) && <BulkSelectToggle select={select} />}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div
              className={`${HIST_GRID(select.active)} border-t border-border/60 py-2 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground`}
            >
              {select.active && <span className="sr-only">Selectează</span>}
              <span>Când</span>
              <span>Sursă</span>
              <span>Locație</span>
              <span className="text-right">Rânduri</span>
              <span className="text-right">Produse scăzute</span>
              <span>Status</span>
              <span>De către</span>
            </div>
            {shown.map((d) => {
              const st = statusBadge[d.status];
              const go = () =>
                select.active ? select.toggle(d.id) : router.push(`/stock/sales/${d.id}`);
              return (
                <div
                  key={d.id}
                  role="link"
                  tabIndex={0}
                  onClick={go}
                  onKeyDown={(e) => e.key === 'Enter' && go()}
                  className={`${HIST_GRID(select.active)} cursor-pointer border-t border-border/60 py-[11px] text-[13px] transition-colors hover:bg-muted/40`}
                >
                  {select.active && (
                    <span onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label="Selectează rândul"
                        checked={select.isSelected(d.id)}
                        onCheckedChange={() => select.toggle(d.id)}
                      />
                    </span>
                  )}
                  <span className="whitespace-nowrap font-semibold">{fmtRelative(whenOf(d))}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{sourceRowLabels[d.source]}</span>
                    {(d.fileName || d.note) && (
                      <Truncate
                        text={d.fileName ?? d.note ?? ''}
                        className="text-xs text-muted-foreground"
                      />
                    )}
                  </span>
                  <Truncate text={d.locationName} className="text-muted-foreground" />
                  <span className="text-right">{d.summary.total}</span>
                  <span className="text-right font-bold text-[var(--st-red)]">
                    {d.status === 'DRAFT' ? '—' : `− ${d.summary.accepted}`}
                  </span>
                  <span>
                    <Capsule tone={st.color}>{st.label}</Capsule>
                  </span>
                  <Truncate
                    text={d.confirmedByName || d.createdByName}
                    className="text-muted-foreground"
                  />
                </div>
              );
            })}
            {shown.length === 0 && !loading && (
              <div className="border-t border-border/60">
                <EmptyState
                  compact
                  icon={Receipt}
                  title={rows.length === 0 ? 'Nicio scădere încă' : 'Nicio scădere de acest fel'}
                  description={
                    rows.length === 0
                      ? 'Încarcă raportul de vânzări din eBriza sau introdu vânzările manual.'
                      : 'Scoate filtrul de sursă sau încarcă mai multe rânduri.'
                  }
                />
              </div>
            )}
            {loading && rows.length === 0 && (
              <div className="border-t border-border/60 px-5 py-9 text-center text-sm text-muted-foreground">
                Se încarcă…
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2.5 border-t border-border/60 px-5 py-3 text-[13px] text-muted-foreground">
          <span>
            Se arată {shown.length}
            {srcFilter ? ` (din ${rows.length} încărcate)` : ` din ${total}`}
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

      <BulkSelectBar
        select={select}
        entityLabel="scăderi"
        warning="Scăderile confirmate sunt anulate (stocul revine) înainte de ștergere."
        onPreview={canDelete ? (ids) => api.bulkDeletePreview(ids) : undefined}
        onDelete={canDelete ? (ids) => api.bulkDelete(ids) : undefined}
        actions={canCreate ? bulkActions : undefined}
        onAction={(ids, key, params) => api.bulkAction(ids, key, params)}
        onDone={() => load(1)}
      />
    </div>
  );
}

const HIST_GRID = (selecting: boolean) =>
  `grid items-center gap-3 px-5 ${
    selecting
      ? 'grid-cols-[28px_110px_minmax(0,1.5fr)_140px_70px_120px_110px_90px]'
      : 'grid-cols-[110px_minmax(0,1.5fr)_140px_70px_120px_110px_90px]'
  }`;

const LINE_GRID =
  'grid min-w-[760px] grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_160px_80px_110px_80px] items-center gap-3 px-5';
const LINE_CAP = 12;

/** The newest deduction with its lines (În raport / Produs Horae / Potrivire …). */
function LatestCard({ d }: { d: SalesDeduction }) {
  const st = statusBadge[d.status];
  const lines = d.lines ?? [];
  const title = [
    `Scădere #${d.id.slice(0, 6)}`,
    d.fileName ?? d.note ?? sourceRowLabels[d.source],
    fmtRelative(whenOf(d)),
  ].join(' · ');
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 pb-2.5 pt-4">
        <h2 className="text-base font-bold">{title}</h2>
        <span className="flex items-center gap-2">
          <Capsule tone={st.color} size="lg">
            {st.label}
          </Capsule>
          <IconAction
            row
            icon={ChevronRight}
            href={`/stock/sales/${d.id}`}
            label={d.status === 'DRAFT' ? 'Verifică și confirmă' : 'Deschide scăderea'}
            title={d.status === 'DRAFT' ? 'Verifică și confirmă scăderea' : 'Deschide scăderea'}
          />
        </span>
      </div>
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <div
            className={`${LINE_GRID} border-t border-border/60 py-2 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground`}
          >
            <span>În raport</span>
            <span>Produs {BRAND_NAME}</span>
            <span>Potrivire</span>
            <span className="text-right">Vândut</span>
            <span className="text-right">Stoc înainte</span>
            <span className="text-right">După</span>
          </div>
          {lines.slice(0, LINE_CAP).map((l) => {
            const mb = matchBadge(l.matchKind, l.matchScore);
            const sold = l.decision === 'DECLINE' ? null : (l.quantity ?? l.quantityReported);
            return (
              <div
                key={l.id}
                className={`${LINE_GRID} border-t border-border/60 py-[11px] text-[13px]`}
              >
                <Truncate text={l.rawName} className="text-muted-foreground" />
                <Truncate text={l.recipeName ?? '—'} className="font-semibold" />
                <span>
                  <Capsule tone={mb.color}>{mb.label}</Capsule>
                </span>
                <span className="text-right font-bold text-[var(--st-red)]">
                  {sold == null ? '—' : `− ${formatQty(sold)}`}
                </span>
                <span className="text-right text-muted-foreground">
                  {l.stockBefore == null ? '—' : formatQty(l.stockBefore)}
                </span>
                <span className="text-right font-bold">
                  {l.stockAfter == null ? '—' : formatQty(l.stockAfter)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {lines.length > LINE_CAP && (
        <div className="border-t border-border/60 px-5 py-3 text-[13px] text-muted-foreground">
          {LINE_CAP} din {lines.length} rânduri ·{' '}
          <Link href={`/stock/sales/${d.id}`} className="font-semibold text-primary">
            Vezi toate
          </Link>
        </div>
      )}
    </section>
  );
}

type SourceChoice = 'EXCEL' | 'MANUAL' | 'WOOCOMMERCE';

const SOURCES: { key: SourceChoice; title: string; hint: string }[] = [
  {
    key: 'EXCEL',
    title: 'Raport Excel / CSV',
    hint: `eBriza, WooCommerce Analytics sau șablonul ${BRAND_NAME}`,
  },
  { key: 'MANUAL', title: 'Manual', hint: 'Scrii produsele și cantitățile vândute' },
  {
    key: 'WOOCOMMERCE',
    title: 'Comenzile de pe site',
    hint: 'Pe un interval — doar ce nu s-a scăzut automat',
  },
];

function NewDeductionPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (d: SalesDeduction) => void;
}) {
  const [locs, setLocs] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [source, setSource] = useState<SourceChoice>('EXCEL');
  const [file, setFile] = useState<File | null>(null);
  const [from, setFrom] = useState(() => isoLocal(new Date(Date.now() - 7 * 86_400_000)));
  const [to, setTo] = useState(() => isoLocal(new Date()));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([locationsApi.list(), orgApi.get().catch(() => null)])
      .then(([all, org]) => {
        const active = all.filter((l) => l.isActive !== false);
        setLocs(active);
        // Same rule as every other operation: the organisation's default location.
        setLocationId((prev) => prev || pickDefaultLocation(active, org)?.id || '');
      })
      .catch(() => toast.error('Nu am putut încărca locațiile'));
  }, []);

  const locName = locs.find((l) => l.id === locationId)?.name;
  const canContinue =
    !!locationId &&
    !busy &&
    (source !== 'EXCEL' || !!file) &&
    (source !== 'WOOCOMMERCE' || (!!from && !!to && from <= to));

  const handleContinue = async () => {
    if (!canContinue) return;
    setBusy(true);
    try {
      let created: SalesDeduction;
      if (source === 'EXCEL' && file) created = await api.fromExcel(file, locationId);
      else if (source === 'WOOCOMMERCE') {
        created = await api.fromWoo(
          locationId,
          new Date(`${from}T00:00:00`).toISOString(),
          new Date(`${to}T23:59:59`).toISOString(),
        );
      } else created = await api.manual(locationId);
      onCreated(created);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Nu am putut porni scăderea');
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const blob = await api.template(locationId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scadere-stoc-${isoLocal(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Nu am putut descărca șablonul');
    }
  };

  return (
    <section className={`${CARD} flex flex-col gap-4 p-5`}>
      <div className="flex items-center justify-between gap-2.5">
        <h2 className="text-base font-bold">Scădere nouă{locName ? ` · ${locName}` : ''}</h2>
        <IconAction
          icon={X}
          word="Închide"
          label="Închide"
          title="Închide fără să salvezi"
          onClick={onClose}
        />
      </div>

      {locs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold uppercase tracking-[0.5px] text-muted-foreground">
            Locație
          </span>
          {locs.map((l) => (
            <Pill key={l.id} on={locationId === l.id} onClick={() => setLocationId(l.id)}>
              {l.name}
            </Pill>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5">
        {SOURCES.map((s) => {
          const on = source === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => setSource(s.key)}
              className={`flex cursor-pointer flex-col gap-1 rounded-[14px] border p-3.5 text-left transition-colors ${
                on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card hover:bg-muted'
              }`}
            >
              <span className="text-sm font-extrabold">{s.title}</span>
              <span className="text-xs leading-[1.35] opacity-80">{s.hint}</span>
            </button>
          );
        })}
      </div>

      {source === 'EXCEL' && (
        <div className="flex flex-wrap items-center gap-2.5">
          <DropZone
            accept=".xlsx,.csv,.xls"
            onFile={setFile}
            icon={FileSpreadsheet}
            label="Încarcă raportul"
            tooltip={`Încarcă .xlsx sau .csv din eBriza / WooCommerce Analytics / șablonul ${BRAND_NAME}`}
            title={file ? file.name : 'Trage raportul aici sau apasă'}
            hint={`.xlsx / .csv · eBriza, WooCommerce Analytics sau șablonul ${BRAND_NAME}`}
            className="min-w-[260px] flex-[1_1_320px]"
          />
          <button
            type="button"
            onClick={downloadTemplate}
            disabled={!locationId}
            aria-label="Descarcă șablonul CSV"
            title="Șablon CSV cu toate produsele (Denumire; Cantitate; U.M.) — completezi doar cantitatea"
            className="inline-flex h-[42px] cursor-pointer items-center gap-2 rounded-[var(--radius-ctl)] border border-border bg-card px-3.5 text-[13px] font-bold hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Șablon CSV
          </button>
        </div>
      )}

      {source === 'WOOCOMMERCE' && (
        <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
          <span className="text-muted-foreground">De la</span>
          <DatePicker
            value={from}
            onChange={setFrom}
            aria-label="De la data"
            className="w-[150px]"
          />
          <span className="text-muted-foreground">până la</span>
          <DatePicker value={to} onChange={setTo} aria-label="Până la data" className="w-[150px]" />
          <span className="min-w-[260px] flex-[1_1_320px] text-xs text-muted-foreground">
            Comenzile ajunse „în procesare” se scad automat la sosire. De aici scazi doar ce n-a
            prins automatizarea; cele scăzute deja sunt sărite.
          </span>
        </div>
      )}

      {source === 'MANUAL' && (
        <span className="text-[13px] text-muted-foreground">
          Adaugi produsele și cantitățile vândute rând cu rând; stocul se verifică în timp ce scrii.
        </span>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          aria-label="Continuă la verificare"
          title={`Continuă: vezi rândurile potrivite cu produsele din ${BRAND_NAME}`}
          className="inline-flex h-[42px] cursor-pointer items-center gap-2 rounded-[var(--radius-ctl)] border-0 bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-pressed disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Continuă
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
