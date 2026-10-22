'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { stock as stockApi, stockExtra } from '@/lib/api';
import type { StockReviewChange, StockReviewResult } from '@/lib/types';
import { formatQty } from '@/lib/utils';
import { usePermissions } from '@/contexts/auth-context';
import { BackLink } from '@/components/back-link';
import { EmptyState } from '@/components/empty-state';
import { toast } from 'sonner';
import {
  Check,
  Clock,
  Download,
  Loader2,
  ShieldAlert,
  TrendingUp,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import { CARD, DropZone, IconAction, PageHead } from '../_ui/parts';
import { fmtRelative } from '../_ui/dates';

const FIELD_LABELS: Record<StockReviewChange['field'], string> = {
  quantity: 'Cantitate',
  purchasePrice: 'Preț achiziție',
  expiryDate: 'Data expirare',
  supplier: 'Furnizor',
};

const SHEETS = ['Materii prime', 'Consumabile', 'Semipreparate', 'Produse finite'];
const EDITABLE = ['Cantitate', 'Preț', 'Data expirare', 'Furnizor'];

function cellValue(c: StockReviewChange, v: number | string | null): string {
  if (v == null || v === '') return '—';
  if (c.field === 'quantity' || c.field === 'purchasePrice') return formatQty(Number(v));
  if (c.field === 'expiryDate') {
    const [y, m, d] = String(v).split('-');
    return y && m && d ? `${d}.${m}.${y}` : String(v);
  }
  return String(v);
}

const ROW_GRID =
  'grid min-w-[760px] grid-cols-[120px_minmax(0,1.4fr)_minmax(0,1.3fr)_110px_100px_100px] items-center gap-3 px-5';

function StepHead({ n, title }: { n: number; title: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent font-serif text-[15px] font-semibold text-primary-text">
        {n}
      </span>
      <span className="text-[15px] font-bold">{title}</span>
    </span>
  );
}

/**
 * Revizie stocuri: ONE Excel with everything the app keeps as stock, one row
 * per lot, and the way back — upload the edited (possibly partial) file and only
 * the rows found in it are adjusted. The report of what changed stays on screen
 * after applying.
 */
export default function StockReviewPage() {
  const { can } = usePermissions();
  const isAdmin = can('manage', 'all');
  const [exporting, setExporting] = useState(false);
  const [reading, setReading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StockReviewResult | null>(null);
  const [report, setReport] = useState<StockReviewResult | null>(null);
  const [appliedAt, setAppliedAt] = useState<Date | null>(null);
  // Latest review = newest movement whose note mentions "Revizie".
  const [last, setLast] = useState<{ at: Date; by: string | null } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    stockApi
      .movements({ search: 'Revizie', page: 1, limit: 1 })
      .then((r) => {
        const m = r.data[0];
        if (m && /revizie/i.test(m.referenceNote ?? '')) {
          setLast({ at: new Date(m.createdAt), by: m.createdByName ?? null });
        }
      })
      .catch(() => {});
  }, [isAdmin, report]);

  const today = new Date().toISOString().slice(0, 10);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await stockExtra.reviewExport();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `revizie-stocuri-${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success('Revizia a fost exportată');
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Exportul a eșuat');
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (f: File) => {
    setReading(true);
    setReport(null);
    try {
      const result = await stockExtra.reviewImport(f, true);
      setFile(f);
      setPreview(result);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Fișierul nu a putut fi citit');
    } finally {
      setReading(false);
    }
  };

  const handleApply = async () => {
    if (!file) return;
    setApplying(true);
    try {
      const applied = await stockExtra.reviewImport(file, false);
      setReport(applied);
      setAppliedAt(new Date());
      setPreview(null);
      setFile(null);
      toast.success('Revizia a fost aplicată', {
        description: `${applied.changes.length} ${applied.changes.length === 1 ? 'modificare' : 'modificări'}`,
      });
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Eroare la aplicarea reviziei');
    } finally {
      setApplying(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-3.5">
        <BackLink href="/stock" label="Stoc" />
        <EmptyState icon={ShieldAlert} title="Doar administratorii pot face revizia stocurilor" />
      </div>
    );
  }

  const meta = last
    ? `Ultima revizie: ${fmtRelative(last.at)}${last.by ? ` · ${last.by}` : ''}`
    : 'Inventar pe loturi: exporți, corectezi în Excel, încarci';

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/stock" label="Stoc" />
      <PageHead title="Revizie stocuri" meta={meta}>
        <IconAction
          icon={Clock}
          href="/stock/movements?search=Revizie"
          word="Istoric"
          label="Istoricul reviziilor"
          title="Reviziile anterioare, în jurnalul de mișcări"
        />
      </PageHead>

      <ol className="m-0 grid list-none grid-cols-1 items-stretch gap-3.5 p-0 lg:grid-cols-3">
        <li className="rounded-[var(--radius-card)] border border-border bg-card flex flex-col gap-3.5 p-5">
          <StepHead n={1} title="Exportă stocul" />
          <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">
            Un Excel cu patru foi: {SHEETS.join(', ')}. Fiecare lot e un rând, cu furnizor, factură,
            data expirării, preț și cantitate.
          </p>
          <div className="mt-auto pt-1">
            <IconAction
              icon={exporting ? Loader2 : Download}
              spinning={exporting}
              disabled={exporting}
              tone="primary"
              word="Exportă Excel"
              label="Exportă Excel"
              title={`Descarcă revizie-stocuri-${today}.xlsx`}
              onClick={handleExport}
            />
          </div>
        </li>

        <li className="rounded-[var(--radius-card)] border border-border bg-card flex flex-col gap-3.5 p-5">
          <StepHead n={2} title="Corectează în Excel" />
          <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">
            Scrii cantitatea numărată. Rândurile șterse din fișier rămân neschimbate în aplicație.
            Nu modifica coloanele „ID rând” și „Tip”.
          </p>
          <div className="mt-auto flex flex-col gap-2 pt-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground">
              Poți modifica
            </span>
            <span className="flex flex-wrap gap-1.5">
              {EDITABLE.map((e) => (
                <span
                  key={e}
                  className="inline-flex h-7 items-center rounded-full border border-border bg-background px-2.5 text-[12px] font-semibold"
                >
                  {e}
                </span>
              ))}
            </span>
          </div>
        </li>

        <li className="rounded-[var(--radius-card)] border border-border bg-card flex flex-col gap-3.5 p-5">
          <StepHead n={3} title="Încarcă și verifică" />
          <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">
            Vezi întâi toate diferențele. Nimic nu se schimbă până nu apeși „Aplică”.
          </p>
          <div className="mt-auto">
            <DropZone
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onFile={handleFile}
              busy={reading}
              icon={Upload}
              label="Încarcă fișierul Excel corectat"
              tooltip="Încarcă .xlsx — vezi întâi diferențele, nimic nu se modifică încă"
              title="Trage fișierul aici sau apasă"
              hint=".xlsx de la pasul 1, chiar și parțial"
            />
          </div>
        </li>
      </ol>

      {preview && file && (
        <ReviewResult
          title="Verificare — nimic nu s-a modificat încă"
          subtitle={`Fișier: ${file.name} · ${preview.rowsRead} rânduri citite`}
          result={preview}
          actions={
            <div className="flex gap-2">
              <IconAction
                icon={X}
                word="Renunță"
                label="Renunță la import"
                title="Renunță, nimic nu se modifică"
                disabled={applying}
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                }}
              />
              <button
                type="button"
                onClick={handleApply}
                disabled={applying || preview.changes.length === 0}
                aria-label="Aplică modificările"
                title={`Aplică cele ${preview.changes.length} modificări — fiecare cantitate intră în Mișcări ca „Revizie stocuri”`}
                className="inline-flex h-[42px] cursor-pointer items-center gap-2 rounded-[var(--radius-ctl)] border-0 bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-pressed disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applying ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                ) : (
                  <Check className="h-[18px] w-[18px]" />
                )}
                Aplică modificările
              </button>
            </div>
          }
        />
      )}

      {report && (
        <ReviewResult
          title="Raport — ce s-a schimbat"
          subtitle={`Aplicat ${appliedAt ? fmtRelative(appliedAt) : ''} · fiecare cantitate apare și în Mișcări ca „Revizie stocuri”`}
          result={report}
          applied
          actions={
            <div className="flex gap-2">
              <IconAction
                icon={TrendingUp}
                href="/stock/movements?search=Revizie"
                word="Mișcări"
                label="Vezi în mișcări"
                title="Ajustările, în jurnalul de mișcări"
              />
              <button
                type="button"
                onClick={() => setReport(null)}
                aria-label="Revizie nouă"
                title="Pornește o revizie nouă"
                className="inline-flex h-[42px] cursor-pointer items-center rounded-[var(--radius-ctl)] border border-border bg-card px-4 text-sm font-bold hover:bg-muted"
              >
                Revizie nouă
              </button>
            </div>
          }
        />
      )}
    </div>
  );
}

function ReviewResult({
  title,
  subtitle,
  result,
  actions,
  applied,
}: {
  title: string;
  subtitle: string;
  result: StockReviewResult;
  actions?: ReactNode;
  applied?: boolean;
}) {
  const n = result.unknownIds.length;
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-bold">{title}</h2>
          <span className="text-[13px] text-muted-foreground">{subtitle}</span>
        </div>
        {actions}
      </div>

      {n > 0 && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-[10px] bg-[var(--st-orange-bg)] px-3 py-2.5 text-xs text-[var(--st-orange)]">
          <TriangleAlert className="mt-px h-3.5 w-3.5 flex-none" />
          <span>
            {n} {n === 1 ? 'rând nu mai există' : 'rânduri nu mai există'} în aplicație (lot
            consumat sau produs șters) și {n === 1 ? 'a fost ignorat' : 'au fost ignorate'}.
          </span>
        </div>
      )}

      {result.changes.length === 0 ? (
        <p className="border-t border-border/60 px-5 py-8 text-center text-sm text-muted-foreground">
          Nicio diferență — stocul e deja la fel ca în fișier.
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <div
            className={`${ROW_GRID} border-t border-border/60 py-2 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground`}
          >
            <span>Foaie</span>
            <span>Produs</span>
            <span>Lot / locație</span>
            <span>Câmp</span>
            <span className="text-right">Din</span>
            <span className="text-right">În</span>
          </div>
          {result.changes.map((c, i) => (
            <div
              key={`${c.id}-${c.field}-${i}`}
              className={`${ROW_GRID} border-t border-border/60 py-[11px] text-[13px]`}
            >
              <span className="text-xs text-muted-foreground">{c.sheet}</span>
              <span className="truncate font-semibold">{c.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[
                  c.kind === 'LOT' ? (c.lotNumber ? `lot ${c.lotNumber}` : 'lot') : 'fără lot',
                  c.location,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="text-muted-foreground">{FIELD_LABELS[c.field]}</span>
              <span className="text-right text-muted-foreground line-through">
                {cellValue(c, c.from)}
              </span>
              <span className={`text-right font-bold ${applied ? 'text-[var(--st-green)]' : ''}`}>
                {cellValue(c, c.to)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border/60 px-5 py-3 text-[13px] text-muted-foreground">
        {result.changes.length} {result.changes.length === 1 ? 'modificare' : 'modificări'}
        {` · ${result.unchanged} ${result.unchanged === 1 ? 'rând neschimbat' : 'rânduri neschimbate'}`}
        {` · ${result.rowsRead} rânduri citite`}
      </div>
    </section>
  );
}
