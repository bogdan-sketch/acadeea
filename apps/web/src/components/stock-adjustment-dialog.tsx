'use client';

import { useState, useEffect, useMemo } from 'react';
import { stock, rawMaterials, locations as locationsApi, organization as orgApi } from '@/lib/api';
import type {
  ItemLocationStock,
  Location,
  Organization,
  RawMaterial,
  StockItemAvailability,
} from '@/lib/types';
import { StockMovementType, UnitType } from '@horae/shared-types';
import { adjustmentReasons } from '@/lib/constants';
import { priceUnitLabel, unitTypeLabels } from '@/lib/constants';
import { useVatSettings, vatBasisLabel } from '@/hooks/use-vat';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceListField } from '@/components/choice-list';
import { Check, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatUnitQty } from '@/lib/utils';
import { useDialogUnsavedGuard } from '@/hooks/use-unsaved-changes';

type MovementMode = 'AJUSTARE' | 'INTRARE';

export interface StockAdjustmentPresetItem {
  kind: 'raw' | 'consumable' | 'recipe';
  id: string;
  title: string;
  unit: UnitType;
  stockCount: number;
}

interface StockAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Preselected tab: AJUSTARE (delta) or INTRARE (receptie cu lot/factura). */
  defaultMode?: MovementMode;
  /** Lock the dialog to a known item (raw material or consumable) — hides the picker. */
  presetItem?: StockAdjustmentPresetItem;
}

