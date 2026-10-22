'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  recipes as recipesApi,
  stock as stockApi,
  stockExtra,
  integrations as integrationsApi,
} from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';
import { RECIPE_PHOTOS_ENABLED } from '@/lib/features';
import type {
  RecipeYieldEntry,
  RecipeCost,
  RecipeIngredient,
  RecipeLot,
  StockItemAvailability,
  ProductMapping,
} from '@/lib/types';
import { RecipeType } from '@horae/shared-types';
import { recipeTypeLabels } from '@/lib/constants';
import { StatusBadge } from '@/components/status-badge';
import { ActionTiles } from '@/components/action-tiles';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { IconAction } from '../../stock/_ui/parts';
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  Copy,
  FileText,
  PenLine,
  Play,
  Printer,
  Send,
  Trash2,
} from 'lucide-react';
import { usePermissions } from '@/contexts/auth-context';
import { RecipeNutritionCard, useNutritionEnabled } from '@/components/nutrition';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { formatUnitQty, formatPercent } from '@/lib/utils';
import {
  type CatalogRecipe,
  fmtMoney,
  fmtPct,
  marginColor,
  marginPct,
  pillClass,
  TINT_SURFACE,
  TINT_TILE,
  tintStyle,
} from '../recipe-ui';
import { unitTypeLabels } from '@/lib/constants';

const SCALES = [1, 2, 6, 12] as const;

/** Base units per family, so stock in kg can be compared with a need in g. */
const UNIT_BASE: Record<string, { family: string; factor: number }> = {
  MILIGRAME: { family: 'mass', factor: 1 },
  GRAME: { family: 'mass', factor: 1000 },
  KILOGRAME: { family: 'mass', factor: 1_000_000 },
  MILILITRI: { family: 'vol', factor: 1 },
  LITRI: { family: 'vol', factor: 1000 },
  BUCATI: { family: 'count', factor: 1 },
};

/** True/false when both sides are comparable; null when units don't line up. */
function isShort(stock: number, stockUnit: string, need: number, needUnit: string): boolean | null {
  const s = UNIT_BASE[stockUnit];
  const n = UNIT_BASE[needUnit];
  if (!s || !n || s.family !== n.family) return null;
  return stock * s.factor < need * n.factor;
}

/** Ingredient unit costs/stock, resolved per row. */
interface IngredientView {
  ing: RecipeIngredient;
  isSemi: boolean;
  name: string;
  href: string | null;
  sub: string;
  cost: number | null;
  stock: number | null;
  stockUnit: string | null;
}

