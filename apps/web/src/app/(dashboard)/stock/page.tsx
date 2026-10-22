'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import {
  rawMaterials as rawApi,
  recipes as recipesApi,
  stock as stockApi,
  locations as locationsApi,
  transfers as transfersApi,
} from '@/lib/api';
import type { ExpiringItem, Location, LowStockItem, RawMaterial, Recipe } from '@/lib/types';
import { RecipeType } from '@horae/shared-types';
import { cn, formatUnitQty } from '@/lib/utils';
import { Hint } from '@/components/hint';
import { Truncate } from '@/components/truncate';
import { usePermissions } from '@/contexts/auth-context';
import {
  StockAdjustmentDialog,
  type StockAdjustmentPresetItem,
} from '@/components/stock-adjustment-dialog';
import { TestConsumptionDialog } from './raw-materials/test-consumption-dialog';
import {
  ArchiveX,
  ArrowLeftRight,
  ChevronDown,
  Clock,
  FlaskConical,
  Hourglass,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Truck,
  X,
} from 'lucide-react';
import { CARD, IconAction, PageHead, Pill } from './_ui/parts';
import { PillStrip, PinnedFilters } from '@/components/pinned-filters';
import { fmtDayMonth, fmtMonthYear } from './_ui/dates';

/**
 * Stoc — overview. Header with live meta line, quick-action chips, location
 * chips (toggle, none = cumulated), the three kind tiles, the category chip
 * carousel and one collapsible grid per category.
 */

type Segment = 'MP' | 'SEMI' | 'FINAL';

interface KindDef {
  key: Segment;
  label: string;
  caption: string;
  /** CSS colour values (tokens, so dark mode and white-label keep working). */
  tint: string;
  ink: string;
}

const KINDS: KindDef[] = [
  {
    key: 'MP',
    label: 'Materii prime',
    caption: 'prim',
    tint: 'var(--st-green-bg)',
    ink: 'var(--st-green)',
  },
  {
    key: 'SEMI',
    label: 'Semipreparate',
    caption: 'semi',
    tint: 'var(--st-blue-bg)',
    ink: 'var(--st-blue)',
  },
  {
    key: 'FINAL',
    label: 'Produse finite',
    caption: 'finit',
    tint: 'var(--accent)',
    ink: 'var(--primary)',
  },
];

const KIND_API: Record<Segment, string> = {
  MP: 'MATERIE_PRIMA',
  SEMI: 'SEMIPREPARAT',
  FINAL: 'PRODUS_FINIT',
};

interface StockRow {
  id: string;
  kind: Segment;
  name: string;
  category: string | null;
  supplier: string | null;
  lotNumber: string | null;
  /** Nearest known expiry (from /stock/expiring, else the material's own date). */
  expiry: { label: string; days: number } | null;
  minimum: number | null;
  qty: number;
  unit: string;
  detailHref: string;
  historyHref: string;
  transferHref: string;
  item: StockAdjustmentPresetItem;
}

type RecipeWithStock = Recipe & { stockCount?: number };

/** Rows grouped by category, "Misc" last, in first-seen order. */
function groupByCategory<T extends { category: string | null }>(
  rows: T[],
): { category: string; rows: T[] }[] {
  const order: string[] = [];
  const by = new Map<string, T[]>();
  for (const r of rows) {
    const key = r.category?.trim() ? r.category : 'Misc';
    if (!by.has(key)) {
      by.set(key, []);
      order.push(key);
    }
    by.get(key)!.push(r);
  }
  return order
    .sort((a, b) => Number(a === 'Misc') - Number(b === 'Misc'))
    .map((category) => ({ category, rows: by.get(category)! }));
}

const GRID_COLS =
  'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_92px_80px_92px_108px] items-center gap-3 px-5';

function expiryInfo(iso: string | null | undefined, days?: number) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const left = days ?? Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  const soon = left <= 150 || d.getFullYear() === new Date().getFullYear();
  return { label: soon ? fmtDayMonth(d) : fmtMonthYear(d), days: left };
}

