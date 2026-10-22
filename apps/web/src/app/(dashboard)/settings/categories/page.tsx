'use client';

import { useEffect, useState } from 'react';
import { recipes as recipesApi } from '@/lib/api';
import { usePermissions } from '@/contexts/auth-context';
import type { CategoryKind } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, GripVertical, ListOrdered, Plus, Tags, X } from 'lucide-react';
import { toast } from 'sonner';
import { BackLink } from '@/components/back-link';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Truncate } from '@/components/truncate';
import { IconAction, PageHead, Pill } from '../../stock/_ui/parts';

// One row of the flat global-order list (mirrors GET /recipes/categories/carousel).
type CarouselCategory = {
  name: string;
  kind: string;
  color?: string | null;
  parentName?: string | null;
};

export default function CategoriesSettingsPage() {
  const { can } = usePermissions();
  const [categories, setCategories] = useState<{ name: string; isSystem: boolean }[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [categoryKind, setCategoryKind] = useState<CategoryKind>('MATERIE_PRIMA');
  // Global order (flat, cross-kind) — the "Ordinea categoriilor" card.
  const [carousel, setCarousel] = useState<CarouselCategory[]>([]);
  const [superNames, setSuperNames] = useState<Record<string, string>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const { ask, dialog } = useConfirmDialog();

  // The detailed endpoint already returns categories in the admin sortOrder —
  // never re-sort here; this order is what clients render (carousel, filters).
  useEffect(() => {
    recipesApi
      .categoryConfigs(categoryKind)
      .then((cats) => setCategories(cats.map((c) => ({ name: c.name, isSystem: c.isSystem }))))
      .catch(() => {});
  }, [categoryKind]);

  // The carousel endpoint returns ALL categories in the saved GLOBAL order —
  // server order is authoritative, never re-sort locally.
  useEffect(() => {
    recipesApi
      .categoryCarousel()
      .then(setCarousel)
      .catch(() => {});
    recipesApi
      .superCategories()
      .then((s) => setSuperNames(Object.fromEntries(s.map((x) => [x.kind, x.name]))))
      .catch(() => {});
  }, []);

  // add/remove/reorder return plain names — reload the detailed configs so the
  // list keeps its metadata (isSystem) and the canonical server order. Also
  // refresh the global-order card, which shows the same rows.
  const reloadCategories = () =>
    Promise.all([
      recipesApi
        .categoryConfigs(categoryKind)
        .then((cats) => setCategories(cats.map((c) => ({ name: c.name, isSystem: c.isSystem })))),
      recipesApi
        .categoryCarousel()
        .then(setCarousel)
        .catch(() => {}),
    ]);

  const handleAddCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    // Names are unique per kind, case-insensitively (QA m3).
    if (
      categories.some((c) => c.name.toLocaleLowerCase('ro') === trimmed.toLocaleLowerCase('ro'))
    ) {
      toast.error('Există deja o categorie cu acest nume', {
        description: 'Alege alt nume sau folosește-o pe cea existentă.',
      });
      return;
    }
    try {
      await recipesApi.addCategory(trimmed, categoryKind);
      await reloadCategories();
      setNewCategory('');
      toast.success(`Categorie "${trimmed}" adăugată`);
    } catch {
      toast.error('Eroare la adăugare');
    }
  };

  const handleRemoveCategory = async (name: string) => {
    const ok = await ask({
      title: `Ștergi categoria „${name}”?`,
      description: 'Produsele din ea rămân, dar fără categorie, și dispar din filtrul respectiv.',
      confirmLabel: 'Șterge categoria',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await recipesApi.removeCategory(name, categoryKind);
      await reloadCategories();
      toast.success(`Categorie "${name}" ștearsă`);
    } catch {
      toast.error('Eroare la ștergere');
    }
  };

  // Swap a category with its neighbour and persist the new order. Optimistic —
  // revert on failure.
  const handleMoveCategory = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const previous = categories;
    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setCategories(reordered);
    try {
      await recipesApi.reorderCategories(
        categoryKind,
        reordered.map((c) => c.name),
      );
      // Per-kind order feeds the global order too — refresh the flat list.
      recipesApi
        .categoryCarousel()
        .then(setCarousel)
        .catch(() => {});
    } catch {
      setCategories(previous);
      toast.error('Eroare la reordonare');
    }
  };

  // ── Global order (flat drag list) ──────────────────────────────────────────

  // Optimistic: apply `next` immediately, PATCH the full flat list, adopt the
  // server's canonical order on success, roll back on failure.
  const saveGlobalOrder = async (next: CarouselCategory[], previous: CarouselCategory[]) => {
    setCarousel(next);
    try {
      const updated = await recipesApi.reorderAllCategories(
        next.map(({ name, kind }) => ({ name, kind })),
      );
      setCarousel(updated);
      // The per-kind card shows the same rows — keep its order in sync.
      recipesApi
        .categoryConfigs(categoryKind)
        .then((cats) => setCategories(cats.map((c) => ({ name: c.name, isSystem: c.isSystem }))))
        .catch(() => {});
    } catch {
      setCarousel(previous);
      toast.error('Eroare la salvarea ordinii');
    }
  };

  // Keyboard-friendly fallback: swap with the neighbour and persist.
  const handleMoveGlobal = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= carousel.length) return;
    const next = [...carousel];
    [next[index], next[target]] = [next[target], next[index]];
    void saveGlobalOrder(next, carousel);
  };

  const handleGlobalDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox needs data set for the drag to start.
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleGlobalDragOver = (e: React.DragEvent, index: number) => {
    if (dragIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setDropIndex(before ? index : index + 1);
  };

  const handleGlobalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex !== null && dropIndex !== null) {
      // dropIndex is an INSERT position in the original list; removing the
      // dragged row first shifts everything after it down by one.
      const insert = dropIndex > dragIndex ? dropIndex - 1 : dropIndex;
      if (insert !== dragIndex) {
        const next = [...carousel];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(insert, 0, moved);
        void saveGlobalOrder(next, carousel);
      }
    }
    setDragIndex(null);
    setDropIndex(null);
  };

  const handleGlobalDragEnd = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  if (!can('manage', 'Recipe')) {
    return (
      <div className="flex flex-col gap-5">
        <BackLink href="/profil?tab=setari#categorii" label="Profil & setări" />
        <EmptyState
          icon={Tags}
          title="Fără acces la categorii"
          description="Doar administratorii pot administra categoriile."
          actionLabel="Înapoi la setări"
          actionHref="/profil?tab=setari"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/profil?tab=setari#categorii" label="Profil & setări" />
      <PageHead
        title="Categorii"
        meta="Materii prime, semipreparate și produse finite · ordinea lor în aplicații"
      />

      <div className="grid gap-[18px] lg:grid-cols-2">
        {/* ── Per-kind management ───────────────────────────────────────── */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-4 w-4" />
              Categorii
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['MATERIE_PRIMA', 'Materii prime'],
                  ['SEMIPREPARAT', 'Semipreparate'],
                  ['PRODUS_FINIT', 'Produse finite'],
                ] as [CategoryKind, string][]
              ).map(([k, label]) => (
                <Pill key={k} on={categoryKind === k} onClick={() => setCategoryKind(k)}>
                  {label}
                </Pill>
              ))}
            </div>
            <div className="flex gap-2.5">
              <Input
                placeholder="Categorie nouă…"
                aria-label="Categorie nouă"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              />
              <IconAction
                icon={Plus}
                tone="primary"
                word="Adaugă"
                label="Adaugă categoria"
                title="Adaugă categoria la tipul ales"
                onClick={handleAddCategory}
                disabled={!newCategory.trim()}
              />
            </div>
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nicio categorie definită.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Ordinea de aici este cea afișată în aplicații (carusel, filtre).
                </p>
                <div className="space-y-1">
                  {categories.map((cat, i) => (
                    <div
                      key={cat.name}
                      className="flex items-center gap-1 rounded-[var(--radius-ctl)] border px-3 py-1.5"
                    >
                      <Truncate text={cat.name} className="flex-1 text-sm" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={i === 0}
                        onClick={() => handleMoveCategory(i, -1)}
                        aria-label="Mută mai sus"
                        title="Mută mai sus"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={i === categories.length - 1}
                        onClick={() => handleMoveCategory(i, 1)}
                        aria-label="Mută mai jos"
                        title="Mută mai jos"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <span className="ml-1 [&_button]:text-destructive">
                        <IconAction
                          row
                          icon={X}
                          label={`Șterge categoria ${cat.name}`}
                          title="Șterge categoria"
                          onClick={() => handleRemoveCategory(cat.name)}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Global order — one flat drag & drop list across ALL kinds ──── */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4" />
              Ordinea categoriilor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Toate sub-categoriile, într-o singură listă. Trage o categorie pentru a stabili
              ordinea globală de afișare (carusel stoc, filtre) — indiferent de super-categorie.
            </p>
            {carousel.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nicio categorie definită.</p>
            ) : (
              <div
                className="space-y-1"
                onDragOver={(e) => dragIndex !== null && e.preventDefault()}
              >
                {carousel.map((cat, i) => (
                  <div key={`${cat.kind}:${cat.name}`}>
                    {/* Insert-position indicator */}
                    <div
                      className={`h-0.5 rounded-full transition-colors ${
                        dropIndex === i && dragIndex !== null ? 'bg-primary' : 'bg-transparent'
                      }`}
                    />
                    <div
                      draggable
                      onDragStart={(e) => handleGlobalDragStart(e, i)}
                      onDragOver={(e) => handleGlobalDragOver(e, i)}
                      onDrop={handleGlobalDrop}
                      onDragEnd={handleGlobalDragEnd}
                      className={`flex cursor-grab items-center gap-2 rounded-[var(--radius-ctl)] border bg-background px-2.5 py-1.5 active:cursor-grabbing ${
                        dragIndex === i ? 'opacity-40' : ''
                      }`}
                    >
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color || 'var(--st-gray)' }}
                        aria-hidden
                      />
                      <Truncate text={cat.name} className="flex-1 text-sm" />
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {superNames[cat.kind] ?? cat.kind}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={i === 0}
                        onClick={() => handleMoveGlobal(i, -1)}
                        aria-label={`Mută ${cat.name} mai sus`}
                        title={`Mută ${cat.name} mai sus`}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={i === carousel.length - 1}
                        onClick={() => handleMoveGlobal(i, 1)}
                        aria-label={`Mută ${cat.name} mai jos`}
                        title={`Mută ${cat.name} mai jos`}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {/* Indicator for dropping below the last row */}
                <div
                  className={`h-0.5 rounded-full transition-colors ${
                    dropIndex === carousel.length && dragIndex !== null
                      ? 'bg-primary'
                      : 'bg-transparent'
                  }`}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {dialog}
    </div>
  );
}