export function StockAdjustmentDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultMode = 'AJUSTARE',
  presetItem,
}: StockAdjustmentDialogProps) {
  const [mode, setMode] = useState<MovementMode>(defaultMode);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [materialId, setMaterialId] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('ALTELE');
  const [notes, setNotes] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [invoice, setInvoice] = useState('');
  const [price, setPrice] = useState('');
  // cu/fără TVA — defaults to the org's natural invoice form.
  const vat = useVatSettings();
  const [priceIncludesVat, setPriceIncludesVat] = useState<boolean | null>(null);
  const includeVat = priceIncludesVat ?? !vat.vatPayer;
  const [saving, setSaving] = useState(false);
  // Per-item availability (locations + reservations) — loaded for every raw
  // material (preset or picker), and lazily at submit for consumables. Keyed by
  // itemId so a stale response for a previous material is never used.
  const [availState, setAvailState] = useState<{
    itemId: string;
    data: StockItemAvailability | null;
    error: boolean;
  } | null>(null);
  const [myLocations, setMyLocations] = useState<Location[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  // The user's explicit location pick (keyed by itemId); when absent, the
  // selection falls back to the computed default.
  const [pickedLocation, setPickedLocation] = useState<{
    itemId: string;
    locationId: string;
  } | null>(null);
  const [warnOpen, setWarnOpen] = useState(false);

  useEffect(() => {
    if (open) setMode(defaultMode);
  }, [open, defaultMode]);

  useEffect(() => {
    // With a preset item the picker is hidden — no need for the material list.
    if (open && !presetItem) {
      rawMaterials
        .list({ limit: 200 })
        .then((r) => setMaterials(r.data))
        .catch(() => {});
    }
  }, [open, presetItem]);

  // The user's own locations — used to build/target the AJUSTARE location list.
  useEffect(() => {
    if (!open) return;
    locationsApi
      .myLocations()
      .then((locs) => (locs.length > 0 ? locs : locationsApi.list()))
      .catch(() => locationsApi.list().catch(() => [] as Location[]))
      .then((locs) => setMyLocations(locs));
    orgApi
      .get()
      .then(setOrg)
      .catch(() => {});
  }, [open]);

  const selectedMaterial = materials.find((m) => m.id === materialId);

  const itemKind: 'raw' | 'consumable' | 'recipe' = presetItem?.kind ?? 'raw';
  // Raw materials AND produced products (recipes) track stock per location, so
  // they share the same location-scoped adjustment logic; consumables are global.
  const perLocation = itemKind === 'raw' || itemKind === 'recipe';
  const itemId = presetItem?.id ?? materialId;
  const itemUnit = presetItem?.unit ?? selectedMaterial?.unit ?? UnitType.GRAME;
  const itemTitle = presetItem?.title ?? selectedMaterial?.title ?? 'articol';
  const itemStock = presetItem ? presetItem.stockCount : Number(selectedMaterial?.stockCount ?? 0);

  // Per-location item (raw material or produced product) → load the per-location
  // breakdown so AJUSTARE always targets a specific location's quantity.
  useEffect(() => {
    if (!open || !perLocation || !itemId) return;
    let cancelled = false;
    stock
      .itemAvailability(itemKind === 'recipe' ? { recipeId: itemId } : { rawMaterialId: itemId })
      .then((a) => {
        if (!cancelled) setAvailState({ itemId, data: a, error: false });
      })
      .catch(() => {
        if (!cancelled) setAvailState({ itemId, data: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [open, itemKind, itemId]);

  // Only the CURRENT item's availability counts — a response cached for a
  // previously selected material is ignored.
  const availability = availState?.itemId === itemId ? availState.data : null;
  const availError = availState?.itemId === itemId ? availState.error : false;

  // Location options = union of the availability locations and the user's own
  // locations (the latter shown with quantity 0 when they hold no stock).
  const locationOptions = useMemo<ItemLocationStock[]>(() => {
    if (!perLocation || !availability) return [];
    const options = [...availability.locations];
    const seen = new Set(options.map((o) => o.locationId));
    for (const loc of myLocations) {
      if (!seen.has(loc.id)) {
        options.push({
          locationId: loc.id,
          locationName: loc.name,
          quantity: 0,
          reservedCount: 0,
        });
        seen.add(loc.id);
      }
    }
    return options;
  }, [itemKind, availability, myLocations]);

  // Selected location = the user's explicit pick when still valid, otherwise
  // the default: the organization's default location (Stoc › Locații) when in
  // the options, else the user's FIRST location when present, else the first
  // availability location.
  const locationId = useMemo(() => {
    if (locationOptions.length === 0) return '';
    if (
      pickedLocation?.itemId === itemId &&
      locationOptions.some((o) => o.locationId === pickedLocation.locationId)
    ) {
      return pickedLocation.locationId;
    }
    const configured = org?.defaultLocationId;
    if (configured && locationOptions.some((o) => o.locationId === configured)) return configured;
    const mine = myLocations.find((ml) => locationOptions.some((o) => o.locationId === ml.id));
    return mine?.id ?? locationOptions[0].locationId;
  }, [locationOptions, myLocations, pickedLocation, itemId, org?.defaultLocationId]);

  const selectedLocation = locationOptions.find((l) => l.locationId === locationId);

  // Current stock in the adjusted scope: the SELECTED location's quantity for
  // raw materials (0 when it holds none), the global count for consumables.
  const scopedStockReady = !perLocation || !!selectedLocation;
  const currentStock =
    mode === 'AJUSTARE' && perLocation ? (selectedLocation?.quantity ?? 0) : itemStock;

  // AJUSTARE on a per-location item needs the per-location context — never fall
  // back to global math (it corrupts multi-location totals).
  const adjustBlocked =
    mode === 'AJUSTARE' && perLocation && (availError || !availability || !selectedLocation);

  const reset = () => {
    setMaterialId('');
    setDelta('');
    setReason('ALTELE');
    setNotes('');
    setLotNumber('');
    setInvoice('');
    setPrice('');
    setPriceIncludesVat(null);
    setAvailState(null);
    setPickedLocation(null);
  };

  // Guard closing the dialog when the user has typed movement data that would be
  // lost (quantity, note, lot/invoice/price, or a non-default reason).
  const isDirty =
    delta !== '' ||
    notes !== '' ||
    lotNumber !== '' ||
    invoice !== '' ||
    price !== '' ||
    reason !== 'ALTELE' ||
    priceIncludesVat !== null;
  const onClose = () => {
    onOpenChange(false);
    reset();
  };
  const { handleOpenChange, confirmDialog } = useDialogUnsavedGuard({ isDirty, onClose });

  const ensureAvailability = async (): Promise<StockItemAvailability | null> => {
    if (availability) return availability;
    if (!itemId) return null;
    try {
      const a = await stock.itemAvailability(
        itemKind === 'consumable'
          ? { consumableId: itemId }
          : itemKind === 'recipe'
            ? { recipeId: itemId }
            : { rawMaterialId: itemId },
      );
      setAvailState({ itemId, data: a, error: false });
      return a;
    } catch {
      return null;
    }
  };

  const closeWithSuccess = (message: string) => {
    toast.success(message);
    onOpenChange(false);
    reset();
    onSuccess?.();
  };

  const performAdjustment = async () => {
    // AJUSTARE sets the absolute stock value on the backend, but this dialog
    // takes a +/- delta — so apply the delta to the current (scoped) stock.
    const newAbsolute = Math.max(0, currentStock + Number(delta));
    const referenceNote = `${adjustmentReasons.find((r) => r.value === reason)?.label || reason}${notes ? `: ${notes}` : ''}`;
    setSaving(true);
    try {
      if (itemKind === 'recipe') {
        await stock.createRecipeMovement({
          movementType: StockMovementType.AJUSTARE,
          recipeId: itemId,
          quantity: newAbsolute,
          unit: itemUnit,
          referenceNote,
          ...(locationId ? { locationId } : {}),
        });
      } else {
        await stock.createMovement({
          movementType: StockMovementType.AJUSTARE,
          ...(itemKind === 'consumable' ? { consumableId: itemId } : { rawMaterialId: itemId }),
          quantity: newAbsolute,
          unit: itemUnit,
          referenceNote,
          // Raw-material adjustments are ALWAYS per-location; consumables stay global.
          ...(itemKind === 'raw' && locationId ? { locationId } : {}),
        });
      }
      closeWithSuccess(
        newAbsolute === 0
          ? `Stocul la ${itemTitle} a fost redus la 0`
          : `Stoc ajustat: ${itemTitle} — ${formatUnitQty(newAbsolute, itemUnit)}`,
      );
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!itemId || !delta) return;
    if (mode === 'INTRARE') {
      if (!(Number(delta) > 0)) {
        toast.error('Cantitatea trebuie să fie mai mare decât 0');
        return;
      }
      setSaving(true);
      try {
        if (itemKind === 'recipe') {
          // Produced-product intake has no lot/invoice/price — just a quantity.
          await stock.createRecipeMovement({
            movementType: StockMovementType.INTRARE,
            recipeId: itemId,
            quantity: Math.abs(Number(delta)),
            unit: itemUnit,
            referenceNote: notes || undefined,
            ...(locationId ? { locationId } : {}),
          });
        } else {
          await stock.createMovement({
            movementType: StockMovementType.INTRARE,
            ...(itemKind === 'consumable' ? { consumableId: itemId } : { rawMaterialId: itemId }),
            quantity: Math.abs(Number(delta)),
            unit: itemUnit,
            referenceNote: notes || undefined,
            lotNumber: lotNumber || undefined,
            supplierInvoice: invoice || undefined,
            purchasePrice: price ? Number(price) : undefined,
            priceIncludesVat: price ? includeVat : undefined,
          });
        }
        closeWithSuccess('Recepție înregistrată');
      } catch (err: unknown) {
        toast.error((err as { message?: string }).message || 'Eroare la salvare');
      } finally {
        setSaving(false);
      }
      return;
    }

    // AJUSTARE — warn before wiping out stock that is reserved for tasks or
    // sits in pending transfers, scoped to the adjusted location.
    if (adjustBlocked) return;
    const newAbsolute = Math.max(0, currentStock + Number(delta));
    let shouldWarn = false;
    if (perLocation) {
      const scopedReserved = selectedLocation?.reservedCount ?? 0;
      const scopedTransfers = (availability?.pendingTransfers ?? []).filter(
        (t) => t.fromLocationId === locationId,
      ).length;
      shouldWarn =
        (scopedReserved > 0 || scopedTransfers > 0) &&
        (newAbsolute === 0 || newAbsolute < scopedReserved);
    } else {
      setSaving(true);
      const avail = await ensureAvailability();
      setSaving(false);
      shouldWarn =
        !!avail &&
        avail.reservedForTasks > 0 &&
        (newAbsolute === 0 || newAbsolute < avail.reservedForTasks);
    }
    if (shouldWarn) {
      setWarnOpen(true);
      return;
    }
    await performAdjustment();
  };

  // Scoped values shown in the reservation warning.
  const warnReserved = perLocation
    ? (selectedLocation?.reservedCount ?? 0)
    : (availability?.reservedForTasks ?? 0);
  const warnTransfers = perLocation
    ? (availability?.pendingTransfers ?? []).filter((t) => t.fromLocationId === locationId).length
    : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === 'INTRARE' ? 'Recepție marfă' : 'Mișcare stoc'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* DS segmented control: Receptie (intrare) vs Ajustare (delta) */}
            <div className="flex rounded-[10px] bg-muted p-0.5">
              {(
                [
                  ['INTRARE', 'Recepție'],
                  ['AJUSTARE', 'Ajustare'],
                ] as [MovementMode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg py-1.5 text-[13px] font-semibold transition-colors ${
                    mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {presetItem ? (
              <div className="space-y-2">
                <Label>
                  {presetItem.kind === 'consumable'
                    ? 'Consumabil'
                    : presetItem.kind === 'recipe'
                      ? 'Produs'
                      : 'Material'}
                </Label>
                <div className="rounded-[10px] bg-muted px-3 py-2 text-sm font-medium">
                  {presetItem.title}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Material</Label>
                <ChoiceListField
                  title="Alege materialul"
                  aria-label="Material"
                  placeholder="Selectează material"
                  searchPlaceholder="Caută material…"
                  emptyText="Niciun material găsit."
                  value={materialId}
                  // Availability + location pick are keyed per item — the
                  // effect refetches and the selection re-defaults.
                  onChange={(v) => setMaterialId(v)}
                  options={materials.map((m) => ({
                    value: m.id,
                    label: m.title,
                    meta: formatUnitQty(m.stockCount, m.unit),
                  }))}
                />
              </div>
            )}

            {/* AJUSTARE on raw materials is per-location — the select is ALWAYS
                visible (even with a single option) so the user sees where the
                adjustment lands. */}
            {mode === 'AJUSTARE' && perLocation && locationOptions.length > 0 && (
              <div className="space-y-2">
                <Label>Locație</Label>
                <ChoiceChips
                  label="Locație"
                  value={locationId}
                  onChange={(v) => v && setPickedLocation({ itemId, locationId: v })}
                  options={locationOptions.map((l) => ({
                    value: l.locationId,
                    label: `${l.locationName} — ${formatUnitQty(l.quantity, itemUnit)}`,
                  }))}
                />
              </div>
            )}

            {mode === 'AJUSTARE' && perLocation && availError && (
              <p className="text-sm text-red-600">Nu s-a putut încărca stocul pe locații</p>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                {/* The number is in the item's own unit — say which, so 596 is
                    never typed as grams into a kilogram item. */}
                <Label>
                  {mode === 'INTRARE' ? 'Cantitate primită' : 'Cantitate (+/-)'} (
                  {unitTypeLabels[itemUnit] ?? itemUnit})
                </Label>
                {mode === 'AJUSTARE' && itemId && scopedStockReady && (
                  <button
                    type="button"
                    onClick={() => setDelta(String(-currentStock))}
                    className="text-xs font-medium text-primary transition-opacity hover:opacity-80"
                  >
                    Adu la 0
                  </button>
                )}
              </div>
              <Input
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder={mode === 'INTRARE' ? 'ex: 25' : 'ex: -5 sau 10'}
              />
              {itemId && (mode !== 'AJUSTARE' || scopedStockReady) && (
                <p className="text-xs text-muted-foreground">
                  Stoc curent
                  {mode === 'AJUSTARE' && perLocation && selectedLocation
                    ? ` (${selectedLocation.locationName})`
                    : ''}
                  : {formatUnitQty(currentStock, itemUnit)}
                </p>
              )}
            </div>

            {mode === 'INTRARE' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nr. lot</Label>
                  <Input
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    placeholder="ex: L-2026-14"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nr. factură</Label>
                  <Input
                    value={invoice}
                    onChange={(e) => setInvoice(e.target.value)}
                    placeholder="ex: FAC-1021"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Preț achiziție (RON/{priceUnitLabel(itemUnit)}, opțional)</Label>
                  <Input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="ex: 12.50"
                  />
                </div>
                <div className="col-span-2 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label>Prețul include TVA</Label>
                    <p className="text-xs text-muted-foreground">
                      Se reține {vatBasisLabel(vat.vatPayer)} (cota {vat.vatRatePercent}%).
                    </p>
                  </div>
                  <Switch checked={includeVat} onCheckedChange={setPriceIncludesVat} />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Motiv</Label>
                <ChoiceChips
                  label="Motiv"
                  value={reason}
                  onChange={(v) => v && setReason(v)}
                  options={adjustmentReasons}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Notiță (opțional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalii suplimentare"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleOpenChange(false)}
              title="Anulează"
              aria-label="Anulează"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              onClick={handleSave}
              disabled={!itemId || !delta || saving || adjustBlocked}
              title="Salvează mișcarea de stoc"
              aria-label="Salvează mișcarea de stoc"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reservation warning — the adjustment would drop stock to 0 / below the
          amount reserved (scoped to the adjusted location for raw materials). */}
      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atenție — stoc rezervat</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 text-sm text-muted-foreground">
            {warnReserved > 0 && (
              <p>
                Rezervat pentru sarcini în lucru
                {perLocation && selectedLocation
                  ? ` la ${selectedLocation.locationName}`
                  : ''}: {formatUnitQty(warnReserved, itemUnit)}
              </p>
            )}
            {warnTransfers > 0 && <p>Transferuri în curs din această locație: {warnTransfers}</p>}
            <p className="font-medium text-foreground">Continui cu ajustarea?</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setWarnOpen(false)}
              title="Nu — renunță la ajustare"
              aria-label="Nu — renunță la ajustare"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              variant="destructive"
              size="icon"
              disabled={saving}
              onClick={async () => {
                setWarnOpen(false);
                await performAdjustment();
              }}
              title="Da, continuă cu ajustarea"
              aria-label="Da, continuă cu ajustarea"
            >
              <Check className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
