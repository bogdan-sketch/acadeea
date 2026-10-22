'use client';

import { useEffect, useState, useCallback } from 'react';
import { pricing as pricingApi, recipes as recipesApi } from '@/lib/api';
import type { PriceHistoryEntry, RecipeMargin, Recipe, RecipeCost } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { DataTable, type Column } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Banknote, Check, Loader2 } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { StatusBadge } from '@/components/status-badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { toast } from 'sonner';
import { formatMoney, formatPercent, formatUnitQty } from '@/lib/utils';
import { priceUnitLabel } from '@/lib/constants';
import type { UnitType } from '@horae/shared-types';

const priceTypeLabels: Record<string, string> = {
  PURCHASE: 'Achiziție',
  SELLING: 'Vânzare',
  COST: 'Cost manual',
};

export default function PricingPage() {
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [margins, setMargins] = useState<RecipeMargin[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingMargins, setLoadingMargins] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  // Cost manual (manoperă etc.) — editare inline, gol = revine la costul calculat.
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [editCost, setEditCost] = useState('');
  const [savingCost, setSavingCost] = useState(false);
  // Modal cu componentele/costurile rețetei (click pe nume).
  const [breakdown, setBreakdown] = useState<RecipeCost | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await pricingApi.history();
      setHistory(res);
    } catch {
      //
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadMargins = useCallback(async () => {
    setLoadingMargins(true);
    try {
      const recipesRes = await recipesApi.list({ limit: 100 });
      setRecipes(recipesRes.data);
      const marginResults = await Promise.all(
        recipesRes.data.map((r) =>
          pricingApi.recipeMargin(r.id).catch(
            () =>
              ({
                recipeId: r.id,
                recipeName: r.name,
              }) as RecipeMargin,
          ),
        ),
      );
      setMargins(marginResults);
    } catch {
      //
    } finally {
      setLoadingMargins(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadMargins();
  }, [loadHistory, loadMargins]);

  const handleSavePrice = async (recipeId: string) => {
    const price = parseFloat(editPrice);
    if (isNaN(price) || price < 0) return;
    setSavingPrice(true);
    try {
      await pricingApi.setSellingPrice(recipeId, price);
      toast.success('Preț actualizat');
      setEditingId(null);
      loadMargins();
      loadHistory();
    } catch {
      toast.error('Eroare la salvare');
    } finally {
      setSavingPrice(false);
    }
  };

  const handleSaveCost = async (recipeId: string) => {
    // Gol = șterge override-ul (revine la costul calculat din ingrediente).
    const raw = editCost.trim();
    const value = raw === '' ? null : parseFloat(raw);
    if (value !== null && (isNaN(value) || value < 0)) return;
    setSavingCost(true);
    try {
      await pricingApi.setManualCost(recipeId, value);
      toast.success(
        value === null ? 'Cost manual șters — folosim costul calculat' : 'Cost manual salvat',
      );
      setEditingCostId(null);
      loadMargins();
      loadHistory();
    } catch {
      toast.error('Eroare la salvare');
    } finally {
      setSavingCost(false);
    }
  };

  const openBreakdown = async (recipeId: string) => {
    setBreakdownOpen(true);
    setBreakdownLoading(true);
    try {
      setBreakdown(await recipesApi.cost(recipeId));
    } catch {
      toast.error('Nu am putut încărca componentele rețetei');
      setBreakdownOpen(false);
    } finally {
      setBreakdownLoading(false);
    }
  };

  const historyColumns: Column<PriceHistoryEntry>[] = [
    {
      key: 'item',
      header: 'Produs',
      sortValue: (e) => e.itemName ?? '',
      cell: (e) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{e.itemName ?? '—'}</div>
          {e.itemSubtitle && (
            <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {e.itemSubtitle}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Data',
      sortValue: (e) => e.createdAt,
      cell: (e) => format(new Date(e.createdAt), 'dd MMM yyyy', { locale: ro }),
    },
    {
      key: 'priceType',
      header: 'Tip',
      sortValue: (e) => priceTypeLabels[e.priceType] || e.priceType,
      cell: (e) => priceTypeLabels[e.priceType] || e.priceType,
    },
    {
      key: 'oldPrice',
      header: 'Preț vechi',
      sortValue: (e) => e.oldPrice ?? null,
      cell: (e) =>
        e.oldPrice !== undefined && e.oldPrice !== null ? formatMoney(e.oldPrice) : '—',
    },
    {
      key: 'newPrice',
      header: 'Preț nou',
      sortValue: (e) => e.newPrice,
      cell: (e) => <span className="font-medium">{formatMoney(e.newPrice)}</span>,
    },
    {
      key: 'changedBy',
      header: 'Modificat de',
      sortValue: (e) => e.changedByName,
      cell: (e) => e.changedByName,
    },
  ];

  const marginColumns: Column<RecipeMargin>[] = [
    {
      key: 'name',
      header: 'Rețetă',
      sortValue: (m) => m.recipeName,
      cell: (m) => (
        <button
          type="button"
          className="inline-flex min-h-[32px] cursor-pointer items-center rounded-md text-left font-semibold hover:text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
          title="Vezi componentele și costurile"
          onClick={() => openBreakdown(m.recipeId)}
        >
          {m.recipeName}
        </button>
      ),
    },
    {
      key: 'cost',
      header: 'Cost',
      sortValue: (m) => m.calculatedCost ?? null,
      cell: (m) => {
        if (editingCostId === m.recipeId) {
          return (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={editCost}
                onChange={(e) => setEditCost(e.target.value)}
                className="h-8 w-24"
                step="0.01"
                min="0"
                autoFocus
                placeholder="gol = calc."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveCost(m.recipeId);
                  if (e.key === 'Escape') setEditingCostId(null);
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => handleSaveCost(m.recipeId)}
                disabled={savingCost}
                title="Salvează costul manual (gol = revine la calculat)"
                aria-label="Salvează costul manual"
              >
                {savingCost ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
              </Button>
            </div>
          );
        }
        return (
          <button
            type="button"
            className="inline-flex min-h-[32px] cursor-pointer flex-col items-start justify-center rounded-md text-left hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
            title="Setează un cost manual (manoperă etc.); gol = costul calculat"
            onClick={() => {
              setEditingCostId(m.recipeId);
              setEditCost(m.manualCost != null ? String(m.manualCost) : '');
            }}
          >
            {m.calculatedCost != null ? (
              <span className="inline-flex items-center gap-1.5">
                {formatMoney(m.calculatedCost)}
                {m.manualCost != null && <StatusBadge label="manual" colorClass="st-purple" />}
              </span>
            ) : (
              'Setează'
            )}
            {m.manualCost != null && m.ingredientsCost != null && (
              <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                calc. {formatMoney(m.ingredientsCost)}
              </span>
            )}
          </button>
        );
      },
    },
    {
      key: 'sellingPrice',
      header: 'Preț vânzare',
      cell: (m) => {
        if (editingId === m.recipeId) {
          return (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="w-24 h-8"
                step="0.01"
                min="0"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSavePrice(m.recipeId);
                  if (e.key === 'Escape') setEditingId(null);
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => handleSavePrice(m.recipeId)}
                disabled={savingPrice}
                title="Salvează prețul de vânzare"
                aria-label="Salvează prețul de vânzare"
              >
                {savingPrice ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
              </Button>
            </div>
          );
        }
        return (
          <button
            type="button"
            className="inline-flex min-h-[32px] cursor-pointer items-center rounded-md text-left hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
            title="Editează prețul de vânzare"
            onClick={() => {
              setEditingId(m.recipeId);
              setEditPrice(m.sellingPrice?.toString() || '');
            }}
          >
            {m.sellingPrice != null ? formatMoney(m.sellingPrice) : 'Setează'}
          </button>
        );
      },
    },
    {
      key: 'margin',
      header: 'Marjă',
      sortValue: (m) => m.margin ?? null,
      cell: (m) => (m.margin != null ? formatMoney(m.margin) : '—'),
    },
    {
      key: 'marginPercent',
      header: 'Marjă %',
      sortValue: (m) => m.marginPercent ?? null,
      cell: (m) => {
        if (m.marginPercent == null) return '—';
        // Margin health colors from the DS status tokens (never hardcoded).
        const color =
          m.marginPercent >= 30
            ? 'text-[var(--st-green)]'
            : m.marginPercent >= 15
              ? 'text-[var(--st-yellow)]'
              : 'text-[var(--st-red)]';
        return <span className={`font-semibold ${color}`}>{formatPercent(m.marginPercent)}</span>;
      },
    },
  ];

  return (
    <div>
      <BackLink href="/recipes" label="Rețete" />
      <PageHeader
        eyebrow="Catalog"
        title="Prețuri și Marje"
        description="Gestionează prețurile de vânzare și vezi marjele"
      />

      <Tabs defaultValue="margins">
        <TabsList>
          <TabsTrigger value="margins">Marje</TabsTrigger>
          <TabsTrigger value="history">Istoric</TabsTrigger>
        </TabsList>

        <TabsContent value="margins" className="mt-4">
          {margins.length === 0 && !loadingMargins ? (
            <EmptyState
              icon={Banknote}
              title="Nicio rețetă"
              description="Adaugă rețete pentru a vedea marjele."
            />
          ) : (
            <DataTable columns={marginColumns} data={margins} isLoading={loadingMargins} />
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {history.length === 0 && !loadingHistory ? (
            <EmptyState
              icon={Banknote}
              title="Nicio modificare de preț"
              description="Istoricul modificărilor de prețuri va apărea aici."
            />
          ) : (
            <DataTable columns={historyColumns} data={history} isLoading={loadingHistory} />
          )}
        </TabsContent>
      </Tabs>

      {/* Componentele rețetei + costuri (click pe numele rețetei). */}
      <Dialog open={breakdownOpen} onOpenChange={setBreakdownOpen}>
        <DialogContent
          className="p-0 sm:max-w-[560px]"
          description="Componentele rețetei și costul fiecăreia"
        >
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="text-base font-bold">
              {breakdown?.recipeName ?? 'Componente'}
            </DialogTitle>
          </DialogHeader>
          {breakdownLoading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Se calculează...
            </div>
          ) : breakdown ? (
            <div className="max-h-[60vh] overflow-y-auto pb-2">
              {breakdown.ingredients.length === 0 ? (
                <p className="px-6 py-6 text-sm text-muted-foreground">
                  Rețeta nu are ingrediente.
                </p>
              ) : (
                breakdown.ingredients.map((ing, i) => (
                  <div
                    key={`${ing.rawMaterialId}-${i}`}
                    className="flex items-center gap-3 border-b border-border px-6 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{ing.name}</span>
                        {ing.isSemipreparat && (
                          <StatusBadge label="semipreparat" colorClass="st-purple" />
                        )}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                        {formatUnitQty(ing.quantity, ing.unit)}
                        {ing.unitPrice != null &&
                          ` · ${formatMoney(ing.unitPrice, priceUnitLabel(ing.unit as UnitType))}`}
                        {ing.isSemipreparat && ' · cost calculat'}
                      </div>
                    </div>
                    <span className="text-sm font-semibold">
                      {ing.totalCost != null ? formatMoney(ing.totalCost) : '—'}
                    </span>
                  </div>
                ))
              )}
              <div className="space-y-1.5 px-6 pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cost ingrediente</span>
                  <span className="font-semibold">
                    {breakdown.ingredientsCost != null
                      ? formatMoney(breakdown.ingredientsCost)
                      : '—'}
                  </span>
                </div>
                {breakdown.manualCost != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Cost manual (manoperă etc.)</span>
                    <span className="font-semibold">{formatMoney(breakdown.manualCost)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                  <span className="font-semibold">Cost folosit la marjă</span>
                  <span className="font-bold">
                    {breakdown.totalCost != null ? formatMoney(breakdown.totalCost) : '—'}
                  </span>
                </div>
                {breakdown.sellingPrice != null && (
                  <div className="flex items-center justify-between pb-2 text-sm">
                    <span className="text-muted-foreground">Preț vânzare</span>
                    <span className="font-semibold">{formatMoney(breakdown.sellingPrice)}</span>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