type RawIngredientExtras = RecipeIngredient & {
  rawMaterialStockCount?: number | null;
  rawMaterialReservedCount?: number | null;
};

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const nutritionEnabled = useNutritionEnabled();
  const router = useRouter();
  const { ask, dialog } = useConfirmDialog();
  const { can } = usePermissions();
  const [recipe, setRecipe] = useState<CatalogRecipe | null>(null);
  const [yieldHistory, setYieldHistory] = useState<RecipeYieldEntry[]>([]);
  const [cost, setCost] = useState<RecipeCost | null>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState<number>(1);
  const [subStock, setSubStock] = useState<
    Record<string, { stockCount: number; unit: string; category: string | null }>
  >({});
  const [availability, setAvailability] = useState<StockItemAvailability | null>(null);
  const [lots, setLots] = useState<RecipeLot[]>([]);
  const [mappings, setMappings] = useState<ProductMapping[]>([]);
  const [allergens, setAllergens] = useState<{ allergen: string; sources: string[] }[]>([]);
  // The backend gates /cost by the RecipeCost permission; if it returns, show it.
  const canCost = cost != null;

  useEffect(() => {
    async function load() {
      try {
        const [r, yh] = await Promise.all([
          recipesApi.get(id),
          recipesApi.yieldHistory(id).catch(() => []),
        ]);
        setRecipe(r as CatalogRecipe);
        // Defensiv: orice formă neașteptată a răspunsului nu trebuie să rupă pagina.
        setYieldHistory(Array.isArray(yh) ? yh : []);
        recipesApi
          .cost(id)
          .then(setCost)
          .catch(() => setCost(null));
      } catch {
        toast.error('Nu s-a putut încărca rețeta');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Best-effort side data — a failure only hides its own card/column.
  useEffect(() => {
    stockApi
      .recipeStock({ limit: 500 })
      .then((res) =>
        setSubStock(
          Object.fromEntries(
            res.data.map((r) => [
              r.recipeId,
              {
                stockCount: r.stockCount,
                unit: r.unit as string,
                category: (r as { category?: string | null }).category ?? null,
              },
            ]),
          ),
        ),
      )
      .catch(() => {});
    stockApi
      .itemAvailability({ recipeId: id })
      .then(setAvailability)
      .catch(() => setAvailability(null));
    stockExtra
      .recipeLots(id)
      .then((l) => setLots(Array.isArray(l) ? l : []))
      .catch(() => setLots([]));
    integrationsApi
      .list()
      .then((list) => Promise.all(list.map((i) => integrationsApi.mappings(i.id).catch(() => []))))
      .then((all) => setMappings(all.flat().filter((m) => m.recipeId === id)))
      .catch(() => setMappings([]));
  }, [id]);

  useEffect(() => {
    if (!nutritionEnabled) return;
    recipesApi
      .nutrition(id)
      .then((n) => setAllergens(n.allergens ?? []))
      .catch(() => setAllergens([]));
  }, [id, nutritionEnabled]);

  const handleArchiveToggle = async () => {
    if (!recipe) return;
    const archiving = !recipe.isArchived;
    try {
      const updated = await recipesApi.setArchived(id, archiving);
      setRecipe((prev) => ({ ...(prev as CatalogRecipe), ...updated }));
      toast.success(archiving ? 'Rețetă arhivată' : 'Rețetă reactivată');
    } catch {
      toast.error('Operațiunea a eșuat');
    }
  };

  const handleDraftToggle = async () => {
    if (!recipe) return;
    // Currently live → make it a draft (unpublish); currently a draft → publish.
    const makeDraft = !recipe.isDraft;
    try {
      const updated = await recipesApi.setDraft(id, makeDraft);
      setRecipe((prev) => ({ ...(prev as CatalogRecipe), ...updated }));
      toast.success(makeDraft ? 'Rețetă salvată ca schiță' : 'Rețetă publicată');
    } catch {
      toast.error('Operațiunea a eșuat');
    }
  };

  const handleDelete = async () => {
    const ok = await ask({
      title: 'Ștergi rețeta?',
      description:
        'Rețeta dispare definitiv din catalog. Taskurile și comenzile vechi care o folosesc păstrează doar numele.',
      confirmLabel: 'Șterge rețeta',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await recipesApi.delete(id);
      toast.success('Rețetă ștearsă');
      router.push('/recipes');
    } catch {
      toast.error('Ștergerea a eșuat');
    }
  };

  const handleDuplicate = async () => {
    if (!recipe) return;
    try {
      const copy = await recipesApi.create({
        name: `${recipe.name} (copie)`,
        type: recipe.type,
        unit: recipe.unit,
        quantityPerPiece: recipe.quantityPerPiece,
        yieldQuantity: recipe.yieldQuantity,
        finishedWeightGrams: recipe.finishedWeightGrams,
        description: recipe.description,
        category: recipe.category,
        estimatedLossPercent: recipe.estimatedLossPercent,
        shelfLifeMonths: recipe.shelfLifeMonths,
        isDraft: true,
        components: (recipe.components ?? []).map((c) => ({
          name: c.name,
          sortOrder: c.sortOrder,
          ingredients: c.ingredients.map((i) => ({
            rawMaterialId: i.rawMaterialId,
            semipreparatRecipeId: i.semipreparatRecipeId ?? i.semipreparatId,
            name: i.name || i.rawMaterialTitle || i.semipreparatName || '',
            quantity: i.quantity,
            unit: i.unit,
            prepMethod: i.prepMethod,
            sortOrder: i.sortOrder,
          })),
        })),
      });
      toast.success('Rețetă duplicată ca schiță');
      router.push(`/recipes/${copy.id}/edit`);
    } catch {
      toast.error('Duplicarea a eșuat');
    }
  };

  const components = useMemo(() => recipe?.components ?? [], [recipe]);
  const multiComponent = components.length > 1;

  const views = useMemo(() => {
    const byKey = new Map<string, number | null>();
    for (const ci of cost?.ingredients ?? []) {
      byKey.set(ci.rawMaterialId, ci.totalCost);
      byKey.set(`n:${ci.name}`, ci.totalCost);
    }
    const out = new Map<string, IngredientView>();
    for (const comp of components) {
      for (const raw of comp.ingredients) {
        const ing = raw as RawIngredientExtras;
        const semiId = ing.semipreparatRecipeId ?? ing.semipreparatId;
        const isSemi = !!semiId;
        const name = ing.name || ing.rawMaterialTitle || ing.semipreparatName || '—';
        let stockN: number | null = null;
        let stockUnit: string | null = null;
        let sub = 'Materie primă';
        if (isSemi && semiId) {
          const s = subStock[semiId];
          sub = `Semipreparat${s?.category ? ` · ${s.category}` : ''}`;
          if (s) {
            stockN = s.stockCount;
            stockUnit = s.unit;
          }
        } else if (ing.rawMaterialStockCount != null) {
          stockN = ing.rawMaterialStockCount;
          stockUnit = ing.rawMaterialUnit ?? ing.unit;
        }
        const key = ing.rawMaterialId ?? semiId ?? '';
        const c = byKey.has(key) ? byKey.get(key) : byKey.get(`n:${name}`);
        out.set(ing.id, {
          ing,
          isSemi,
          name,
          href:
            isSemi && semiId
              ? `/recipes/${semiId}`
              : ing.rawMaterialId
                ? `/stock/raw-materials/${ing.rawMaterialId}`
                : null,
          sub,
          cost: c ?? null,
          stock: stockN,
          stockUnit,
        });
      }
    }
    return out;
  }, [components, cost, subStock]);

  const hasCostCol = canCost;
  const gridCols = hasCostCol
    ? 'grid-cols-[minmax(0,2fr)_110px_90px_100px]'
    : 'grid-cols-[minmax(0,2fr)_110px_100px]';

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!recipe) return <p className="text-muted-foreground">Rețeta nu a fost găsită.</p>;

  const tint = tintStyle(recipe.category);

  // Subtitle: only the fields we actually know.
  const subtitleParts: string[] = [];
  if (recipe.yieldQuantity != null) {
    subtitleParts.push(`Randament ${formatUnitQty(recipe.yieldQuantity, recipe.unit)}`);
  }
  if (recipe.finishedWeightGrams) {
    subtitleParts.push(formatUnitQty(recipe.finishedWeightGrams, 'GRAME'));
  }
  if (recipe.shelfLifeMonths != null) {
    subtitleParts.push(
      `valabilitate ${recipe.shelfLifeMonths} ${recipe.shelfLifeMonths === 1 ? 'lună' : 'luni'}`,
    );
  }
  subtitleParts.push(`actualizată ${format(new Date(recipe.updatedAt), 'd MMM', { locale: ro })}`);

  const price = cost?.sellingPrice ?? recipe.sellingPrice ?? null;
  const totalCost = cost?.totalCost ?? null;
  const margin = cost?.marginPercent ?? marginPct(totalCost, price);
  const costPerUnit =
    totalCost != null && recipe.yieldQuantity != null && recipe.yieldQuantity > 0
      ? totalCost / recipe.yieldQuantity
      : null;
  const unitShort = unitTypeLabels[recipe.unit] ?? '';

  const lotsByLocation = new Map<string, RecipeLot[]>();
  for (const l of lots) {
    const arr = lotsByLocation.get(l.locationId) ?? [];
    arr.push(l);
    lotsByLocation.set(l.locationId, arr);
  }
  const stockLocations = (availability?.locations ?? []).filter(
    (l) => l.quantity !== 0 || lotsByLocation.has(l.locationId),
  );

  const card = 'overflow-hidden rounded-[var(--radius)] border border-border bg-card';

  const renderRow = (ing: RecipeIngredient) => {
    const v = views.get(ing.id);
    if (!v) return null;
    const need = ing.quantity * scale;
    const short =
      v.stock != null && v.stockUnit ? isShort(v.stock, v.stockUnit, need, ing.unit) : null;
    return (
      <div
        key={ing.id}
        className={`grid ${gridCols} items-center gap-3 border-t border-border px-5 py-[11px] text-[13px]`}
      >
        <span className="min-w-0">
          {v.href ? (
            <Link href={v.href} className="font-semibold text-foreground hover:text-primary">
              {v.name}
            </Link>
          ) : (
            <b>{v.name}</b>
          )}
          <span className="block text-xs text-muted-foreground">{v.sub}</span>
        </span>
        <span className="whitespace-nowrap text-right font-bold">
          {formatUnitQty(need, ing.unit)}
        </span>
        {hasCostCol && (
          <span className="text-right text-muted-foreground">
            {v.cost != null ? fmtMoney(v.cost * scale) : '—'}
          </span>
        )}
        <span
          className={`text-right font-bold ${
            short == null
              ? 'text-muted-foreground'
              : short
                ? 'text-[var(--st-red)]'
                : 'text-[var(--st-green)]'
          }`}
        >
          {v.stock != null && v.stockUnit ? formatUnitQty(v.stock, v.stockUnit) : '—'}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden !important; }
          #recipe-print, #recipe-print * { visibility: visible !important; }
          #recipe-print { position: absolute; left: 0; top: 0; width: 100%; }
          #recipe-print .rec-noprint { display: none !important; }
        }
      `}</style>

      <Link
        href="/recipes"
        className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Rețete
      </Link>

      {dialog}
      <div id="recipe-print" className="flex flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-4">
            <ImageUpload
              shape="square"
              size={112}
              label="Poză rețetă"
              value={RECIPE_PHOTOS_ENABLED ? recipe.photoUrl : null}
              readOnly={!RECIPE_PHOTOS_ENABLED || !can('update', 'Recipe')}
              onUpload={async (file) => {
                const updated = await recipesApi.uploadPhoto(recipe.id, file);
                setRecipe((prev) => ({
                  ...(prev as CatalogRecipe),
                  photoUrl: (updated as CatalogRecipe).photoUrl ?? null,
                }));
              }}
              onRemove={async () => {
                await recipesApi.deletePhoto(recipe.id);
                setRecipe((prev) => ({ ...(prev as CatalogRecipe), photoUrl: null }));
              }}
              fallback={
                <span
                  className={`${TINT_TILE} flex h-full w-full items-center justify-center font-serif text-[40px] font-semibold text-foreground`}
                  style={tint}
                >
                  {recipe.name.slice(0, 1).toUpperCase()}
                </span>
              }
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="flex flex-wrap items-center gap-1.5">
                {recipe.category && (
                  <span className={`${pillClass} ${TINT_SURFACE} text-foreground`} style={tint}>
                    {recipe.category}
                  </span>
                )}
                <StatusBadge
                  label={recipeTypeLabels[recipe.type]}
                  colorClass={recipe.type === RecipeType.FINAL ? 'st-blue' : 'st-purple'}
                />
                {recipe.isArchived && <StatusBadge label="Arhivată" colorClass="st-red" />}
                {recipe.isDraft && <StatusBadge label="Schiță" colorClass="st-orange" />}
              </span>
              <h1 className="font-serif text-[28px] font-semibold leading-[1.05] tracking-[-0.4px] sm:text-[34px]">
                {recipe.name}
              </h1>
              <span className="text-sm text-muted-foreground">{subtitleParts.join(' · ')}</span>
            </div>
          </div>

          <div className="rec-noprint flex flex-wrap items-center gap-2.5">
            {can('create', 'Recipe') && (
              <IconAction
                icon={Copy}
                word="Duplică"
                label="Duplică rețeta"
                title="Copie nouă, salvată ca schiță"
                onClick={handleDuplicate}
              />
            )}
            <IconAction
              icon={Printer}
              word="Tipărește"
              label="Tipărește fișa rețetei"
              title="Fișa rețetei pentru laborator"
              onClick={() => window.print()}
            />
            {can('update', 'Recipe') && (
              <>
                <IconAction
                  icon={PenLine}
                  word="Editează"
                  href={`/recipes/${id}/edit`}
                  label="Editează rețeta"
                  title="Ingrediente, randament, categorie"
                />
                <IconAction
                  icon={recipe.isArchived ? ArchiveRestore : Archive}
                  word={recipe.isArchived ? 'Reactivează' : 'Arhivează'}
                  label={recipe.isArchived ? 'Reactivează rețeta' : 'Arhivează rețeta'}
                  title={
                    recipe.isArchived
                      ? 'Rețeta revine în catalog'
                      : 'Rețeta dispare din catalog, istoricul rămâne'
                  }
                  onClick={handleArchiveToggle}
                />
                <IconAction
                  icon={recipe.isDraft ? Send : FileText}
                  word={recipe.isDraft ? 'Publică' : 'Schiță'}
                  label={recipe.isDraft ? 'Publică rețeta' : 'Salvează rețeta ca schiță'}
                  title={
                    recipe.isDraft
                      ? 'Rețeta devine disponibilă pentru producție'
                      : 'Rețeta rămâne ascunsă până o publici'
                  }
                  onClick={handleDraftToggle}
                />
              </>
            )}
            {can('delete', 'Recipe') && (
              <ActionTiles
                actions={[
                  {
                    key: 'delete',
                    label: 'Șterge rețeta',
                    word: 'Șterge',
                    title: 'Șterge definitiv rețeta',
                    icon: Trash2,
                    tone: 'destructive',
                    onClick: handleDelete,
                  },
                ]}
              />
            )}
            {can('create', 'Task') && (
              <IconAction
                icon={Play}
                tone="primary"
                word="Produce"
                href={`/tasks/new?recipeId=${id}`}
                label="Task de producție din rețetă"
                title="Pornește un task de producție din rețeta asta"
              />
            )}
          </div>
        </header>

        <div className="flex flex-wrap items-start gap-[18px]">
          <section className="flex min-w-0 flex-[2_1_460px] flex-col gap-[18px]">
            <div className={card}>
              <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 pb-2.5 pt-4">
                <h2 className="text-base font-bold">Ingrediente</h2>
                <div
                  role="group"
                  aria-label="Scalare rețetă"
                  className="rec-noprint inline-flex items-center gap-1.5"
                >
                  <span className="text-xs text-muted-foreground">Pentru</span>
                  {SCALES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={scale === s}
                      title={`Cantități pentru ${s} × randamentul rețetei`}
                      onClick={() => setScale(s)}
                      className={`h-[30px] cursor-pointer rounded-full border px-2.5 text-xs font-bold transition-colors ${
                        scale === s
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-card text-foreground hover:bg-muted'
                      }`}
                    >
                      ×{s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[520px]">
                  <div
                    className={`grid ${gridCols} items-center gap-3 border-t border-border px-5 py-2 text-[11px] font-bold uppercase tracking-[.5px] text-muted-foreground`}
                  >
                    <span>Ingredient</span>
                    <span className="text-right">Cantitate</span>
                    {hasCostCol && <span className="text-right">Cost</span>}
                    <span className="text-right">În stoc</span>
                  </div>
                  {components.map((comp) => (
                    <div key={comp.id}>
                      {multiComponent && (
                        <div className="border-t border-border bg-muted px-5 py-2 text-[11px] font-semibold uppercase tracking-[.5px] text-muted-foreground">
                          {comp.name}
                        </div>
                      )}
                      {comp.ingredients.map(renderRow)}
                    </div>
                  ))}
                  {components.length === 0 && (
                    <div className="border-t border-border px-5 py-[11px] text-[13px] text-muted-foreground">
                      Nicio componentă definită.
                    </div>
                  )}
                </div>
              </div>
              {allergens.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background px-5 py-3 text-xs text-muted-foreground">
                  <span>Alergeni:</span>
                  {allergens.map((a) => (
                    <span
                      key={a.allergen}
                      title={a.sources.join(', ')}
                      className={`${pillClass} bg-[var(--st-orange-bg)] text-[var(--st-orange)]`}
                    >
                      {a.allergen}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {nutritionEnabled && <RecipeNutritionCard recipeId={id} />}

            <div className={card}>
              <div className="px-5 pb-2.5 pt-4">
                <h2 className="text-base font-bold">Istoric randament</h2>
              </div>
              {yieldHistory.length > 0 ? (
                yieldHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex justify-between border-t border-border px-5 py-[11px] text-[13px]"
                  >
                    <span>
                      <b>
                        {formatUnitQty(entry.actualYield, recipe.unit)} /{' '}
                        {formatUnitQty(entry.expectedYield, recipe.unit)}
                      </b>{' '}
                      ·{' '}
                      <span
                        className={
                          (entry.variancePercent ?? 0) >= 0
                            ? 'text-[var(--st-green)]'
                            : 'text-[var(--st-red)]'
                        }
                      >
                        {(entry.variancePercent ?? 0) > 0 ? '+' : ''}
                        {formatPercent(entry.variancePercent ?? 0)}
                      </span>
                    </span>
                    <span className="text-muted-foreground">
                      {entry.createdAt && Number.isFinite(+new Date(entry.createdAt))
                        ? format(new Date(entry.createdAt), 'd MMM', { locale: ro })
                        : '—'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="border-t border-border px-5 py-[11px] text-[13px] text-muted-foreground">
                  Niciun randament înregistrat.
                </div>
              )}
            </div>
          </section>

          <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-[18px]">
            {canCost && (
              <div className={`${card} flex flex-col gap-3.5 p-5`}>
                <h2 className="text-[13px] font-bold uppercase tracking-[.5px] text-muted-foreground">
                  Cost & preț
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Cost total" value={fmtMoney(totalCost)} />
                  <Stat label="Preț vânzare" value={fmtMoney(price)} />
                  <Stat label="Marjă" value={fmtPct(margin)} valueClass={marginColor(margin)} />
                  {costPerUnit != null && (
                    <Stat label={`Cost / ${unitShort}`} value={fmtMoney(costPerUnit)} />
                  )}
                </div>
                <Link
                  href="/pricing"
                  className="rec-noprint inline-flex h-[34px] items-center self-start rounded-full bg-primary px-3 text-[13px] font-bold text-primary-foreground hover:bg-primary-pressed"
                >
                  Vezi toate prețurile
                </Link>
              </div>
            )}

            {(stockLocations.length > 0 || lots.length > 0) && (
              <div className={`${card} flex flex-col gap-2.5 px-5 py-[18px]`}>
                <h2 className="text-base font-bold">Stoc pe locații</h2>
                {stockLocations.map((l) => {
                  const ls = lotsByLocation.get(l.locationId) ?? [];
                  const expiries = ls
                    .map((x) => x.expiryDate)
                    .filter((x): x is string => !!x)
                    .sort();
                  const lotText = [
                    ls.length ? `${ls.length} ${ls.length === 1 ? 'lot' : 'loturi'}` : '',
                    expiries.length
                      ? `expiră ${format(new Date(expiries[0]), 'd MMM', { locale: ro })}`
                      : '',
                    l.reservedCount > 0
                      ? `${formatUnitQty(l.reservedCount, recipe.unit)} rezervate`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <div
                      key={l.locationId}
                      className="flex items-center justify-between gap-2.5 text-[13px]"
                    >
                      <span className="flex flex-col">
                        <span className="font-semibold">{l.locationName}</span>
                        {lotText && (
                          <span className="text-xs text-muted-foreground">{lotText}</span>
                        )}
                      </span>
                      <span
                        className={`font-bold ${
                          l.quantity > 0 ? 'text-[var(--st-green)]' : 'text-muted-foreground'
                        }`}
                      >
                        {formatUnitQty(l.quantity, recipe.unit)}
                      </span>
                    </div>
                  );
                })}
                <Link
                  href="/stock/recipe-stock"
                  className="rec-noprint text-[13px] font-semibold text-primary"
                >
                  Loturile și expirările →
                </Link>
              </div>
            )}

            {mappings.length > 0 && (
              <div className={`${card} flex flex-col gap-2.5 px-5 py-[18px]`}>
                <h2 className="text-base font-bold">Pe site</h2>
                <span className="text-[13px]">
                  Legată de {mappings.length === 1 ? 'produsul' : 'produsele'} din magazinul online.
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {mappings.map((m) => (
                    <span
                      key={m.id}
                      title={m.externalProductName}
                      className={`${pillClass} bg-[var(--st-green-bg)] text-[var(--st-green)]`}
                    >
                      {m.externalProductName} → #{m.externalProductId}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-serif text-[22px] font-semibold ${valueClass ?? ''}`}>{value}</span>
    </span>
  );
}
