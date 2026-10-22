'use client';

import { useEffect, useState } from 'react';
import {
  rawMaterials as rawApi,
  locations as locationsApi,
  organization as orgApi,
  stockExtra,
} from '@/lib/api';
import { pickDefaultLocation } from '@/lib/default-location';
import type { RawMaterial, Location } from '@/lib/types';
import { UnitType } from '@horae/shared-types';
import { selectableUnits, unitTypeLabels } from '@/lib/constants';
import { formatUnitQty } from '@/lib/utils';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceListField } from '@/components/choice-list';
import { IconAction } from '@/app/(dashboard)/stock/_ui/parts';
import { toast } from 'sonner';
import { FlaskConical, Plus, Trash2, X } from 'lucide-react';
import { parseDecimal } from '@/lib/ro-number';

const UNIT_OPTIONS = selectableUnits.map((u) => ({
  value: u,
  label: unitTypeLabels[u],
}));

interface TestRow {
  key: string;
  rawMaterialId: string;
  quantity: string;
  unit: UnitType;
}

function newRow(): TestRow {
  return { key: crypto.randomUUID(), rawMaterialId: '', quantity: '', unit: UnitType.KILOGRAME };
}

// Searchable material picker (shared ChoiceListField) — same as the goods
// receipt (receive/page.tsx), without the inline quick-create.
function MaterialPicker({
  materials,
  value,
  onSelect,
  label,
}: {
  materials: RawMaterial[];
  value: string;
  onSelect: (material: RawMaterial) => void;
  label: string;
}) {
  return (
    <ChoiceListField
      title="Alege materialul"
      aria-label={label}
      placeholder="Selectează material"
      searchPlaceholder="Caută material…"
      emptyText="Niciun material găsit."
      className="bg-card"
      value={value}
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
    />
  );
}

/**
 * „Consum teste" — scoate materii prime din stoc pentru probele/testele de
 * laborator (IESIRE_TESTE), fără a le lega de o sarcină de producție.
 */
export function TestConsumptionDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [availableLocations, setAvailableLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [rows, setRows] = useState<TestRow[]>([newRow()]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Lazy-load pickers on first open; reset the form on every open.
  useEffect(() => {
    if (!open) return;
    setRows([newRow()]);
    setNotes('');
    if (loaded) return;
    setLoaded(true);
    rawApi
      .list({ limit: 200 })
      .then((r) => setMaterials(r.data))
      .catch(() => {});
    // Ca la recepție: locațiile userului (prima = principală, preselectată),
    // altfel toate locațiile active.
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
      setLocationId((prev) => prev || pickDefaultLocation(locs, org)?.id || '');
    });
  }, [open, loaded]);

  const updateRow = (key: string, patch: Partial<TestRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: string) =>
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length > 0 ? next : [newRow()];
    });

  // RO keyboards type decimals with a comma ("6,72", "1.250,5"); invalid → NaN.
  const toNum = (s: string) => parseDecimal(s) ?? Number.NaN;

  const validRows = rows.filter((r) => r.rawMaterialId && toNum(r.quantity) > 0);

  const handleSubmit = async () => {
    if (!locationId) {
      toast.error('Alege locația din care se consumă');
      return;
    }
    if (validRows.length === 0) {
      toast.error('Adaugă cel puțin un material cu cantitate validă');
      return;
    }
    setSaving(true);
    try {
      await stockExtra.testConsumption({
        locationId,
        items: validRows.map((r) => ({
          rawMaterialId: r.rawMaterialId,
          quantity: toNum(r.quantity),
          unit: r.unit,
        })),
        notes: notes.trim() || undefined,
      });
      const lines = validRows.map((r) => {
        const title = materials.find((m) => m.id === r.rawMaterialId)?.title ?? 'Material';
        return `${formatUnitQty(toNum(r.quantity), r.unit)} ${title}`;
      });
      toast.success('Consum teste înregistrat', {
        description: lines.join('\n'),
        duration: 6000,
      });
      onOpenChange(false);
      onSuccess();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Eroare la înregistrarea consumului');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Consum teste</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Scade din stoc materiile prime folosite la teste/probe, fără sarcină de producție.
          </p>
          <div className="space-y-2">
            <Label>Locație</Label>
            <ChoiceChips
              label="Locație"
              value={locationId}
              onChange={(v) => v && setLocationId(v)}
              options={availableLocations.map((l) => ({ value: l.id, label: l.name }))}
            />
          </div>

          <div className="text-xs font-bold uppercase tracking-[.4px] text-muted-foreground">
            Materiale · {rows.length}
          </div>
          <TutorialAnchor id="stock.testConsumption.rows">
            <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-0.5">
              {rows.map((row, index) => (
                <div key={row.key} className="rounded-[var(--radius-ctl)] bg-muted px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <MaterialPicker
                        materials={materials}
                        value={row.rawMaterialId}
                        label={`Materialul ${index + 1}`}
                        onSelect={(m) => updateRow(row.key, { rawMaterialId: m.id, unit: m.unit })}
                      />
                    </div>
                    <IconAction
                      row
                      icon={Trash2}
                      label={`Șterge materialul ${index + 1}`}
                      onClick={() => removeRow(row.key)}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
                    <label className="flex h-9 items-center justify-between gap-2 rounded-[7px] bg-card px-2.5">
                      <span className="shrink-0 text-muted-foreground">Cantitate</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.quantity}
                        onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                        placeholder="ex: 0,5"
                        className="w-full min-w-0 bg-transparent text-right font-bold outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
                      />
                    </label>
                    <ChoiceListField
                      title="Unitate de măsură"
                      aria-label={`Unitatea materialului ${index + 1}`}
                      searchPlaceholder="Caută unitate…"
                      className="h-9 rounded-[7px] border-0 bg-card px-2.5 text-xs font-bold"
                      value={row.unit}
                      options={UNIT_OPTIONS}
                      onChange={(v) => updateRow(row.key, { unit: v as UnitType })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </TutorialAnchor>
          <IconAction
            icon={Plus}
            word="Material"
            label="Adaugă material"
            title="Adaugă încă un rând de material"
            onClick={() => setRows((prev) => [...prev, newRow()])}
          />

          <div className="space-y-2">
            <Label>Notă (opțional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: teste glazură nouă"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <IconAction
            icon={X}
            word="Anulează"
            label="Anulează"
            title="Închide fără să înregistrezi nimic"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          />
          <IconAction
            icon={FlaskConical}
            word="Înregistrează"
            tone="primary"
            label="Înregistrează consumul"
            title={
              validRows.length === 0
                ? 'Adaugă cel puțin un material cu cantitate'
                : `Scade din stoc ${validRows.length} ${
                    validRows.length === 1 ? 'material' : 'materiale'
                  }`
            }
            onClick={handleSubmit}
            disabled={saving || validRows.length === 0 || !locationId}
            spinning={saving}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
