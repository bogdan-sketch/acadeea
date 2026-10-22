'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { tasks as tasksApi } from '@/lib/api';
import type { ShoppingListItem } from '@/lib/types';
import { formatUnitQty } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Check, ChevronLeft, Share, ShoppingCart } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';

/** Deficit line handed over by Necesar MP (sessionStorage `shopping-list:plan`). */
interface PlanShoppingItem {
  rawMaterialId: string;
  title: string;
  deficit: number;
  unit: string;
  supplierName: string | null;
}

export default function ShoppingListPage() {
  const router = useRouter();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  // The "De cumpărat" column of the last calculated requirements plan —
  // present only when the user arrives from Necesar MP with a computed plan.
  const [planItems, setPlanItems] = useState<PlanShoppingItem[]>([]);
  const [planDate, setPlanDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Locally checked-off items (design isShopping: tap to strike through).
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Set on mount from the one-shot provenance marker (see goBack).
  const fromRequirements = useRef(false);

  useEffect(() => {
    tasksApi
      .shoppingList()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
    try {
      // Provenance: was this visit initiated from Necesar MP? (one-shot)
      fromRequirements.current = sessionStorage.getItem('shopping-list:from-requirements') === '1';
      sessionStorage.removeItem('shopping-list:from-requirements');
      const raw = sessionStorage.getItem('shopping-list:plan');
      // One-shot handoff: consume it so a later DIRECT visit to this page
      // doesn't resurrect a stale plan (state keeps it alive for this view).
      sessionStorage.removeItem('shopping-list:plan');
      if (raw) {
        const parsed = JSON.parse(raw) as { generatedAt: string; items: PlanShoppingItem[] };
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          setPlanItems(parsed.items);
          setPlanDate(parsed.generatedAt);
        }
      }
    } catch {
      // corrupt/unavailable storage — the blocked-task list still renders
    }
  }, []);

  // Back re-arms the requirements keep-marker so Necesar MP restores its plan
  // on the round-trip (requirements → shopping → BACK), while reaching
  // requirements any other way still starts fresh. Local on purpose —
  // BackLink stays generic.
  const goBack = () => {
    try {
      // Re-arm the requirements keep-marker ONLY for the genuine round-trip —
      // arriving from Tasks/Stoc and going back must not restore a stale plan
      // on a later Necesar MP visit (re-review finding, pr#26).
      if (fromRequirements.current) sessionStorage.setItem('requirements:keep', '1');
    } catch {
      // storage unavailable — plain back still works
    }
    router.back();
  };

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // "Trimite lista" — native share when available, otherwise clipboard.
  const shareList = async () => {
    const lines: string[] = ['Listă de cumpărături:'];
    if (planItems.length > 0) {
      lines.push('Din planul de producție:');
      lines.push(
        ...planItems.map(
          (i) =>
            `- ${i.title}: ${formatUnitQty(i.deficit, i.unit)}${
              i.supplierName ? ` (${i.supplierName})` : ''
            }`,
        ),
      );
    }
    if (items.length > 0) {
      if (planItems.length > 0) lines.push('Din taskuri blocate:');
      lines.push(
        ...items.map((i) => `- ${i.rawMaterialTitle}: ${formatUnitQty(i.shortage, i.unit)}`),
      );
    }
    const text = lines.join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Listă copiată în clipboard');
      }
    } catch {
      // Share sheet dismissed — nothing to report.
    }
  };

  const hasAnything = items.length > 0 || planItems.length > 0;

  const renderRow = (
    id: string,
    title: string,
    subtitle: string,
    qty: number,
    unit: string, // UnitType enum value — formatted (and up-converted) at render
    first: boolean,
  ) => {
    const isChecked = checked.has(id);
    return (
      <button
        key={id}
        type="button"
        onClick={() => toggle(id)}
        className={`flex w-full items-center gap-[11px] px-6 py-[11px] text-left transition-colors hover:bg-muted/60 ${
          first ? '' : 'border-t border-border'
        }`}
      >
        {isChecked ? (
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-primary">
            <Check className="h-3.5 w-3.5 text-primary-foreground" />
          </span>
        ) : (
          <span className="h-[22px] w-[22px] shrink-0 rounded-md border-[1.5px] border-muted-foreground/40 bg-card" />
        )}
        <div className="min-w-0 flex-1">
          <div
            className={`text-[13.5px] font-semibold ${
              isChecked ? 'text-muted-foreground line-through' : ''
            }`}
          >
            {title}
          </div>
          <div className="truncate text-[11.5px] text-muted-foreground">{subtitle}</div>
        </div>
        <span
          className={`shrink-0 text-[13px] font-bold ${isChecked ? 'text-muted-foreground' : ''}`}
        >
          {formatUnitQty(qty, unit)}
        </span>
      </button>
    );
  };

  return (
    <div>
      {/* Back link — muted 13px semibold, hover accent (design detail head) */}
      <button
        type="button"
        onClick={goBack}
        className="mb-2.5 inline-flex cursor-pointer items-center gap-0.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronLeft className="h-[17px] w-[17px]" />
        Înapoi
      </button>
      <PageHeader
        title="Listă de cumpărături"
        description={
          planItems.length > 0
            ? 'Din planul de producție + taskuri blocate'
            : 'Generată din taskuri blocate'
        }
        actions={
          hasAnything ? (
            <Button
              size="icon-sm"
              onClick={shareList}
              title="Trimite lista"
              aria-label="Trimite lista"
            >
              <Share className="h-4 w-4" />
            </Button>
          ) : undefined
        }
      />

      {loading && planItems.length === 0 ? (
        <p className="text-muted-foreground">Se încarcă...</p>
      ) : !hasAnything ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nimic de cumpărat"
          description="Nu sunt lipsuri în taskurile curente. Calculează un Necesar MP ca să generezi o listă dintr-un plan de producție."
        />
      ) : (
        <div className="max-w-[640px] space-y-4">
          {planItems.length > 0 && (
            <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
              <div className="px-6 pb-2.5 pt-4 text-[11px] font-semibold uppercase tracking-[.5px] text-muted-foreground">
                Din planul de producție
                {planDate ? ` · ${format(new Date(planDate), 'd MMM', { locale: ro })}` : ''}
              </div>
              {planItems.map((item, i) =>
                renderRow(
                  `plan:${item.rawMaterialId}`,
                  item.title,
                  item.supplierName ? `furnizor: ${item.supplierName}` : 'fără furnizor',
                  item.deficit,
                  item.unit,
                  i === 0,
                ),
              )}
            </div>
          )}

          {items.length > 0 && (
            <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
              {planItems.length > 0 && (
                <div className="px-6 pb-2.5 pt-4 text-[11px] font-semibold uppercase tracking-[.5px] text-muted-foreground">
                  Din taskuri blocate
                </div>
              )}
              {items.map((item, i) => {
                const blockers = item.blockedTasks?.map((t) => t.taskName).filter(Boolean) ?? [];
                const subtitle =
                  blockers.length > 0
                    ? `blochează: ${blockers.slice(0, 3).join(', ')}`
                    : `disponibil ${formatUnitQty(item.totalAvailable, item.unit)} · necesar ${formatUnitQty(item.totalNeeded, item.unit)}`;
                return renderRow(
                  item.rawMaterialId,
                  item.rawMaterialTitle,
                  subtitle,
                  item.shortage,
                  item.unit,
                  i === 0 && planItems.length === 0,
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
