'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { stock as stockApi, recipes as recipesApi, stockExtra } from '@/lib/api';
import type { RecipeStock, RecipeLot, PaginationQuery } from '@/lib/types';
import { recipeTypeLabels } from '@/lib/constants';
import { formatUnitQty, unitQtySortKey } from '@/lib/utils';
import { usePermissions } from '@/contexts/auth-context';
import { PageHeader } from '@/components/page-header';
import { DataTable, type Column } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { Input } from '@/components/ui/input';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import {
  StockAdjustmentDialog,
  type StockAdjustmentPresetItem,
} from '@/components/stock-adjustment-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, CookingPot, Loader2, SlidersHorizontal, Layers, ReceiptText } from 'lucide-react';
import { SALES_DEDUCTIONS_ENABLED } from '@/lib/features';
import { BackLink } from '@/components/back-link';
import { format } from 'date-fns';

/** dd.MM.yyyy — formatul românesc folosit peste tot în stoc. */
const fmtDate = (iso: string) => format(new Date(iso), 'dd.MM.yyyy');

/**
 * Culoarea datei de expirare a unui lot: roșu = expirat, portocaliu = expiră
 * în mai puțin de 3 zile, altfel neutru.
 */
function expiryClass(iso: string): string {
  const expiry = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (expiry < startOfToday) return 'font-semibold text-[var(--st-red)]';
  const days = (expiry.getTime() - startOfToday.getTime()) / 86_400_000;
  if (days < 3) return 'font-semibold text-[var(--st-orange)]';
  return 'text-muted-foreground';
}

export default function RecipeStockPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <RecipeStockContent />
    </Suspense>
  );
}

function RecipeStockContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?recipe=<id> — deep link from the Stoc list (semipreparate/byproduct rows):
  // pre-filter the list to that product. Was silently ignored before, so those
  // clicks landed on the full unfiltered list ("lipsa descriere produs").
  const recipeParam = searchParams.get('recipe');
  const [data, setData] = useState<RecipeStock[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<PaginationQuery>({ page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const { can } = usePermissions();
  // Adjusting produced-product stock is the StockMovement ability, same as raw.
  const canAdjust = can('create', 'StockMovement');
  const [adjustItem, setAdjustItem] = useState<StockAdjustmentPresetItem | null>(null);
  // Stoc diferențiat: loturile (șarjele) produsului — dialog per rând.
  const [lotsFor, setLotsFor] = useState<RecipeStock | null>(null);
  const [lots, setLots] = useState<RecipeLot[] | null>(null);
  const [lotsLoading, setLotsLoading] = useState(false);

  const openLots = (r: RecipeStock) => {
    setLotsFor(r);
    setLots(null);
    setLotsLoading(true);
    // Rândurile sunt agregate pe produs (nu pe locație) — cerem toate loturile
    // și afișăm locația fiecăruia.
    stockExtra
      .recipeLots(r.recipeId)
      .then(setLots)
      .catch(() => setLots([]))
      .finally(() => setLotsLoading(false));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await stockApi.recipeStock(query);
      setData(res.data);
      setTotal(res.total);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  // Resolve the deep-linked recipe id to its name and seed the search filter,
  // so the product the user clicked is actually the one shown. Defensive: if
  // the recipe can't be loaded (deleted, no permission), fall back silently to
  // the full list instead of a broken page.
  useEffect(() => {
    if (!recipeParam) return;
    let cancelled = false;
    recipesApi
      .get(recipeParam)
      .then((r) => {
        if (!cancelled && r?.name) {
          setQuery((q) => ({ ...q, search: r.name, page: 1 }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [recipeParam]);

  const columns: Column<RecipeStock>[] = [
    {
      key: 'name',
      header: 'Produs',
      sortValue: (r) => r.recipeName,
      cell: (r) => <span className="font-semibold">{r.recipeName}</span>,
    },
    {
      key: 'type',
      header: 'Tip',
      sortValue: (r) => recipeTypeLabels[r.type],
      // Design capsules: produs final = blue, semipreparat = purple.
      cell: (r) => (
        <StatusBadge
          label={recipeTypeLabels[r.type]}
          colorClass={r.type === 'SEMIPREPARAT' ? 'st-purple' : 'st-blue'}
        />
      ),
    },
    {
      key: 'stock',
      header: 'Stoc',
      className: 'text-right',
      sortValue: (r) => unitQtySortKey(r.stockCount, r.unit),
      cell: (r) => <span className="font-semibold">{formatUnitQty(r.stockCount, r.unit)}</span>,
    },
    {
      key: 'lots',
      header: '',
      cell: (r) => (
        <div className="flex justify-end">
          <TutorialAnchor id="stock.finishedGoods.lots">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                // Rândul navighează la fișa produsului — deschiderea loturilor
                // nu trebuie să declanșeze și navigarea.
                e.stopPropagation();
                openLots(r);
              }}
              title={`Loturile produsului ${r.recipeName}`}
              aria-label={`Loturile produsului ${r.recipeName}`}
            >
              <Layers className="h-4 w-4" />
              Loturi
            </Button>
          </TutorialAnchor>
        </div>
      ),
    },
    ...(canAdjust
      ? [
          {
            key: 'actions',
            header: '',
            cell: (r: RecipeStock) => (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    // Rândul navighează la fișa produsului — ajustarea nu trebuie
                    // să declanșeze și navigarea.
                    e.stopPropagation();
                    setAdjustItem({
                      kind: 'recipe',
                      id: r.recipeId,
                      title: r.recipeName,
                      unit: r.unit,
                      stockCount: r.stockCount,
                    });
                  }}
                  title="Ajustare stoc"
                  aria-label="Ajustare stoc"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </div>
            ),
          } satisfies Column<RecipeStock>,
        ]
      : []),
  ];

  return (
    <div className="space-y-3.5">
      <BackLink href="/stock" label="Stoc" />
      <PageHeader
        title="Stoc produse"
        description="Produse finite și semipreparate"
        actions={
          SALES_DEDUCTIONS_ENABLED && canAdjust ? (
            <Button variant="outline" onClick={() => router.push('/stock/sales')}>
              <ReceiptText className="mr-1.5 h-4 w-4" />
              Scade vânzări
            </Button>
          ) : undefined
        }
      />
      <div className="relative w-full max-w-[280px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Caută..."
          className="pl-9"
          value={query.search || ''}
          onChange={(e) => setQuery({ ...query, search: e.target.value, page: 1 })}
        />
      </div>
      <TutorialAnchor id="stock.finishedGoods.overview">
        {data.length === 0 && !loading ? (
          <EmptyState icon={CookingPot} title="Niciun produs în stoc" />
        ) : (
          <DataTable
            columns={columns}
            data={data}
            page={query.page}
            total={total}
            limit={query.limit}
            onPageChange={(p) => setQuery({ ...query, page: p })}
            isLoading={loading}
            getRowKey={(r) => r.recipeId}
            // Fișa produsului (componente, cost, descriere) — până acum produsele
            // finite nu aveau nicio pagină de detaliu accesibilă din stoc.
            onRowClick={(r) => router.push(`/recipes/${r.recipeId}`)}
          />
        )}
      </TutorialAnchor>

      <StockAdjustmentDialog
        open={adjustItem !== null}
        onOpenChange={(o) => !o && setAdjustItem(null)}
        presetItem={adjustItem ?? undefined}
        onSuccess={load}
      />

      {/* Stoc diferențiat: loturile produsului, cu rămas/total și expirare. */}
      <Dialog open={lotsFor !== null} onOpenChange={(o) => !o && setLotsFor(null)}>
        <TutorialAnchor id="stock.finishedGoods.fifo">
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Loturi — {lotsFor?.recipeName}</DialogTitle>
            </DialogHeader>
            {lotsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !lots || lots.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Fără loturi — stoc dinaintea versiunii 1.21.
              </p>
            ) : (
              <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-0.5">
                {lots.map((lot) => (
                  <div
                    key={lot.id}
                    className="rounded-[var(--radius-ctl)] bg-muted px-3.5 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold">{lot.lotNumber}</span>
                      <span className="shrink-0 font-semibold">
                        {formatUnitQty(lot.remainingQuantity, lotsFor?.unit ?? '')}
                        <span className="font-normal text-muted-foreground">
                          {' '}
                          / {formatUnitQty(lot.quantity, lotsFor?.unit ?? '')}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-xs">
                      <span className="text-muted-foreground">
                        Produs la {fmtDate(lot.producedAt)}
                        {lot.locationName ? ` · ${lot.locationName}` : ''}
                      </span>
                      {lot.expiryDate ? (
                        <span className={expiryClass(lot.expiryDate)}>
                          Expiră la {fmtDate(lot.expiryDate)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Fără dată de expirare</span>
                      )}
                    </div>
                  </div>
                ))}
                {/* ClickUp "Stoc diferentiat nume": total la finalul listei */}
                <div className="flex items-center justify-between rounded-[var(--radius-ctl)] border border-border px-3.5 py-2.5 text-sm font-semibold">
                  <span>
                    Total · {lots.length} {lots.length === 1 ? 'lot' : 'loturi'}
                  </span>
                  <span>
                    {formatUnitQty(
                      lots.reduce((s, l) => s + l.remainingQuantity, 0),
                      lotsFor?.unit ?? '',
                    )}
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      /{' '}
                      {formatUnitQty(
                        lots.reduce((s, l) => s + l.quantity, 0),
                        lotsFor?.unit ?? '',
                      )}
                    </span>
                  </span>
                </div>
              </div>
            )}
          </DialogContent>
        </TutorialAnchor>
      </Dialog>
    </div>
  );
}