function QuickChip({
  icon: Icon,
  word,
  label,
  title,
  href,
  onClick,
  tone,
  pressed,
  compact,
}: {
  icon: ComponentType<{ className?: string }>;
  /** One visible word. */
  word: string;
  /** Icon only (the strip no longer fits on one line); the name stays in the Hint. */
  compact?: boolean;
  /** Accessible name. */
  label: string;
  /** One-line explanation shown on hover. */
  title: string;
  href?: string;
  onClick?: () => void;
  tone?: 'danger';
  pressed?: boolean;
}) {
  const cls = cn(
    'inline-flex h-[42px] flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-ctl)] border text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
    compact ? 'w-[42px] justify-center' : 'pl-3 pr-3.5',
    pressed
      ? 'border-primary bg-primary text-primary-foreground hover:bg-primary-pressed'
      : tone === 'danger'
        ? 'border-border bg-card text-[var(--st-red)] hover:bg-[var(--st-red-bg)]'
        : 'border-border bg-card text-foreground hover:bg-muted',
  );
  const inner = (
    <>
      <Icon className="h-[18px] w-[18px]" />
      {!compact && <span>{word}</span>}
    </>
  );
  return (
    <Hint label={label} detail={title}>
      {href ? (
        <Link href={href} aria-label={label} className={cls}>
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cls}
        >
          {inner}
        </button>
      )}
    </Hint>
  );
}

