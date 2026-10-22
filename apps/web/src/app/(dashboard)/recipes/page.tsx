'use client';

import { STICKY_HEAD } from '@/lib/sticky-head';
import { PinnedFilters } from '@/components/pinned-filters';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { recipes as recipesApi, stock as stockApi } from '@/lib/api';
import type { RecipeQuery } from '@/lib/types';
import { RecipeType } from '@horae/shared-types';
import { EmptyState } from '@/components/empty-state';
import { Hint } from '@/components/hint';
import { Archive, Banknote, Plus, Search, CookingPot, FileText } from 'lucide-react';
import { usePermissions } from '@/contexts/auth-context';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import { BulkSelectBar, BulkSelectToggle } from '@/components/bulk-select-bar';
import type { BulkActionDef } from '@/components/bulk-actions';
import { type CatalogRecipe, focusRing, stockState, wordBtn, wordBtnPrimary } from './recipe-ui';
import { RecipeCard } from './recipe-card';

const KIND_BY_TYPE = {
  [RecipeType.FINAL]: 'PRODUS_FINIT',
  [RecipeType.SEMIPREPARAT]: 'SEMIPREPARAT',
} as const;

const sum = (r: Record<string, number> | null) =>
  r ? Object.values(r).reduce((a, b) => a + b, 0) : 0;

