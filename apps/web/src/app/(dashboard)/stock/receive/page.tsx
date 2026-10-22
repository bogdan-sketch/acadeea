'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  rawMaterials as rawApi,
  locations as locationsApi,
  stock as stockApi,
  organization as orgApi,
} from '@/lib/api';
import { pickDefaultLocation } from '@/lib/default-location';
import type { RawMaterial, Location, BatchReceiveItem } from '@/lib/types';
import { UnitType } from '@horae/shared-types';
import { priceUnitLabel, selectableUnits, unitTypeLabels } from '@/lib/constants';
import { convertMetric, formatUnitQty, formatMoney, inputUnitsFor } from '@/lib/utils';
import { BackLink } from '@/components/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceListField } from '@/components/choice-list';
import { IconAction, PageHead } from '@/app/(dashboard)/stock/_ui/parts';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { usePermissions } from '@/contexts/auth-context';
import { useVatSettings, vatBasisLabel } from '@/hooks/use-vat';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { parseDecimal } from '@/lib/ro-number';

const UNIT_OPTIONS = selectableUnits.map((u) => ({
  value: u,
  label: unitTypeLabels[u],
}));

// Purchase prices are per COMMERCIAL unit (RON/kg, RON/L) — convert the typed
// quantity to that unit before totalling. Mirrors lib/constants priceUnitLabel.
const COMMERCIAL_UNIT_FACTOR: Partial<Record<UnitType, number>> = {
  [UnitType.MILIGRAME]: 1 / 1_000_000,
  [UnitType.GRAME]: 1 / 1000,
  [UnitType.KILOGRAME]: 1,
  [UnitType.MILILITRI]: 1 / 1000,
  [UnitType.LITRI]: 1,
};

interface ReceiveRow {
  key: string;
  rawMaterialId: string;
  quantity: string;
  /** Unit the quantity is TYPED in (chips: same metric family as the stock unit). */
  unit: UnitType;
  /** The material's own unit — stock, lot and journal are kept in it. */
  stockUnit: UnitType;
  lotNumber: string;
  expiryDate: string;
  purchasePrice: string;
}

/** Default the expiry to +6 months (matches the iOS BatchReceiveView default). */
function defaultExpiry(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

function newRow(): ReceiveRow {
  return {
    key: crypto.randomUUID(),
    rawMaterialId: '',
    quantity: '',
    unit: UnitType.KILOGRAME,
    stockUnit: UnitType.KILOGRAME,
    lotNumber: '',
    expiryDate: defaultExpiry(),
    purchasePrice: '',
  };
}

// Searchable material picker (shared ChoiceListField) showing each material's
// stock on hand; optional inline quick-create when nothing matches.
function MaterialPicker({
  materials,
  value,
  onSelect,
  onCreateNew,
  canCreate,
  label,
}: {
  materials: RawMaterial[];
  value: string;
  onSelect: (material: RawMaterial) => void;
  onCreateNew: (initialTitle: string) => void;
  canCreate: boolean;
  label: string;
}) {
  return (
    <ChoiceListField
      title="Alege materialul"
      aria-label={label}
      placeholder="Selectează material"
      searchPlaceholder="Caută material…"
      emptyText={
        canCreate ? 'Niciun material găsit — creează-l mai jos.' : 'Niciun material găsit.'
      }
      value={value}
      className="bg-card"
      options={materials.map((m) => ({
        value: m.id,
        label: m.title,
        hint: m.producer ?? undefined,
        meta: formatUnitQty(m.stockCount, m.unit),
      }))}
      onChange={(id) => {
        const m = materials.find((x) => x.id === id);
        if (m) onSelect(m);
      }}
      onCreate={canCreate ? onCreateNew : undefined}
      createLabel={(q) => (q ? `Adaugă „${q}” ca material nou` : 'Material nou')}
    />
  );
}

export default function StockReceivePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <StockReceiveContent />
    </Suspense>
  );
}

function StockReceiveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?rawMaterialId= — seed the first reception row (quick action from the material detail).
  const prefillMaterialId = searchParams.get('rawMaterialId');
  const { can } = usePermissions();
  const canReceive = can('create', 'StockMovement');

  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [availableLocations, setAvailableLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [supplierInvoice, setSupplierInvoice] = useState('');
  const [rows, setRows] = useState<ReceiveRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const canCreateMaterial = can('create', 'RawMaterial');
  // Inline "material nou" quick-create — bound to the reception row that opened it.
  const [createRowKey, setCreateRowKey] = useState<string | null>(null);
  const [newMaterialTitle, setNewMaterialTitle] = useState('');
  const [newMaterialUnit, setNewMaterialUnit] = useState<UnitType>(UnitType.KILOGRAME);
  const [creatingMaterial, setCreatingMaterial] = useState(false);
  // cu/fără TVA toggle for the whole receipt; defaults to the org's natural
  // invoice form once VAT settings load (payer → prices typed fără TVA).
  const vat = useVatSettings();
  const [pricesIncludeVat, setPricesIncludeVat] = useState<boolean | null>(null);
  const includeVat = pricesIncludeVat ?? !vat.vatPayer;

  useEffect(() => {
    rawApi
      .list({ limit: 200 })
      .then(async (r) => {
        let mats = r.data;
        // The prefilled material may sit past the first page — fetch it by id
        // and append it so the quick action never silently no-ops.
        let prefill = prefillMaterialId ? mats.find((m) => m.id === prefillMaterialId) : undefined;
        if (prefillMaterialId && !prefill) {
          try {
            prefill = await rawApi.get(prefillMaterialId);
            mats = [...mats, prefill];
          } catch {
            // Material inexistent/inaccesibil — leave the row unseeded.
          }
        }
        setMaterials(mats);
        if (prefill) {
          const { id, unit } = prefill;
          setRows((prev) =>
            prev.map((row, i) =>
              i === 0 ? { ...row, rawMaterialId: id, unit, stockUnit: unit } : row,
            ),
          );
        }
      })
      .catch(() => {});
  }, [prefillMaterialId]);

  useEffect(() => {
    // Source list mirrors iOS BatchReceiveViewModel.loadLocations(): the
    // user's own locations, falling back to all ACTIVE locations only when
    // none are assigned. Default SELECTION below additionally prefers the
    // admin-configured org default (web-only for now — iOS still preselects
    // the first one).
    const allActive = () =>
      locationsApi.list().then((all) => all.filter((l) => l.isActive !== false));
    Promise.all([
      locationsApi
        .myLocations()
        .then((locs) => (locs.length > 0 ? locs : allActive()))
        .catch(() => allActive().catch(() => [] as Location[])),
      orgApi.get().catch(() => null),
    ]).then(([locs, org]) => {
      setAvailableLocations(locs);
      // ClickUp "loc implicit recepție": preferă Organization.defaultLocationId
      // (admin-configurable) dacă e setat și activ, altfel Laborator, altfel
      // prima locație (comportamentul vechi) — la fel ca la crearea unui task.
      setLocationId((prev) => prev || pickDefaultLocation(locs, org)?.id || '');
    });
  }, []);

  const updateRow = useCallback((key: string, patch: Partial<ReceiveRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const removeRow = (key: string) =>
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length > 0 ? next : [newRow()];
    });

  const selectMaterial = (key: string, material: RawMaterial) =>
    updateRow(key, { rawMaterialId: material.id, unit: material.unit, stockUnit: material.unit });

  const openCreateMaterial = (rowKey: string, initialTitle: string) => {
    setCreateRowKey(rowKey);
    setNewMaterialTitle(initialTitle);
    setNewMaterialUnit(UnitType.KILOGRAME);
  };

  const handleCreateMaterial = async () => {
    const title = newMaterialTitle.trim();
    if (!title || !createRowKey) return;
    setCreatingMaterial(true);
    try {
      const created = await rawApi.create({ title, unit: newMaterialUnit });
      // Make it selectable and drop it straight into the row that asked for it.
      setMaterials((prev) => [...prev, created]);
      selectMaterial(createRowKey, created);
      toast.success(`Material „${created.title}" creat`);
      setCreateRowKey(null);
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Eroare la crearea materialului');
    } finally {
      setCreatingMaterial(false);
    }
  };

  // RO keyboards type decimals with a comma ("6,72", "1.250,5"); invalid → NaN.
  const toNum = (s: string) => parseDecimal(s) ?? Number.NaN;

  // What lands in stock, in the MATERIAL's unit: the typed quantity converted
  // explicitly (600 g typed for a material kept in kg → 0,6 kg), shown under
  // the input before saving and sent as such — the server never has to guess.
  const stockQty = (r: ReceiveRow): number => {
    const q = toNum(r.quantity);
    return convertMetric(q, r.unit, r.stockUnit) ?? q;
  };

  const validRows = rows.filter((r) => r.rawMaterialId && toNum(r.quantity) > 0);
  // A negative price would be stored and shown as "-1.00 RON/kg" — block it.
  const negativePrice = rows.some(
    (r) => r.purchasePrice.trim() !== '' && toNum(r.purchasePrice) < 0,
  );

  // Design: the submit button carries the receipt total when prices are typed.
  const receiptTotal = validRows.reduce((sum, r) => {
    const price = toNum(r.purchasePrice);
    if (!price) return sum;
    return sum + stockQty(r) * (COMMERCIAL_UNIT_FACTOR[r.stockUnit] ?? 1) * price;
  }, 0);

  const handleSubmit = async () => {
    const items: BatchReceiveItem[] = validRows.map((r) => ({
      rawMaterialId: r.rawMaterialId,
      quantity: stockQty(r),
      unit: r.stockUnit,
      lotNumber: r.lotNumber.trim() || undefined,
      expiryDate: r.expiryDate ? new Date(r.expiryDate).toISOString() : undefined,
      purchasePrice: r.purchasePrice ? toNum(r.purchasePrice) : undefined,
      priceIncludesVat: r.purchasePrice ? includeVat : undefined,
      supplierInvoice: supplierInvoice.trim() || undefined,
    }));

    if (items.length === 0) {
      toast.error('Adaugă cel puțin un material cu cantitate validă');
      return;
    }

    setSaving(true);
    try {
      await stockApi.batchReceive({
        items,
        locationId: locationId || undefined,
      });
      // Confirmation summary: where the goods landed and what came in.
      const locName = availableLocations.find((l) => l.id === locationId)?.name;
      const lines = validRows.map((r) => {
        const title = materials.find((m) => m.id === r.rawMaterialId)?.title ?? 'Material';
        return `${formatUnitQty(stockQty(r), r.stockUnit)} ${title}`;
      });
      toast.success('Recepție făcută', {
        description: [locName, ...lines].filter(Boolean).join('\n'),
        duration: 6000,
      });
      router.push('/stock/movements');
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  };

  if (!canReceive) {
    return (
      <div className="space-y-4">
        <PageHead title="Recepție marfă" meta="Înregistrează intrări de materii prime" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nu ai permisiunea de a înregistra recepții.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <BackLink href="/stock" label="Stoc" />
        <PageHead
          title="Recepție marfă"
          meta="Înregistrează mai multe materii prime dintr-o singură intrare"
        >
          {receiptTotal > 0 && (
            <span className="text-[13px] font-semibold text-muted-foreground">
              Total {formatMoney(receiptTotal)}
            </span>
          )}
          <TutorialAnchor id="stock.receive.submit">
            <span className="inline-flex">
              <IconAction
                icon={Save}
                word="Salvează"
                tone="primary"
                label="Salvează recepția"
                title={
                  negativePrice
                    ? 'Prețul nu poate fi negativ'
                    : validRows.length === 0
                      ? 'Adaugă cel puțin un material cu cantitate'
                      : `Intră în stoc ${validRows.length} ${
                          validRows.length === 1 ? 'material' : 'materiale'
                        }${receiptTotal > 0 ? ` · ${formatMoney(receiptTotal)}` : ''}`
                }
                spinning={saving}
                onClick={handleSubmit}
                disabled={saving || validRows.length === 0 || negativePrice}
              />
            </span>
          </TutorialAnchor>
        </PageHead>
      </div>

      <div className="max-w-3xl space-y-4">
        {/* Invoice / location header — shared across all rows */}
        <TutorialAnchor id="stock.receive.open">
          <Card>
            <CardContent className="grid gap-4 py-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Locație destinație</Label>
                <ChoiceChips
                  label="Locație destinație"
                  value={locationId}
                  onChange={(v) => v && setLocationId(v)}
                  options={availableLocations.map((l) => ({ value: l.id, label: l.name }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nr. factură furnizor (opțional)</Label>
                <Input
                  value={supplierInvoice}
                  onChange={(e) => setSupplierInvoice(e.target.value)}
                  placeholder="ex: FAC-2026-1021"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label>Prețurile includ TVA</Label>
                  <p id="receive-vat-hint" className="text-xs text-muted-foreground">
                    Prețurile se rețin {vatBasisLabel(vat.vatPayer)} (cota {vat.vatRatePercent}%) —
                    conversia se face automat după această bifă.
                  </p>
                </div>
                <Switch
                  checked={includeVat}
                  onCheckedChange={setPricesIncludeVat}
                  aria-label="Prețurile includ TVA"
                  aria-describedby="receive-vat-hint"
                />
              </div>
            </CardContent>
          </Card>
        </TutorialAnchor>

        {/* Design (modalReceptie): "MATERIALE · N" section label, one muted block
          per material with white sub-field pills (Cantitate / Lot / Preț / Expiră). */}
        <TutorialAnchor id="stock.receive.addRow">
          <div className="text-xs font-bold uppercase tracking-[.4px] text-muted-foreground">
            Materiale · {rows.length}
          </div>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={row.key} className="rounded-[var(--radius-ctl)] bg-muted px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <MaterialPicker
                      materials={materials}
                      value={row.rawMaterialId}
                      label={`Materialul ${index + 1}`}
                      onSelect={(m) => selectMaterial(row.key, m)}
                      onCreateNew={(title) => openCreateMaterial(row.key, title)}
                      canCreate={canCreateMaterial}
                    />
                  </div>
                  <IconAction
                    row
                    icon={Trash2}
                    label={`Șterge materialul ${index + 1}`}
                    onClick={() => removeRow(row.key)}
                  />
                </div>

                <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
                  <div className="rounded-[7px] bg-card px-2.5 py-[7px] sm:col-span-2">
                    <label className="flex items-center justify-between gap-2">
                      <span className="shrink-0 text-muted-foreground">
                        Cantitate ({unitTypeLabels[row.unit]})
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={row.quantity}
                        onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                        placeholder="ex: 25"
                        className="w-full min-w-0 bg-transparent text-right font-bold outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
                      />
                    </label>
                    {row.rawMaterialId && inputUnitsFor(row.stockUnit).length > 1 && (
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <ChoiceChips
                          label={`Unitatea cantității ${index + 1}`}
                          height="h-7"
                          value={row.unit}
                          onChange={(v) => v && updateRow(row.key, { unit: v })}
                          options={inputUnitsFor(row.stockUnit).map((u) => ({
                            value: u,
                            label: unitTypeLabels[u],
                          }))}
                        />
                        {row.unit !== row.stockUnit && toNum(row.quantity) > 0 && (
                          <span className="font-semibold text-foreground">
                            = {formatUnitQty(stockQty(row), row.stockUnit)} în stoc
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <label className="flex items-center justify-between gap-2 rounded-[7px] bg-card px-2.5 py-[7px]">
                    <span className="shrink-0 text-muted-foreground">Lot</span>
                    <input
                      value={row.lotNumber}
                      onChange={(e) => updateRow(row.key, { lotNumber: e.target.value })}
                      placeholder="ex: L-2026-14"
                      className="w-full min-w-0 bg-transparent text-right font-bold outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 rounded-[7px] bg-card px-2.5 py-[7px]">
                    <span className="shrink-0 text-muted-foreground">
                      Preț (RON/{priceUnitLabel(row.stockUnit)})
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      aria-invalid={
                        row.purchasePrice.trim() !== '' && toNum(row.purchasePrice) < 0
                          ? true
                          : undefined
                      }
                      value={row.purchasePrice}
                      onChange={(e) => updateRow(row.key, { purchasePrice: e.target.value })}
                      placeholder="opțional"
                      className="w-full min-w-0 bg-transparent text-right font-bold outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 rounded-[7px] bg-card px-2.5 py-[7px]">
                    <span className="shrink-0 text-muted-foreground">Expiră</span>
                    {/* Format românesc dd.MM.yyyy — inputul nativ afișa formatul
                    US (mm/dd/yyyy) pe browsere fără locale ro. */}
                    <DatePicker
                      value={row.expiryDate}
                      onChange={(v) => updateRow(row.key, { expiryDate: v })}
                      aria-label={`Data expirării materialului ${index + 1}`}
                      align="end"
                      className="h-auto w-auto rounded-none border-0 bg-transparent p-0 text-xs font-bold"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </TutorialAnchor>

        <IconAction
          icon={Plus}
          word="Material"
          label="Adaugă material"
          title="Adaugă încă un rând de material la recepție"
          onClick={addRow}
        />

        {/* Inline quick-create: a new raw material without leaving the reception */}
        <Dialog open={createRowKey !== null} onOpenChange={(o) => !o && setCreateRowKey(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Material nou</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Denumire</Label>
                <Input
                  value={newMaterialTitle}
                  onChange={(e) => setNewMaterialTitle(e.target.value)}
                  placeholder="ex: Făină 000"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Unitate de măsură</Label>
                <ChoiceChips
                  label="Unitate de măsură"
                  value={newMaterialUnit}
                  onChange={(v) => v && setNewMaterialUnit(v)}
                  options={UNIT_OPTIONS}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Poți completa restul detaliilor (producător, furnizor, preț) mai târziu din pagina
                materialului.
              </p>
            </div>
            <DialogFooter>
              <IconAction
                icon={X}
                word="Anulează"
                label="Anulează"
                title="Închide fără să creezi materialul"
                onClick={() => setCreateRowKey(null)}
                disabled={creatingMaterial}
              />
              <IconAction
                icon={Plus}
                word="Creează"
                tone="primary"
                label="Creează și selectează"
                title="Creează materialul și pune-l pe rândul de recepție"
                onClick={handleCreateMaterial}
                disabled={creatingMaterial || !newMaterialTitle.trim()}
                spinning={creatingMaterial}
              />
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
