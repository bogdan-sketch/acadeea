'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  locations as locationsApi,
  organization as orgApi,
  transfers as transfersApi,
  users as usersApi,
} from '@/lib/api';
import type { Location, LocationRecipeStock, LocationStock, User } from '@/lib/types';
import { unitTypeLabels } from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DatePicker } from '@/components/ui/date-picker';
import { Truncate } from '@/components/truncate';
import { IconAction, PageHead, Pill } from '../../_ui/parts';
import { ChevronLeft, Loader2, Plus, Search, Trash2, PackageSearch, Save, X } from 'lucide-react';
import { usePermissions } from '@/contexts/auth-context';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { toast } from 'sonner';
import type { UnitType } from '@horae/shared-types';
import { formatUnitQty } from '@/lib/utils';

// A single transferable line at the source location — a raw material (MaterialStock)
// or a produced recipe (RecipeStock, produse finite / semipreparate) — unified so the
// picker + form treat both kinds the same way.
interface SourceItem {
  id: string;
  kind: 'raw' | 'recipe';
  title: string;
  unit: UnitType;
  available: number;
  category: string | null;
}

const MISC = 'Misc';

// Sentinel value in the destination chips for an ad-hoc destination (e.g. an
// event) — sends `destinationName`/`destinationAddress` instead of `toLocationId`.
const ADHOC = '__adhoc__';

function clampQty(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Math.min(rounded, max);
}

export default function NewTransferPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <NewTransferContent />
    </Suspense>
  );
}

function NewTransferContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Quick-action prefill: ?fromLocationId= preselects the source location,
  // ?rawMaterialId= auto-adds that material once the source stock is loaded.
  const prefillFromLocationId = searchParams.get('fromLocationId');
  const prefillRawMaterialId = searchParams.get('rawMaterialId');
  const autoAddedRef = useRef(false);
  const { can } = usePermissions();

  const [locationList, setLocationList] = useState<Location[]>([]);
  const [userList, setUserList] = useState<User[]>([]);
  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  // Ad-hoc destination (toLocationId === ADHOC): free-text name + optional address.
  const [destinationName, setDestinationName] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  // Recipient (person) — optional, printed on the aviz.
  const [destinationContact, setDestinationContact] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  // Aviz delegate/transport details — printed on the aviz de însoțire.
  const [delegateIdCard, setDelegateIdCard] = useState('');
  const [transportMeans, setTransportMeans] = useState('');
  const [dispatchedAt, setDispatchedAt] = useState('');
  const [notes, setNotes] = useState('');

  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  // id -> chosen quantity
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Dirty tracking over the editable fields + chosen quantities. Deep-link
  // prefills (source location / auto-added material) are applied to state, then
  // the baseline is captured once those prefills settle (see the "ready" effect
  // below) so they aren't treated as user edits.
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [baselineReady, setBaselineReady] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [stockPrefillDone, setStockPrefillDone] = useState(false);
  const currentSnapshot = JSON.stringify({
    fromLocationId,
    toLocationId,
    destinationName,
    destinationAddress,
    destinationContact,
    assignedToId,
    delegateIdCard,
    transportMeans,
    dispatchedAt,
    notes,
    quantities,
  });
  // Still waiting on a deep-link prefill? Wait for the initial data load, and —
  // when both a source location and a material are deep-linked — for that
  // location's stock to load so the auto-added material lands in the baseline.
  const awaitingPrefill =
    !initialLoaded || (!!prefillFromLocationId && !!prefillRawMaterialId && !stockPrefillDone);
  useEffect(() => {
    if (!baselineReady && !awaitingPrefill) {
      setSnapshot(currentSnapshot);
      setBaselineReady(true);
    }
  }, [baselineReady, awaitingPrefill, currentSnapshot]);
  const isDirty = snapshot !== null && currentSnapshot !== snapshot;
  const { guardedNavigate, dialog } = useUnsavedChanges(isDirty);

  useEffect(() => {
    Promise.all([
      locationsApi.list().catch(() => [] as Location[]),
      usersApi.list({ limit: 100, isActive: true }).catch(() => ({ data: [] as User[] })),
      orgApi.get().catch(() => null),
    ]).then(([locs, users, org]) => {
      setLocationList(locs);
      setUserList(users.data);
      if (prefillFromLocationId && locs.some((l) => l.id === prefillFromLocationId)) {
        // Programmatic prefill — the "ready" effect captures the baseline after
        // this settles, so it isn't seen as a user edit.
        setFromLocationId((prev) => prev || prefillFromLocationId);
      } else if (org?.defaultLocationId && locs.some((l) => l.id === org.defaultLocationId)) {
        // Sursa implicită = locația implicită a organizației (Stoc › Locații).
        setFromLocationId((prev) => prev || org.defaultLocationId!);
      }
      setInitialLoaded(true);
    });
  }, [prefillFromLocationId]);

  // Load the source location's unified stock (raw + produced recipes) when it changes.
  useEffect(() => {
    if (!fromLocationId) {
      setSourceItems([]);
      setQuantities({});
      return;
    }
    let cancelled = false;
    setLoadingStock(true);
    setQuantities({});
    setSearch('');
    Promise.all([
      locationsApi.stock(fromLocationId).catch(() => [] as LocationStock[]),
      transfersApi.recipeStock(fromLocationId).catch(() => [] as LocationRecipeStock[]),
    ])
      .then(([raw, recipes]) => {
        if (cancelled) return;
        const rawItems: SourceItem[] = raw.map((s) => ({
          id: s.rawMaterialId,
          kind: 'raw',
          title: s.rawMaterialTitle,
          unit: s.unit,
          available: s.quantity,
          category: s.category ?? null,
        }));
        const recipeItems: SourceItem[] = recipes.map((r) => ({
          id: r.recipeId,
          kind: 'recipe',
          title: r.recipeName,
          unit: r.unit,
          // Available = on-hand minus reserved (what's free to transfer).
          available: Math.max(r.quantity - r.reservedCount, 0),
          category: r.category,
        }));
        const items = [...rawItems, ...recipeItems].filter((i) => i.available > 0);
        setSourceItems(items);
        // Auto-add the material from the quick-action deep link (once). The
        // "ready" effect captures the baseline after this settles (via
        // `stockPrefillDone`), so it isn't seen as a user edit.
        if (
          prefillRawMaterialId &&
          !autoAddedRef.current &&
          items.some((i) => i.kind === 'raw' && i.id === prefillRawMaterialId)
        ) {
          autoAddedRef.current = true;
          setQuantities((q) => ({ ...q, [prefillRawMaterialId]: 0 }));
        }
        setStockPrefillDone(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingStock(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromLocationId, prefillRawMaterialId]);

  const itemById = useMemo(() => {
    const map = new Map<string, SourceItem>();
    for (const i of sourceItems) map.set(i.id, i);
    return map;
  }, [sourceItems]);

  const selectedIds = useMemo(
    () => Object.keys(quantities).filter((id) => itemById.has(id)),
    [quantities, itemById],
  );

  // Not-yet-added items matching the search, grouped by category (for the picker).
  const pickerGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const available = sourceItems.filter(
      (i) => !(i.id in quantities) && (!q || i.title.toLowerCase().includes(q)),
    );
    const byCategory = new Map<string, SourceItem[]>();
    for (const item of available) {
      const key = item.category ?? MISC;
      const list = byCategory.get(key) ?? [];
      list.push(item);
      byCategory.set(key, list);
    }
    return Array.from(byCategory.entries())
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [sourceItems, quantities, search]);

  const addItem = (id: string) => setQuantities((q) => ({ ...q, [id]: 0 }));
  const removeItem = (id: string) =>
    setQuantities((q) => {
      const next = { ...q };
      delete next[id];
      return next;
    });
  const setQty = (id: string, value: number) => {
    const item = itemById.get(id);
    if (!item) return;
    setQuantities((q) => ({ ...q, [id]: clampQty(value, item.available) }));
  };

  const isAdhoc = toLocationId === ADHOC;

  const canSubmit =
    !!fromLocationId &&
    !!toLocationId &&
    fromLocationId !== toLocationId &&
    (!isAdhoc || destinationName.trim().length > 0) &&
    selectedIds.length > 0 &&
    selectedIds.every((id) => {
      const item = itemById.get(id);
      const qty = quantities[id];
      return item && qty > 0 && qty <= item.available;
    });

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const items = selectedIds
        .map((id) => ({ item: itemById.get(id)!, qty: quantities[id] }))
        .filter(({ qty }) => qty > 0)
        .map(({ item, qty }) =>
          item.kind === 'raw'
            ? { rawMaterialId: item.id, quantity: qty, unit: item.unit }
            : { recipeId: item.id, quantity: qty, unit: item.unit },
        );
      const created = await transfersApi.create({
        fromLocationId,
        // XOR destination: saved location OR ad-hoc name (+ optional address) — never both.
        ...(isAdhoc
          ? {
              destinationName: destinationName.trim(),
              destinationAddress: destinationAddress.trim() || undefined,
            }
          : { toLocationId }),
        destinationContact: destinationContact.trim() || undefined,
        notes: notes.trim() || undefined,
        assignedToId: assignedToId || undefined,
        delegateIdCard: delegateIdCard.trim() || undefined,
        transportMeans: transportMeans.trim() || undefined,
        dispatchedAt: dispatchedAt ? new Date(`${dispatchedAt}T00:00:00`).toISOString() : undefined,
        items,
      });
      const destLabel = isAdhoc
        ? destinationName.trim()
        : (locationList.find((l) => l.id === toLocationId)?.name ?? '');
      setSnapshot(currentSnapshot);
      toast.success('Transferul a fost inițiat', {
        description: `${destLabel ? `Către ${destLabel} — ` : ''}${items.length} articole`,
      });
      router.push(`/stock/transfers/${created.id}`);
    } catch {
      toast.error('Eroare la crearea transferului');
      setSaving(false);
    }
  };

  if (!can('create', 'Transfer')) {
    return (
      <p className="text-sm text-muted-foreground">Nu ai permisiunea de a crea transferuri.</p>
    );
  }

  const destinationOptions = locationList.filter((l) => l.id !== fromLocationId);

  return (
    <div className="space-y-6">
      {/* Header stays full width (actions flush right); only the form body is narrow. */}
      <div>
        <button
          type="button"
          onClick={() => guardedNavigate(() => router.push('/stock/transfers'))}
          className="-ml-1.5 mb-1.5 inline-flex min-h-[32px] cursor-pointer items-center gap-0.5 rounded-lg px-1.5 text-[13.5px] font-semibold text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
        >
          <ChevronLeft className="h-[17px] w-[17px]" />
          Transferuri
        </button>
        <PageHead title="Transfer nou" meta="Mută stoc dintr-o locație în alta">
          <IconAction
            icon={X}
            word="Anulează"
            label="Anulează transferul"
            title="Renunță, nimic nu se salvează"
            onClick={() => guardedNavigate(() => router.back())}
          />
          <IconAction
            icon={Save}
            word="Creează"
            tone="primary"
            label="Creează transfer"
            title={
              canSubmit
                ? 'Pornește transferul cu articolele alese'
                : 'Alege sursa, destinația și cel puțin un articol cu cantitate'
            }
            onClick={handleSubmit}
            disabled={!canSubmit || saving}
            spinning={saving}
          />
        </PageHead>
      </div>
      {dialog}

      <div className="max-w-2xl space-y-6">
        {/* 1. Source location */}
        <TutorialAnchor id="stock.transfers.open">
          <Card>
            <CardHeader>
              <CardTitle>De la (locație sursă)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Locație sursă">
                {locationList.map((l) => (
                  <Pill
                    key={l.id}
                    on={fromLocationId === l.id}
                    onClick={() => {
                      setFromLocationId(l.id);
                      if (toLocationId === l.id) setToLocationId('');
                    }}
                  >
                    {l.name}
                  </Pill>
                ))}
                {locationList.length === 0 && (
                  <span className="text-sm text-muted-foreground">Nicio locație definită.</span>
                )}
              </div>
            </CardContent>
          </Card>
        </TutorialAnchor>

        {/* 2. Products */}
        {fromLocationId && (
          <TutorialAnchor id="stock.transfers.items">
            <Card>
              <CardHeader>
                <CardTitle>Ce transferi?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Selected items with quantity inputs */}
                {selectedIds.length > 0 && (
                  <div className="space-y-2">
                    {selectedIds.map((id) => {
                      const item = itemById.get(id)!;
                      const qty = quantities[id];
                      return (
                        <div key={id} className="flex items-center gap-3 rounded-lg border p-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Truncate text={item.title} className="text-[13.5px] font-medium" />
                              {item.kind === 'recipe' && (
                                <Badge variant="secondary" className="rounded-full text-[11px]">
                                  Produs
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              disponibil {formatUnitQty(item.available, item.unit)}
                            </p>
                          </div>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            max={item.available}
                            value={qty || ''}
                            onChange={(e) => setQty(id, parseFloat(e.target.value))}
                            className="w-24 text-right"
                          />
                          <span className="w-10 text-xs text-muted-foreground">
                            {unitTypeLabels[item.unit]}
                          </span>
                          <IconAction
                            row
                            icon={Trash2}
                            label="Scoate produsul din transfer"
                            onClick={() => removeItem(id)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Picker */}
                {loadingStock ? (
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă stocul...
                  </span>
                ) : sourceItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
                    <PackageSearch className="h-6 w-6" />
                    Locația sursă nu are stoc disponibil de transferat.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Caută produs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    {pickerGroups.length === 0 ? (
                      <p className="py-3 text-center text-sm text-muted-foreground">
                        {search.trim()
                          ? `Niciun produs pentru „${search.trim()}”.`
                          : 'Toate produsele disponibile sunt deja în transfer.'}
                      </p>
                    ) : (
                      <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border p-2">
                        {pickerGroups.map((group) => (
                          <div key={group.category} className="space-y-1">
                            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {group.category}
                            </p>
                            {group.items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => addItem(item.id)}
                                className="flex min-h-[42px] w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <Truncate text={item.title} className="text-[13.5px]" />
                                    {item.kind === 'recipe' && (
                                      <Badge
                                        variant="secondary"
                                        className="rounded-full text-[11px]"
                                      >
                                        Produs
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {formatUnitQty(item.available, item.unit)}
                                </span>
                                <Plus className="h-4 w-4 shrink-0 text-primary" />
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TutorialAnchor>
        )}

        {/* 3. Destination + transport + notes */}
        {fromLocationId && (
          <Card>
            <CardHeader>
              <CardTitle>Destinație și transport</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Către (destinație) *</Label>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Destinație">
                  {destinationOptions.map((l) => (
                    <Pill
                      key={l.id}
                      on={toLocationId === l.id}
                      onClick={() => setToLocationId(l.id)}
                    >
                      {l.name}
                    </Pill>
                  ))}
                  <Pill on={isAdhoc} onClick={() => setToLocationId(ADHOC)}>
                    Altă destinație (eveniment)
                  </Pill>
                </div>
              </div>

              {isAdhoc && (
                <>
                  <div className="space-y-2">
                    <Label>Destinație *</Label>
                    <Input
                      placeholder="ex. Eveniment nuntă — Hotel X"
                      value={destinationName}
                      maxLength={200}
                      onChange={(e) => setDestinationName(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Destinație punctuală (nu se salvează ca locație). La finalizare, produsele ies
                      din stoc.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Adresă (opțional)</Label>
                    <Input
                      placeholder="Adresa destinației..."
                      value={destinationAddress}
                      maxLength={500}
                      onChange={(e) => setDestinationAddress(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>Destinatar (opțional)</Label>
                <Input
                  placeholder="Persoana care primește marfa..."
                  value={destinationContact}
                  maxLength={200}
                  onChange={(e) => setDestinationContact(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Apare pe avizul de însoțire.</p>
              </div>

              <div className="space-y-2">
                <Label>Transport (opțional)</Label>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Transport">
                  <Pill on={!assignedToId} onClick={() => setAssignedToId('')}>
                    Neasignat
                  </Pill>
                  {userList.map((u) => (
                    <Pill
                      key={u.id}
                      on={assignedToId === u.id}
                      onClick={() => setAssignedToId(u.id)}
                    >
                      {u.firstName} {u.lastName}
                    </Pill>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Persoana care duce transferul. Obligatorie pentru a-l pune în tranzit (poți alege
                  și mai târziu).
                </p>
              </div>

              {/* Aviz de însoțire — delegate / transport details (printed). */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>CI delegat (opțional)</Label>
                  <Input
                    placeholder="ex: XZ 123456"
                    value={delegateIdCard}
                    maxLength={100}
                    onChange={(e) => setDelegateIdCard(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mijloc de transport (opțional)</Label>
                  <Input
                    placeholder="ex: auto B-01-ABC"
                    value={transportMeans}
                    maxLength={100}
                    onChange={(e) => setTransportMeans(e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Data expedierii (opțional)</Label>
                  <DatePicker
                    value={dispatchedAt}
                    onChange={setDispatchedAt}
                    aria-label="Data expedierii"
                    className="h-[42px]"
                  />
                  <p className="text-xs text-muted-foreground">Apare pe avizul de însoțire.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  placeholder="Note opționale..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