export default function StockPage() {
  const { can } = usePermissions();
  const canMove = can('create', 'StockMovement');
  const canCreateItem = can('create', 'RawMaterial') || can('create', 'Consumable');

  const [segment, setSegment] = useState<Segment>('MP');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [outOnly, setOutOnly] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  // Quick-action strip: words while they fit on one line, icons only below that.
  const stripRef = useRef<HTMLElement>(null);
  const stripFullWidth = useRef(0);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const check = () => {
      if (!compact) {
        stripFullWidth.current = el.scrollWidth;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (el.scrollWidth > el.clientWidth + 1) setCompact(true);
      } else if (el.clientWidth >= stripFullWidth.current) {
        setCompact(false);
      }
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact]);
  const [addOpen, setAddOpen] = useState(false);

  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [semis, setSemis] = useState<RecipeWithStock[]>([]);
  const [finals, setFinals] = useState<RecipeWithStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowItems, setLowItems] = useState<LowStockItem[] | null>(null);
  const [expiring, setExpiring] = useState<ExpiringItem[] | null>(null);
  const [kindCategories, setKindCategories] = useState<
    { name: string; kind: string; parentName?: string | null }[]
  >([]);
  const [locs, setLocs] = useState<Location[]>([]);
  const [locStock, setLocStock] = useState<Map<string, number> | null>(null);
  // Per-location produced stock (semipreparate + produse finite), recipeId → qty.
  const [locRecipeStock, setLocRecipeStock] = useState<Map<string, number> | null>(null);

  const [adjustItem, setAdjustItem] = useState<StockAdjustmentPresetItem | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      rawApi.list({ page: 1, limit: 500 }),
      recipesApi.list({ type: RecipeType.SEMIPREPARAT, limit: 500 }),
      recipesApi.list({ type: RecipeType.FINAL, limit: 500 }),
    ]).then(([mp, se, fi]) => {
      if (mp.status === 'fulfilled') setMaterials(mp.value.data);
      if (se.status === 'fulfilled') setSemis(se.value.data as RecipeWithStock[]);
      if (fi.status === 'fulfilled') setFinals(fi.value.data as RecipeWithStock[]);
      setLoading(false);
    });
    stockApi
      .lowStock()
      .then(setLowItems)
      .catch(() => setLowItems(null));
    stockApi
      .expiring(90)
      .then(setExpiring)
      .catch(() => setExpiring(null));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    recipesApi
      .categoryCarousel()
      .then(setKindCategories)
      .catch(() => {});
    locationsApi
      .list()
      .catch(() => locationsApi.myLocations())
      .then((l) => setLocs(l.filter((x) => x.isActive !== false)))
      .catch(() => {});
  }, []);

  // Switching the kind drops the category chip.
  useEffect(() => setCategory(null), [segment]);

  // Per-location quantities: raw materials (locations/:id/stock) and produced
  // recipes (locations/:id/recipe-stock) — same split as the mobile apps.
  useEffect(() => {
    if (!locationId) {
      setLocStock(null);
      setLocRecipeStock(null);
      return;
    }
    let cancelled = false;
    locationsApi
      .stock(locationId)
      .then((rows) => {
        if (!cancelled) setLocStock(new Map(rows.map((r) => [r.rawMaterialId, r.quantity])));
      })
      .catch(() => {
        if (!cancelled) setLocStock(new Map());
      });
    transfersApi
      .recipeStock(locationId)
      .then((rows) => {
        if (!cancelled) {
          const m = new Map<string, number>();
          for (const r of rows) m.set(r.recipeId, (m.get(r.recipeId) ?? 0) + Number(r.quantity));
          setLocRecipeStock(m);
        }
      })
      .catch(() => {
        if (!cancelled) setLocRecipeStock(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  // Nearest expiry per product name (the expiring endpoint carries titles, not ids).
  const expiryByName = useMemo(() => {
    const m = new Map<string, ExpiringItem>();
    for (const e of expiring ?? []) {
      const key = e.materialTitle.trim().toLowerCase();
      const cur = m.get(key);
      if (!cur || e.daysUntilExpiry < cur.daysUntilExpiry) m.set(key, e);
    }
    return m;
  }, [expiring]);

  const allRows = useMemo<Record<Segment, StockRow[]>>(() => {
    const filterByLoc = !!locationId && locStock !== null;
    const mp: StockRow[] = materials.map((m) => {
      const exp = expiryByName.get(m.title.trim().toLowerCase());
      return {
        id: m.id,
        kind: 'MP',
        name: m.title,
        category: m.category ?? null,
        supplier: m.supplierName ?? null,
        lotNumber: m.lotNumber ?? null,
        expiry: exp ? expiryInfo(exp.expiryDate, exp.daysUntilExpiry) : expiryInfo(m.expiryDate),
        minimum: m.minimumStock && m.minimumStock > 0 ? m.minimumStock : null,
        qty: filterByLoc ? (locStock!.get(m.id) ?? 0) : m.stockCount,
        unit: m.unit,
        detailHref: `/stock/raw-materials/${m.id}`,
        historyHref: `/stock/movements?rawMaterialId=${m.id}`,
        transferHref: `/stock/transfers/new?rawMaterialId=${m.id}${locationId ? `&fromLocationId=${locationId}` : ''}`,
        item: {
          kind: 'raw',
          id: m.id,
          title: m.title,
          unit: m.unit,
          stockCount: filterByLoc ? (locStock!.get(m.id) ?? 0) : m.stockCount,
        },
      };
    });
    const recipesByLoc = !!locationId && locRecipeStock !== null;
    const fromRecipes = (list: RecipeWithStock[], kind: Segment): StockRow[] =>
      list.map((r) => {
        const exp = expiryByName.get(r.name.trim().toLowerCase());
        const qty = recipesByLoc ? (locRecipeStock!.get(r.id) ?? 0) : (r.stockCount ?? 0);
        return {
          id: r.id,
          kind,
          name: r.name,
          category: r.category ?? null,
          supplier: null,
          lotNumber: null,
          expiry: exp ? expiryInfo(exp.expiryDate, exp.daysUntilExpiry) : null,
          minimum: null,
          qty,
          unit: r.unit,
          detailHref: `/stock/recipe-stock?recipe=${r.id}`,
          historyHref: `/stock/movements?recipeId=${r.id}`,
          transferHref: '/stock/transfers/new',
          item: { kind: 'recipe', id: r.id, title: r.name, unit: r.unit, stockCount: qty },
        };
      });
    return { MP: mp, SEMI: fromRecipes(semis, 'SEMI'), FINAL: fromRecipes(finals, 'FINAL') };
  }, [materials, semis, finals, expiryByName, locationId, locStock, locRecipeStock]);

  // A selected location hides what isn't held there (every kind).
  const visibleRows = useMemo<Record<Segment, StockRow[]>>(() => {
    const q = search.trim().toLowerCase();
    const out = {} as Record<Segment, StockRow[]>;
    for (const k of KINDS) {
      out[k.key] = allRows[k.key].filter((r) => {
        const locLoaded = k.key === 'MP' ? locStock : locRecipeStock;
        if (locationId && locLoaded && !outOnly && r.qty === 0) return false;
        if (outOnly && r.qty !== 0) return false;
        if (!q) return true;
        return [r.name, r.supplier, r.lotNumber, r.category].some((v) =>
          v?.toLowerCase().includes(q),
        );
      });
    }
    return out;
  }, [allRows, search, outOnly, locationId, locStock, locRecipeStock]);

  const kind = KINDS.find((k) => k.key === segment)!;
  const kindRows = kindCategories.filter((c) => c.kind === KIND_API[segment]);
  const rowsOfKind = visibleRows[segment];
  const itemCount = (name: string) =>
    rowsOfKind.filter(
      (i) =>
        i.category === name || kindRows.some((c) => c.name === i.category && c.parentName === name),
    ).length;
  const chipCategories = kindRows
    .map((c) => ({ ...c, count: itemCount(c.name) }))
    .filter((c) => c.count > 0);
  const matchesChip = (cat: string | null) => {
    if (!category) return true;
    if (cat === category) return true;
    return kindRows.some((c) => c.name === cat && c.parentName === category);
  };
  const shown = rowsOfKind.filter((r) => matchesChip(r.category));
  const groups = groupByCategory(shown);

  const totalArticles = materials.length + semis.length + finals.length;
  const outCount = lowItems?.filter((i) => i.currentStock === 0).length;
  const lowCount = lowItems?.filter((i) => i.currentStock > 0).length;
  const expSoon = expiring?.filter((e) => e.daysUntilExpiry <= 3).length;
  const meta = loading
    ? 'Se încarcă stocul…'
    : [
        `${totalArticles} articole`,
        outCount !== undefined && `${outCount} epuizat${outCount === 1 ? '' : 'e'}`,
        lowCount !== undefined && `${lowCount} sub minim`,
        expSoon !== undefined && `${expSoon} expiră în 3 zile`,
      ]
        .filter(Boolean)
        .join(' · ');

  const openAdjust = (item: StockAdjustmentPresetItem | null) => {
    setAdjustItem(item);
    setAdjustOpen(true);
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHead title="Stoc" meta={meta}>
        <label className="flex h-[42px] min-w-[240px] items-center gap-2 rounded-[var(--radius-ctl)] border border-border bg-card px-3.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40 max-sm:min-w-0 max-sm:flex-1">
          <Search aria-hidden className="h-4 w-4 flex-none text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută produs, lot, furnizor"
            aria-label="Caută în stoc"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        {canCreateItem && (
          <IconAction
            icon={addOpen ? X : Plus}
            tone="primary"
            word={addOpen ? 'Închide' : 'Adaugă'}
            label="Adaugă materie primă sau consumabil"
            title="Materie primă sau consumabil nou"
            pressed={addOpen}
            onClick={() => setAddOpen((o) => !o)}
          />
        )}
      </PageHead>

      {addOpen && canCreateItem && (
        <div className={`${CARD} flex flex-wrap items-center gap-2 px-4 py-3`}>
          <span className="text-[13px] text-muted-foreground">Ce adaugi?</span>
          {can('create', 'RawMaterial') && (
            <Link
              href="/stock/raw-materials"
              className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted"
            >
              Materie primă nouă
            </Link>
          )}
          {can('create', 'Consumable') && (
            <Link
              href="/stock/consumables"
              className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold hover:bg-muted"
            >
              Consumabil nou
            </Link>
          )}
          <span className="text-xs text-muted-foreground">
            Se deschide lista, apoi „+” pentru formular.
          </span>
        </div>
      )}

      <nav
        ref={stripRef}
        aria-label="Acțiuni rapide stoc"
        data-compact={compact || undefined}
        className="no-scrollbar -mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 py-0.5"
      >
        {canMove && (
          <QuickChip
            compact={compact}
            icon={PackageOpen}
            word="Recepție"
            label="Recepție marfă"
            title="Primești marfă: loturi, factură, furnizor"
            href="/stock/receive"
          />
        )}
        <QuickChip
          compact={compact}
          icon={ArrowLeftRight}
          word="Transfer"
          label="Transfer între locații"
          title="Muți stoc dintr-o locație în alta"
          href="/stock/transfers/new"
        />
        {canMove && (
          <QuickChip
            compact={compact}
            icon={SlidersHorizontal}
            word="Mișcare"
            label="Mișcare de stoc"
            title="Intrare, ieșire sau ajustare manuală"
            onClick={() => openAdjust(null)}
          />
        )}
        {canMove && (
          <QuickChip
            compact={compact}
            icon={FlaskConical}
            word="Teste"
            label="Consum teste"
            title="Consum pentru teste și R&D"
            onClick={() => setTestOpen(true)}
          />
        )}
        <QuickChip
          compact={compact}
          icon={Hourglass}
          word="Expirări"
          label="Expirări"
          title="Ce expiră în zilele următoare"
          href="/stock/expiring"
        />
        <QuickChip
          compact={compact}
          icon={ShoppingBasket}
          word="Necesar"
          label="Necesar materii prime"
          title="Materii prime necesare pentru taskurile planificate"
          href="/stock/requirements"
        />
        <QuickChip
          compact={compact}
          icon={Truck}
          word="Furnizori"
          label="Furnizori"
          title="Furnizorii și produsele lor"
          href="/stock/suppliers"
        />
      </nav>

      {/* Fixate sus la derulare: locația + epuizate. */}
      <PinnedFilters>
        <PillStrip label="Locație">
          {locs.length > 0 && (
            <>
              <span className="mr-1 text-xs font-bold uppercase tracking-[0.5px] text-muted-foreground">
                Locație
              </span>
              {locs.map((l) => (
                <Pill
                  key={l.id}
                  on={locationId === l.id}
                  onClick={() => setLocationId(locationId === l.id ? null : l.id)}
                >
                  {l.name}
                </Pill>
              ))}
              <span aria-hidden className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          <Hint
            label="Doar produsele epuizate"
            detail="Doar produsele pe 0 · apasă din nou pentru toate"
          >
            <Pill
              on={outOnly}
              onClick={() => setOutOnly((o) => !o)}
              className={outOnly ? '' : 'text-[var(--st-red)]'}
            >
              <ArchiveX className="h-[15px] w-[15px]" />
              Epuizate
            </Pill>
          </Hint>
        </PillStrip>
      </PinnedFilters>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {KINDS.map((k) => {
          const on = segment === k.key;
          return (
            <button
              key={k.key}
              type="button"
              aria-pressed={on}
              onClick={() => setSegment(k.key)}
              className="flex cursor-pointer items-center justify-between gap-2.5 rounded-2xl border-0 px-4 py-3.5 text-left transition-colors"
              style={{
                background: on ? k.ink : k.tint,
                color: on ? 'var(--card)' : k.ink,
              }}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px] font-extrabold">{k.label}</span>
                <span className="text-[11px] font-bold uppercase tracking-[0.5px]">
                  {k.caption}
                </span>
              </span>
              <span className="font-serif text-[30px] font-semibold leading-none">
                {loading ? '' : visibleRows[k.key].length}
              </span>
            </button>
          );
        })}
      </div>

      {chipCategories.length > 0 && (
        <PinnedFilters sub>
          <PillStrip label="Categorie">
            {chipCategories.map((c) => {
              const on = category === c.name;
              return (
                <Pill key={c.name} on={on} onClick={() => setCategory(on ? null : c.name)}>
                  {c.name}
                  <span
                    className={`text-[11px] font-bold ${on ? 'opacity-80' : 'text-text-tertiary'}`}
                  >
                    {c.count}
                  </span>
                </Pill>
              );
            })}
          </PillStrip>
        </PinnedFilters>
      )}

      {groups.map((g) => {
        const key = `${segment}:${g.category}`;
        const open = !closed[key];
        return (
          <section key={key} className={`${CARD} overflow-hidden`}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setClosed({ ...closed, [key]: open })}
              className="flex w-full cursor-pointer items-center justify-between gap-2.5 border-0 bg-transparent px-5 py-3 text-left"
            >
              <span className="flex items-center gap-2.5">
                <span
                  className="inline-flex h-[26px] items-center rounded-full px-2.5 text-xs font-extrabold"
                  style={{ background: kind.tint, color: kind.ink }}
                >
                  {g.category}
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.4px] text-text-tertiary">
                  {kind.caption} · {g.rows.length}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>
            {open && (
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div
                    className={`${GRID_COLS} border-t border-border/60 py-2 text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground`}
                  >
                    <span>Produs</span>
                    <span>Furnizor</span>
                    <span>Expiră</span>
                    <span className="text-right">Minim</span>
                    <span className="text-right">Stoc</span>
                    <span className="sr-only">Acțiuni</span>
                  </div>
                  {g.rows.map((r) => {
                    const state =
                      r.qty === 0 ? 'out' : r.minimum !== null && r.qty < r.minimum ? 'low' : 'ok';
                    const soon = r.expiry !== null && r.expiry.days <= 3;
                    return (
                      <div
                        key={r.id}
                        className={`${GRID_COLS} border-t border-border/60 py-[7px] text-[13px]`}
                      >
                        {/* Numele tăiat pe iPhone: Hint arată numele întreg. */}
                        <Hint label={r.name}>
                          <Link
                            href={r.detailHref}
                            className="block min-w-0 truncate font-semibold hover:text-primary"
                          >
                            {r.name}
                          </Link>
                        </Hint>
                        <Truncate text={r.supplier ?? '—'} className="text-muted-foreground" />
                        <span
                          className={`whitespace-nowrap ${
                            soon ? 'font-bold text-[var(--st-orange)]' : 'text-muted-foreground'
                          }`}
                        >
                          {r.expiry?.label ?? '—'}
                        </span>
                        <span className="text-right text-muted-foreground">
                          {r.minimum !== null ? formatUnitQty(r.minimum, r.unit) : '—'}
                        </span>
                        <span
                          className={`whitespace-nowrap text-right font-bold ${
                            state === 'out'
                              ? 'text-[var(--st-red)]'
                              : state === 'low'
                                ? 'text-[var(--st-orange)]'
                                : ''
                          }`}
                        >
                          {formatUnitQty(r.qty, r.unit)}
                        </span>
                        <span className="flex justify-end gap-0.5">
                          {canMove && (
                            <IconAction
                              row
                              icon={Pencil}
                              label="Ajustează stocul"
                              title="Ajustează stocul (inventar)"
                              onClick={() => openAdjust(r.item)}
                            />
                          )}
                          <IconAction
                            row
                            icon={Clock}
                            label="Istoricul mișcărilor"
                            title="Istoricul mișcărilor produsului"
                            href={r.historyHref}
                          />
                          <IconAction
                            row
                            icon={ArrowLeftRight}
                            label="Transferă la altă locație"
                            title="Transferă la altă locație"
                            href={r.transferHref}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}

      {!loading && shown.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {outOnly ? 'Nimic fără stoc aici.' : 'Niciun produs găsit.'}
        </p>
      )}

      <StockAdjustmentDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        presetItem={adjustItem ?? undefined}
        onSuccess={load}
      />
      <TestConsumptionDialog open={testOpen} onOpenChange={setTestOpen} onSuccess={load} />
    </div>
  );
}