export default function RecipesPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const select = useBulkSelect();
  const canDelete = can('delete', 'Recipe');
  const canUpdate = can('update', 'Recipe');
  const bulkActions: BulkActionDef[] = [
    {
      key: 'archive',
      label: 'Arhivare',
      paramName: 'archived',
      param: { kind: 'bool', trueLabel: 'Arhivează', falseLabel: 'Dezarhivează' },
    },
    {
      key: 'draft',
      label: 'Publicare',
      paramName: 'draft',
      param: { kind: 'bool', trueLabel: 'Ciornă', falseLabel: 'Publică' },
    },
    {
      key: 'category',
      label: 'Categorie',
      param: { kind: 'category', kinds: ['PRODUS_FINIT', 'SEMIPREPARAT'] },
    },
  ];

  const [data, setData] = useState<CatalogRecipe[]>([]);
  const [costs, setCosts] = useState<Record<string, number | null>>({});
  const [query, setQuery] = useState<RecipeQuery>({ type: RecipeType.FINAL, limit: 500 });
  const [loading, setLoading] = useState(true);
  const [orderedCats, setOrderedCats] = useState<string[]>([]);
  const [counts, setCounts] = useState<{
    final: Record<string, number> | null;
    semi: Record<string, number> | null;
  }>({ final: null, semi: null });

  const type = query.type ?? RecipeType.FINAL;

  // Admin-defined category order for the active type (never re-sorted).
  useEffect(() => {
    recipesApi
      .categories(KIND_BY_TYPE[type])
      .then(setOrderedCats)
      .catch(() => setOrderedCats([]));
  }, [type]);

  const loadCounts = useCallback(() => {
    Promise.all([
      recipesApi.categoryCounts(RecipeType.FINAL).catch(() => null),
      recipesApi.categoryCounts(RecipeType.SEMIPREPARAT).catch(() => null),
    ]).then(([final, semi]) => setCounts({ final, semi }));
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Fiecare încărcare primește un număr; doar răspunsul celei mai noi cereri
  // ajunge pe ecran — altfel un răspuns mai lent, pentru un filtru vechi,
  // suprascrie lista căutării curente.
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const [res, rs] = await Promise.all([
        recipesApi.list(query),
        // calculatedCost only lives on the product-stock endpoint.
        stockApi.recipeStock({ limit: 500 }).catch(() => null),
      ]);
      if (id !== requestId.current) return;
      setData(res.data as CatalogRecipe[]);
      if (rs) {
        setCosts(Object.fromEntries(rs.data.map((r) => [r.recipeId, r.calculatedCost])));
      }
    } catch {
      //
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const activeCounts = type === RecipeType.FINAL ? counts.final : counts.semi;
  const chips = useMemo(() => {
    if (!activeCounts) return [];
    const known = orderedCats.filter((c) => (activeCounts[c] ?? 0) > 0);
    const extra = Object.keys(activeCounts).filter(
      (c) => c && !orderedCats.includes(c) && activeCounts[c] > 0,
    );
    return [...known, ...extra].map((c) => ({ name: c, count: activeCounts[c] }));
  }, [activeCounts, orderedCats]);

  const nFinal = sum(counts.final);
  const nSemi = sum(counts.semi);
  const meta =
    counts.final || counts.semi
      ? `${nFinal + nSemi} rețete · ${nFinal} produse finale · ${nSemi} semipreparate`
      : '';

  const setType = (t: RecipeType) =>
    setQuery({ ...query, type: t, category: undefined, search: query.search });

  const togglePill = (key: 'draft' | 'archived') =>
    setQuery({
      ...query,
      draft: key === 'draft' && !query.draft ? true : undefined,
      archived: key === 'archived' && !query.archived ? true : undefined,
    });

  const toggleBtn = (on: boolean) =>
    `${wordBtn} ${on ? '!border-primary !bg-primary !text-primary-foreground hover:!bg-primary-pressed' : ''}`;

  return (
    <div className="flex flex-col gap-5">
      <header className={`flex flex-wrap items-end justify-between gap-4 ${STICKY_HEAD}`}>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-muted-foreground">{meta || ' '}</span>
          <h1 className="font-serif text-[28px] font-semibold leading-[1.05] tracking-[-0.4px] sm:text-[34px]">
            Rețete
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-[42px] min-w-[220px] items-center gap-2 rounded-[var(--radius-ctl)] border border-border bg-card px-3.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 max-sm:min-w-0 max-sm:flex-[1_1_100%]">
            <Search className="h-4 w-4 flex-none text-muted-foreground" aria-hidden />
            <input
              type="search"
              placeholder="Caută rețetă"
              aria-label="Caută rețetă"
              value={query.search ?? ''}
              onChange={(e) => setQuery({ ...query, search: e.target.value })}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div
            role="group"
            aria-label="Tip rețetă"
            className="inline-flex h-[42px] gap-0.5 rounded-[var(--radius-ctl)] bg-muted p-1"
          >
            {(
              [
                [RecipeType.FINAL, 'Produse finale'],
                [RecipeType.SEMIPREPARAT, 'Semipreparate'],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={`cursor-pointer rounded-[9px] px-3.5 text-[13px] font-bold transition-colors ${focusRing} ${
                  type === t
                    ? 'bg-card text-foreground shadow-(--shadow-card-sm)'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Hint label="Schițe" detail="Doar rețetele nepublicate">
            <button
              type="button"
              aria-pressed={!!query.draft}
              aria-label="Schițe"
              onClick={() => togglePill('draft')}
              className={toggleBtn(!!query.draft)}
            >
              <FileText className="h-[18px] w-[18px]" />
              <span>Schițe</span>
            </button>
          </Hint>
          <Hint label="Arhivate" detail="Doar rețetele arhivate">
            <button
              type="button"
              aria-pressed={!!query.archived}
              aria-label="Arhivate"
              onClick={() => togglePill('archived')}
              className={toggleBtn(!!query.archived)}
            >
              <Archive className="h-[18px] w-[18px]" />
              <span>Arhivate</span>
            </button>
          </Hint>
          <Hint label="Prețuri și marje" detail="Prețuri și marje pe toate produsele">
            <Link href="/pricing" aria-label="Prețuri și marje" className={wordBtn}>
              <Banknote className="h-[18px] w-[18px]" />
              <span>Prețuri</span>
            </Link>
          </Hint>
          {can('create', 'Recipe') && (
            <Hint label="Rețetă nouă" detail="Rețetă nouă: ingrediente, randament, cost">
              <Link href="/recipes/new" aria-label="Rețetă nouă" className={wordBtnPrimary}>
                <Plus className="h-[18px] w-[18px]" />
                <span>Nouă</span>
              </Link>
            </Hint>
          )}
        </div>
      </header>

      <PinnedFilters>
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="pill-strip min-w-0 flex-1 gap-2 py-0.5"
            role="group"
            aria-label="Categorie"
          >
            {chips.map((c) => {
              const on = query.category === c.name;
              return (
                <button
                  key={c.name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setQuery({ ...query, category: on ? undefined : c.name })}
                  className={`inline-flex h-[var(--chip-h)] shrink-0 cursor-pointer items-center gap-[7px] rounded-full border px-3 text-[13px] font-semibold transition-colors ${focusRing} ${
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  {c.name}
                  <span
                    className={`text-[11px] font-bold ${on ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}
                  >
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>
          {(canDelete || canUpdate) && <BulkSelectToggle select={select} />}
        </div>
      </PinnedFilters>

      {query.archived && (
        <p className="text-sm text-muted-foreground">
          Rețetele arhivate nu apar în liste și nu pot fi selectate la producție sau comenzi.
        </p>
      )}
      {query.draft && (
        <p className="text-sm text-muted-foreground">
          Schițele sunt rețete în lucru, ascunse din liste până nu sunt publicate.
        </p>
      )}

      {data.length === 0 && !loading ? (
        query.draft ? (
          <EmptyState
            icon={FileText}
            title="Nicio schiță"
            description="Rețetele salvate ca schiță apar aici până le publici."
          />
        ) : query.archived ? (
          <EmptyState
            icon={Archive}
            title="Nicio rețetă arhivată"
            description="Rețetele arhivate din pagina de detaliu apar aici."
          />
        ) : (
          <EmptyState
            icon={CookingPot}
            title="Nicio rețetă"
            description="Adaugă prima rețetă de producție."
            actionLabel={can('create', 'Recipe') ? 'Creează rețetă' : undefined}
            onAction={can('create', 'Recipe') ? () => router.push('/recipes/new') : undefined}
          />
        )
      ) : (
        <div
          className="grid gap-3.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}
          aria-busy={loading}
        >
          {/* Out of stock last: still searchable, just out of the way. Stable within each group. */}
          {[...data]
            .sort(
              (a, b) =>
                Number(stockState(a.stockCount, a.reservedCount) === 'out') -
                Number(stockState(b.stockCount, b.reservedCount) === 'out'),
            )
            .map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                cost={costs[r.id] ?? null}
                selecting={select.active}
                selected={select.isSelected(r.id)}
                onToggle={() => select.toggle(r.id)}
              />
            ))}
        </div>
      )}

      <BulkSelectBar
        select={select}
        entityLabel="rețete"
        warning="Rețetele cu taskuri în istoric sau comenzi nu se pot șterge."
        onPreview={canDelete ? (ids) => recipesApi.bulkDeletePreview(ids) : undefined}
        onDelete={canDelete ? (ids) => recipesApi.bulkDelete(ids) : undefined}
        actions={canUpdate ? bulkActions : undefined}
        onAction={(ids, key, params) => recipesApi.bulkAction(ids, key, params)}
        onDone={() => {
          load();
          loadCounts();
        }}
      />
    </div>
  );
}
