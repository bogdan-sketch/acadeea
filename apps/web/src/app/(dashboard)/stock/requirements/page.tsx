'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recipes as recipesApi, stock as stockApi } from '@/lib/api';
import type { Recipe, RequirementsPlanResult } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { ChoiceListField } from '@/components/choice-list';
import { Truncate } from '@/components/truncate';
import { IconAction, PageHead } from '@/app/(dashboard)/stock/_ui/parts';
import { BackLink } from '@/components/back-link';
import { Plus, Trash2, Download, ListChecks, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { formatUnitQty } from '@/lib/utils';
import { unitTypeLabels } from '@/lib/constants';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';

interface PlanRow {
  recipeId: string;
  quantity: number;
}

export default function RequirementsPlanPage() {
  const router = useRouter();
  const [recipeList, setRecipeList] = useState<Recipe[]>([]);
  const [rows, setRows] = useState<PlanRow[]>([{ recipeId: '', quantity: 0 }]);
  const [result, setResult] = useState<RequirementsPlanResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    recipesApi
      .list({ limit: 200 })
      .then((r) => setRecipeList(r.data))
      .catch(() => toast.error('Nu s-au putut încărca rețetele'));
  }, []);

  // The plan survives ONLY the shopping-list round-trip: the shopping list's
  // BACK control arms a one-shot keep-marker just before router.back();
  // mounting with the marker restores the plan and consumes it, mounting
  // without it clears the stored state — so arriving from any other route
  // starts with a fresh form (user's explicit ask).
  // `restored` gates the persist effect: without it, StrictMode's double
  // effect pass writes the INITIAL state over the saved one between the two
  // restore runs, silently clearing the plan.
  const restored = useRef(false);
  useEffect(() => {
    try {
      const keep = sessionStorage.getItem('requirements:keep') === '1';
      sessionStorage.removeItem('requirements:keep');
      if (keep) {
        const raw = sessionStorage.getItem('requirements:state');
        if (raw) {
          const saved = JSON.parse(raw) as {
            rows: PlanRow[];
            result: RequirementsPlanResult | null;
          };
          if (Array.isArray(saved.rows) && saved.rows.some((r) => r.recipeId)) setRows(saved.rows);
          if (saved.result) setResult(saved.result);
        }
      } else {
        sessionStorage.removeItem('requirements:state');
      }
    } catch {
      // corrupt storage — start clean
    }
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem('requirements:state', JSON.stringify({ rows, result }));
    } catch {
      // best-effort
    }
  }, [rows, result]);

  const validItems = rows.filter((r) => r.recipeId && r.quantity > 0);

  // Materials the calculated plan says we must BUY (the red "De cumpărat" column).
  const deficits = result?.requirements.filter((r) => r.deficit > 0) ?? [];

  // "Listă cumpărături": with a calculated plan, hand its deficits to the
  // shopping-list page (sessionStorage — survives the client navigation);
  // without one, the page still shows the blocked-task shortages.
  // The keep-marker is armed by the SHOPPING LIST's back control (not here):
  // arming on the way forward would leave it set when the user leaves the
  // shopping list elsewhere, resurrecting a stale plan on the next visit.
  const goToShoppingList = () => {
    try {
      // Provenance marker: shopping-list's back control re-arms the keep
      // marker ONLY when this visit actually came from Necesar MP — a back
      // from Tasks/Stoc must not resurrect a stale plan here.
      sessionStorage.setItem('shopping-list:from-requirements', '1');
      if (deficits.length > 0) {
        sessionStorage.setItem(
          'shopping-list:plan',
          JSON.stringify({
            generatedAt: new Date().toISOString(),
            items: deficits.map((d) => ({
              rawMaterialId: d.rawMaterialId,
              title: d.title,
              deficit: d.deficit,
              unit: d.unit,
              supplierName: d.supplierName,
            })),
          }),
        );
      } else {
        sessionStorage.removeItem('shopping-list:plan');
      }
    } catch {
      // storage unavailable — plain navigation still works
    }
    router.push('/tasks/shopping-list');
  };

  const updateRow = (index: number, patch: Partial<PlanRow>) => {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const handleCompute = async () => {
    setComputing(true);
    try {
      const res = await stockApi.requirementsPlan(validItems);
      setResult(res);
    } catch {
      toast.error('Eroare la calcularea necesarului');
    } finally {
      setComputing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await stockApi.requirementsPlanExport(validItems);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Ziua exportului în nume — exporturile din zile diferite nu se mai
      // suprascriu/duplichează ca "necesar-mp (3).xlsx".
      a.download = `necesar-mp-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Eroare la export');
    } finally {
      setExporting(false);
    }
  };

  const recipeOptions = recipeList.map((r) => ({
    value: r.id,
    label: r.name,
    hint: r.category ?? undefined,
    meta: unitTypeLabels[r.unit] ?? r.unit,
  }));

  return (
    <div className="space-y-5">
      <div>
        <BackLink href="/stock" label="Stoc" />
        <PageHead
          title="Necesar materii prime"
          meta={`Plan de producție · ${format(new Date(), 'EEEE d MMMM', { locale: ro })}`}
        >
          <IconAction
            icon={Download}
            word="Excel"
            label="Export Excel"
            title={
              validItems.length === 0
                ? 'Adaugă produse în plan ca să poți exporta'
                : 'Descarcă necesarul calculat ca fișier Excel'
            }
            spinning={exporting}
            disabled={exporting || validItems.length === 0}
            onClick={handleExport}
          />
          <IconAction
            icon={ListChecks}
            word={deficits.length > 0 ? `Cumpărături (${deficits.length})` : 'Cumpărături'}
            label="Listă cumpărături"
            title={
              result !== null && deficits.length === 0
                ? 'Ai în stoc tot ce îți trebuie pentru ce ți-ai propus să faci — nimic de cumpărat'
                : deficits.length > 0
                  ? `Generează lista de cumpărături din planul calculat (${deficits.length} materiale lipsă)`
                  : 'Deschide lista de cumpărături (lipsurile din taskurile blocate); calculează un plan ca să adaugi deficitul lui'
            }
            disabled={result !== null && deficits.length === 0}
            onClick={goToShoppingList}
          />
        </PageHead>
      </div>

      {/* Design (isNecesar): 1fr / 1.5fr — planned products left, requirements right.
          Grid default (stretch): both cards share the row height. */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <div className="flex flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
          <div className="px-6 pb-4 pt-5 text-[15px] font-bold">Produse planificate</div>
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2 border-t border-border px-6 py-2">
              <div className="min-w-0 flex-1">
                <ChoiceListField
                  title="Alege produsul"
                  placeholder="Selectează produsul"
                  searchPlaceholder="Caută produs…"
                  emptyText="Niciun produs găsit."
                  aria-label={`Produsul ${i + 1}`}
                  value={row.recipeId}
                  options={recipeOptions}
                  onChange={(v) => updateRow(i, { recipeId: v })}
                />
              </div>
              {/* Cantitatea e în UNITATEA REȚETEI (g/buc/kg…) — fără sufix,
                  "12" la o rețetă cu randament în grame înseamnă 12 g, nu 12
                  șarje, și iese un necesar absurd de mic. */}
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Cant."
                  title={(() => {
                    const r = recipeList.find((x) => x.id === row.recipeId);
                    return r
                      ? `Cantitate în ${unitTypeLabels[r.unit] || r.unit} (unitatea rețetei)`
                      : 'Cantitate în unitatea rețetei';
                  })()}
                  className="w-28 pr-9 text-right"
                  value={row.quantity || ''}
                  onChange={(e) => updateRow(i, { quantity: parseFloat(e.target.value) || 0 })}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-muted-foreground">
                  {(() => {
                    const r = recipeList.find((x) => x.id === row.recipeId);
                    return r ? unitTypeLabels[r.unit] || r.unit.toLowerCase() : '';
                  })()}
                </span>
              </div>
              <IconAction
                row
                icon={Trash2}
                label="Șterge produsul din plan"
                disabled={rows.length === 1}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              />
            </div>
          ))}

          <div className="border-t border-border px-6 py-3">
            <IconAction
              icon={Plus}
              word="Produs"
              label="Adaugă produs"
              title="Adaugă încă un rând de produs în plan"
              onClick={() => setRows([...rows, { recipeId: '', quantity: 0 }])}
            />
          </div>

          <div className="mt-auto flex justify-end border-t border-border px-6 pb-4 pt-3">
            <IconAction
              icon={Calculator}
              word="Calculează"
              tone="primary"
              label="Calculează necesarul"
              title={
                validItems.length === 0
                  ? 'Alege cel puțin un produs cu cantitate'
                  : 'Calculează materiile prime necesare pentru planul de mai sus'
              }
              spinning={computing}
              disabled={computing || validItems.length === 0}
              onClick={handleCompute}
            />
          </div>
        </div>

        {result ? (
          <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
            {/* Design .thead: surface-2 uppercase header band */}
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] gap-x-3.5 bg-muted px-6 pb-3 pt-3.5 text-[11px] font-semibold uppercase tracking-[.5px] text-muted-foreground">
              <span>Material</span>
              <span>Furnizor</span>
              <span className="text-right">Necesar</span>
              <span className="text-right">Stoc</span>
              <span className="text-right">Disponibil</span>
              <span className="text-right">De cumpărat</span>
            </div>
            {result.requirements.map((r) => (
              <div
                key={`${r.rawMaterialId}-${r.unit}`}
                className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] items-center gap-x-3.5 border-t border-border px-6 py-3 text-[13px]"
              >
                <Truncate text={r.title} className="font-semibold" />
                <Truncate text={r.supplierName ?? '—'} className="text-muted-foreground" />
                <span className="text-right">{formatUnitQty(r.needed, r.unit)}</span>
                <span className="text-right">{formatUnitQty(r.currentStock, r.unit)}</span>
                <span className="text-right">{formatUnitQty(r.available, r.unit)}</span>
                {r.deficit > 0 ? (
                  <span className="text-right font-bold text-[var(--st-red)]">
                    {formatUnitQty(r.deficit, r.unit)}
                  </span>
                ) : (
                  <span className="text-right font-semibold text-[var(--st-green)]">—</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius)] border border-border bg-card px-6 py-12 shadow-(--shadow-card-sm)">
            <Calculator className="h-[34px] w-[34px] text-muted-foreground/50" />
            <div className="text-[15px] font-semibold">Niciun calcul încă</div>
            <div className="text-center text-[12.5px] text-muted-foreground">
              Adaugă produsele și apasă „Calculează necesarul&rdquo;
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
