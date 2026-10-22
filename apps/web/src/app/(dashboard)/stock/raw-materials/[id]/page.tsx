'use client';

import { chartTooltipProps } from '@/components/chart-tooltip';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  rawMaterials as rawApi,
  stock as stockApi,
  suppliers as suppliersApi,
  locations as locationsApi,
} from '@/lib/api';
import type {
  RawMaterial,
  RawMaterialPriceHistory,
  RawMaterialDeleteInfo,
  StockItemAvailability,
  StockLot,
} from '@/lib/types';
import { StockAdjustmentDialog } from '@/components/stock-adjustment-dialog';
import { UnitType, StorageType } from '@horae/shared-types';
import {
  materialStatusLabels,
  materialStatusColors,
  priceUnitLabel,
  unitTypeLabels,
  storageTypeLabels,
  unitChoices,
} from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/status-badge';
import { BackLink } from '@/components/back-link';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceListField } from '@/components/choice-list';
import { IconAction } from '@/app/(dashboard)/stock/_ui/parts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  ArrowLeftRight,
  Loader2,
  Pencil,
  SlidersHorizontal,
  Trash2,
  PackagePlus,
  Check,
  Save,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/contexts/auth-context';
import { useDialogUnsavedGuard } from '@/hooks/use-unsaved-changes';
import { useVatSettings, vatBasisLabel } from '@/hooks/use-vat';
import { NutritionEditorCard, useNutritionEnabled } from '@/components/nutrition';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { convertMetric, formatUnitQty, splitUnitQty, formatMoney } from '@/lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

// The material's stored unit stays offered even when it is legacy (cană, oz).
const unitOptions = (stored: UnitType) =>
  unitChoices(stored).map((u) => ({
    value: u,
    label: unitTypeLabels[u],
  }));
const STORAGE_OPTIONS = (Object.values(StorageType) as StorageType[]).map((s) => ({
  value: s,
  label: storageTypeLabels[s],
}));

export default function RawMaterialDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [material, setMaterial] = useState<RawMaterial | null>(null);
  const { can } = usePermissions();
  const vat = useVatSettings();
  const nutritionEnabled = useNutritionEnabled();
  const [priceHistory, setPriceHistory] = useState<RawMaterialPriceHistory[]>([]);
  const [lots, setLots] = useState<StockLot[]>([]);
  const [supplierList, setSupplierList] = useState<{ id: string; name: string }[]>([]);
  const [locationList, setLocationList] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [availability, setAvailability] = useState<StockItemAvailability | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);

  // Permanent-delete flow: click "Șterge" fetches delete-info, then either shows a
  // blocking warning (stock ≠ 0) or a confirmation dialog (stock = 0).
  const [deleteInfo, setDeleteInfo] = useState<RawMaterialDeleteInfo | null>(null);
  const [deleteInfoLoading, setDeleteInfoLoading] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const openDeleteFlow = async () => {
    setDeleteInfoLoading(true);
    try {
      const info = await rawApi.deleteInfo(id);
      setDeleteInfo(info);
      if (info.canDelete) {
        setConfirmOpen(true);
      } else {
        setWarnOpen(true);
      }
    } catch (err: unknown) {
      toast.error(
        (err as { message?: string }).message || 'Nu s-au putut încărca detaliile de ștergere',
      );
    } finally {
      setDeleteInfoLoading(false);
    }
  };

  const handleHardDelete = async () => {
    setDeleting(true);
    try {
      await rawApi.hardDelete(id);
      toast.success('Materie primă ștearsă definitiv');
      setConfirmOpen(false);
      router.push('/stock/raw-materials');
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Eroare la ștergere');
    } finally {
      setDeleting(false);
    }
  };

  const setSupplier = async (supplierId: string | null) => {
    try {
      // null unlinks the supplier on the backend.
      const updated = await rawApi.update(id, {
        supplierId,
      } as unknown as Parameters<typeof rawApi.update>[1]);
      setMaterial(updated);
    } catch {
      //
    }
  };

  const assignLocation = async (locationId: string) => {
    try {
      const updated = await rawApi.update(id, {
        locationId,
      } as unknown as Parameters<typeof rawApi.update>[1]);
      setMaterial(updated);
    } catch {
      //
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mat, hist, intake, avail] = await Promise.all([
        rawApi.get(id),
        rawApi.priceHistory(id).catch(() => []),
        stockApi.lots({ rawMaterialId: id }).catch(() => []),
        stockApi.itemAvailability({ rawMaterialId: id }).catch(() => null),
      ]);
      setMaterial(mat);
      setPriceHistory(hist);
      setLots(intake);
      setAvailability(avail);
      suppliersApi
        .list()
        .then((s) => setSupplierList(s.map((x) => ({ id: x.id, name: x.name }))))
        .catch(() => {});
      locationsApi
        .list()
        .then((l) => setLocationList(l.map((x) => ({ id: x.id, name: x.name }))))
        .catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Chart wants oldest-first; the API returns newest-first.
  const chartData = [...priceHistory].reverse().map((h) => ({
    date: format(new Date(h.createdAt), 'dd MMM', { locale: ro }),
    price: h.newPrice,
  }));

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!material) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Înapoi
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Materia primă nu a fost găsită.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Design headline: back link, serif title-row + status/category capsules, gray meta line */}
      <div>
        <BackLink label="Stoc" />
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-serif text-[26px] font-bold leading-[1.15] tracking-[-0.3px]">
            {material.title}
          </h1>
          <StatusBadge
            label={materialStatusLabels[material.status]}
            colorClass={materialStatusColors[material.status]}
          />
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {material.category || 'Misc'}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {[
            material.supplierName || material.producer,
            `prag minim ${formatUnitQty(material.minimumStock ?? 0, material.unit)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {can('create', 'StockMovement') && (
          <IconAction
            icon={PackagePlus}
            word="Recepție"
            tone="primary"
            label="Recepție marfă"
            title="Înregistrează o intrare pentru acest material"
            href={`/stock/receive?rawMaterialId=${id}`}
          />
        )}
        {can('create', 'Transfer') && (
          <IconAction
            icon={ArrowLeftRight}
            word="Transfer"
            label="Transfer"
            title="Mută o cantitate în altă locație"
            onClick={() => {
              const withStock = (availability?.locations ?? []).filter((l) => l.quantity > 0);
              router.push(
                withStock.length === 1
                  ? `/stock/transfers/new?rawMaterialId=${id}&fromLocationId=${withStock[0].locationId}`
                  : `/stock/transfers/new?rawMaterialId=${id}`,
              );
            }}
          />
        )}
        {can('create', 'StockMovement') && (
          <IconAction
            icon={SlidersHorizontal}
            word="Ajustare"
            label="Ajustare stoc"
            title="Corectează stocul la valoarea reală"
            onClick={() => setAdjustOpen(true)}
          />
        )}
        {can('update', 'RawMaterial') && (
          <IconAction
            icon={Pencil}
            word="Editează"
            label="Editează"
            title="Denumire, producător, unitate, depozitare, stoc minim"
            onClick={() => setEditOpen(true)}
          />
        )}
        {can('delete', 'RawMaterial') && (
          <IconAction
            icon={Trash2}
            word="Șterge"
            label="Șterge"
            title="Șterge definitiv materia primă (doar cu stoc 0)"
            spinning={deleteInfoLoading}
            disabled={deleteInfoLoading}
            onClick={openDeleteFlow}
          />
        )}
      </div>

      <EditRawMaterialDialog
        material={material}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={load}
      />

      <StockAdjustmentDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        defaultMode="AJUSTARE"
        presetItem={{
          kind: 'raw',
          id: material.id,
          title: material.title,
          unit: material.unit,
          stockCount: material.stockCount,
        }}
        onSuccess={load}
      />

      {/* Blocking warning — hard delete is impossible while stock ≠ 0 or a transfer is in flight. */}
      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nu poate fi ștearsă</DialogTitle>
            <DialogDescription>
              {(deleteInfo?.currentStock ?? material.stockCount) === 0 &&
              (deleteInfo?.activeTransfers ?? 0) > 0 ? (
                <>
                  Materia primă «{material.title}» apare pe un transfer în curs (în așteptare sau în
                  tranzit). Finalizează sau anulează transferul, apoi încearcă din nou.
                </>
              ) : (
                <>
                  Materia primă «{material.title}» are încă{' '}
                  <span className="font-medium text-foreground">
                    {formatUnitQty(deleteInfo?.currentStock ?? material.stockCount, material.unit)}
                  </span>{' '}
                  în stoc. Ștergerea definitivă este posibilă doar când stocul este 0. Descarcă sau
                  consumă întreg stocul, apoi încearcă din nou.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <IconAction
              icon={Check}
              word="Am înțeles"
              tone="primary"
              label="Am înțeles"
              onClick={() => setWarnOpen(false)}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation — stock is 0, deletion is permitted (and irreversible). */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ștergi definitiv «{material.title}»?</DialogTitle>
            <DialogDescription>Această acțiune este ireversibilă.</DialogDescription>
          </DialogHeader>
          {deleteInfo?.everUsed && (
            <p className="text-xs text-muted-foreground">
              Atenție: această materie primă a fost folosită în rețete sau producție — ștergerea
              elimină definitiv și istoricul de mișcări, loturile și trasabilitatea asociate.
            </p>
          )}
          <DialogFooter>
            <IconAction
              icon={X}
              word="Anulează"
              label="Anulează"
              title="Păstrează materia primă"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            />
            <IconAction
              icon={Trash2}
              word="Șterge"
              tone="primary"
              label="Șterge definitiv"
              title="Ireversibil — dispare și istoricul ei"
              onClick={handleHardDelete}
              disabled={deleting}
              spinning={deleting}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prominent current-stock block — pulled up right under the quick actions
          so the number the user cares about is the first thing on the page.
          Stoc minim stays in the Informații card below (it's a config value). */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-x-10 gap-y-3 py-5">
          <MiniStat
            label="În stoc"
            value={splitUnitQty(material.stockCount, material.unit)[0]}
            unit={splitUnitQty(material.stockCount, material.unit)[1]}
          />
          {material.reservedCount > 0 && (
            <>
              <MiniStat
                label="Disponibil"
                value={splitUnitQty(material.stockCount - material.reservedCount, material.unit)[0]}
                unit={splitUnitQty(material.stockCount - material.reservedCount, material.unit)[1]}
              />
              <MiniStat
                label="Rezervat"
                value={splitUnitQty(material.reservedCount, material.unit)[0]}
                unit={splitUnitQty(material.reservedCount, material.unit)[1]}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Design (isStockDetail): two columns — stoc per locație + istoric preț left,
          istoric intrări (loturi) right; the app's Informații card joins the left stack. */}
      <div className="grid items-start gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          {availability && availability.locations.some((l) => l.quantity !== 0) && (
            <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
              <div className="px-6 pb-4 pt-5 text-[15px] font-bold">Stoc per locație</div>
              {availability.locations
                .filter((loc) => loc.quantity !== 0)
                .map((loc) => (
                  <div
                    key={loc.locationId}
                    className="flex items-center justify-between border-t border-border px-6 py-[11px] text-[13.5px]"
                  >
                    <span>{loc.locationName}</span>
                    <span className="font-bold">
                      {formatUnitQty(loc.quantity, material.unit)}
                      {loc.reservedCount > 0 && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          rezervat {formatUnitQty(loc.reservedCount, material.unit)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
            </div>
          )}

          <div className="rounded-[var(--radius)] border border-border bg-card px-6 py-5 shadow-(--shadow-card-sm)">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[15px] font-bold">Istoric preț</span>
              {material.purchasePrice != null && (
                <span className="text-[13.5px] font-bold text-primary">
                  {formatMoney(material.purchasePrice, priceUnitLabel(material.unit))}
                </span>
              )}
            </div>
            {chartData.length >= 2 ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit=" RON" width={64} />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(v) => [formatMoney(Number(v)), 'Preț']}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nu există suficiente schimbări de preț pentru un grafic.
              </p>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Informații</CardTitle>
            </CardHeader>
            {/* krow rows: 13.5px, muted key / value, hairline dividers */}
            <CardContent className="divide-y divide-border px-0 pt-1 text-[13.5px]">
              <Row
                label="Stoc minim"
                value={formatUnitQty(material.minimumStock ?? 0, material.unit)}
              />
              <Row label="Pierderi estimate" value={`${material.estimatedLossPercent ?? 0}%`} />
              <div className="flex items-center justify-between gap-4 px-6 py-[7px]">
                <span className="text-muted-foreground">Furnizor</span>
                <ChoiceListField
                  title="Alege furnizorul"
                  placeholder="Fără furnizor"
                  searchPlaceholder="Caută furnizor…"
                  emptyText="Niciun furnizor găsit."
                  className="w-56"
                  value={material.supplierId || ''}
                  options={[
                    { value: '', label: 'Fără furnizor' },
                    ...supplierList.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                  onChange={(v) => setSupplier(v || null)}
                />
              </div>
              {locationList.length > 0 && (
                <div className="flex items-center justify-between gap-4 px-6 py-[7px]">
                  <span className="text-muted-foreground">Asignează la locație</span>
                  <ChoiceListField
                    title="Alege locația"
                    placeholder="Alege locație"
                    searchPlaceholder="Caută locație…"
                    emptyText="Nicio locație găsită."
                    className="w-56"
                    value=""
                    options={locationList.map((l) => ({ value: l.id, label: l.name }))}
                    onChange={(v) => assignLocation(v)}
                  />
                </div>
              )}
              {material.lotNumber && <Row label="Nr. lot" value={material.lotNumber} />}
              {material.expiryDate && (
                <Row
                  label="Expiră"
                  value={format(new Date(material.expiryDate), 'dd MMM yyyy', { locale: ro })}
                />
              )}
              {material.purchasePrice != null && (
                <Row
                  label={`Preț achiziție (${vatBasisLabel(vat.vatPayer)})`}
                  value={formatMoney(material.purchasePrice, priceUnitLabel(material.unit))}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: design "Istoric intrări (loturi)" list */}
        <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
          <div className="px-6 pb-4 pt-5 text-[15px] font-bold">
            Istoric intrări ({lots.length})
          </div>
          {lots.length === 0 ? (
            <p className="border-t border-border px-6 py-6 text-center text-sm text-muted-foreground">
              Nicio intrare înregistrată.
            </p>
          ) : (
            lots.map((lot) => {
              const info = [
                lot.supplierInvoice,
                lot.supplier,
                lot.purchasePrice != null
                  ? formatMoney(
                      lot.purchasePrice,
                      priceUnitLabel((lot.unit as UnitType) ?? material.unit),
                    )
                  : null,
                lot.expiryDate
                  ? `exp. ${format(new Date(lot.expiryDate), 'dd MMM yyyy', { locale: ro })}`
                  : null,
                lot.remainingQuantity != null && lot.remainingQuantity < lot.quantity
                  ? `rămas ${formatUnitQty(lot.remainingQuantity, lot.unit || material.unit)}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div
                  key={lot.id}
                  className="flex items-start justify-between gap-3 border-t border-border px-6 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                      <span>
                        {lot.lotNumber ? `Lot ${lot.lotNumber} · ` : ''}
                        {formatUnitQty(lot.quantity, lot.unit || material.unit)}
                      </span>
                      {lot.onHold && (
                        <span className="st-yellow rounded-full px-2 py-0.5 text-[10px] font-semibold">
                          Păstrat (sărit la FIFO)
                        </span>
                      )}
                    </div>
                    {info && <div className="text-[11.5px] text-muted-foreground">{info}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(lot.receivedAt), 'dd MMM yyyy', { locale: ro })}
                    </span>
                    {can('update', 'RawMaterial') && (lot.remainingQuantity ?? 0) > 0 && (
                      <button
                        type="button"
                        className="text-[11.5px] font-semibold text-primary transition-opacity hover:opacity-80"
                        onClick={async () => {
                          try {
                            const updated = await stockApi.setLotHold(lot.id, !lot.onHold);
                            setLots((prev) => prev.map((l) => (l.id === lot.id ? updated : l)));
                            toast.success(
                              updated.onHold
                                ? 'Lot păstrat — producția va folosi celelalte loturi'
                                : 'Lot deblocat pentru consum FIFO',
                            );
                          } catch {
                            toast.error('Eroare la salvare');
                          }
                        }}
                      >
                        {lot.onHold ? 'Deblochează' : 'Păstrează lotul'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {nutritionEnabled && material && (
        <NutritionEditorCard
          rawMaterialId={material.id}
          initial={material.nutrition}
          initialAllergens={material.allergens}
          canEdit={can('update', 'RawMaterial')}
        />
      )}
    </div>
  );
}

// krow (design): muted key left / value right, hairline dividers via the parent.
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

// Mini-stat (design): 12.5px muted label + 26px/700 value with small unit.
function MiniStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <p className="text-[12.5px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-[26px] font-bold leading-none tracking-[-.4px] tabular-nums">
        {value} <span className="text-[15px] font-semibold text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}

// Edit raw-material details (parity with iOS EditRawMaterialFormView): name,
// producer, unit, storage type, minimum stock, estimated loss %.
function EditRawMaterialDialog({
  material,
  open,
  onOpenChange,
  onSaved,
}: {
  material: RawMaterial;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(material.title);
  const [producer, setProducer] = useState(material.producer ?? '');
  const [unit, setUnit] = useState<UnitType>(material.unit);
  const [storageType, setStorageType] = useState<StorageType>(
    material.storageType ?? StorageType.WARM,
  );
  const [minimumStock, setMinimumStock] = useState(String(material.minimumStock ?? 0));
  const [estimatedLossPercent, setEstimatedLossPercent] = useState(
    String(material.estimatedLossPercent ?? 0),
  );
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState('');

  // Reset the form to the material's current values every time it opens.
  useEffect(() => {
    if (open) {
      const values = {
        title: material.title,
        producer: material.producer ?? '',
        unit: material.unit,
        storageType: material.storageType ?? StorageType.WARM,
        minimumStock: String(material.minimumStock ?? 0),
        estimatedLossPercent: String(material.estimatedLossPercent ?? 0),
      };
      setTitle(values.title);
      setProducer(values.producer);
      setUnit(values.unit);
      setStorageType(values.storageType);
      setMinimumStock(values.minimumStock);
      setEstimatedLossPercent(values.estimatedLossPercent);
      setBaseline(JSON.stringify(values));
    }
  }, [open, material]);

  const isDirty =
    JSON.stringify({ title, producer, unit, storageType, minimumStock, estimatedLossPercent }) !==
    baseline;
  const onClose = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { handleOpenChange, confirmDialog } = useDialogUnsavedGuard({ isDirty, onClose });

  const handleSave = async () => {
    if (!title.trim()) return;
    if (Number(minimumStock) < 0) {
      toast.error('Stocul minim nu poate fi negativ');
      return;
    }
    const loss = Number(estimatedLossPercent);
    if (loss < 0 || loss > 100) {
      toast.error('Pierderea estimată trebuie să fie între 0 și 100%');
      return;
    }
    setSaving(true);
    try {
      await rawApi.update(material.id, {
        title: title.trim(),
        producer: producer.trim() || undefined,
        unit,
        storageType,
        minimumStock: Number(minimumStock) || 0,
        estimatedLossPercent: Number(estimatedLossPercent) || 0,
      });
      toast.success('Materie primă actualizată');
      onClose();
      await onSaved();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editează materia primă</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rm-edit-title">Denumire</Label>
              <Input
                id="rm-edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ex: Făină albă 000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-edit-producer">Producător / distribuitor</Label>
              <Input
                id="rm-edit-producer"
                value={producer}
                onChange={(e) => setProducer(e.target.value)}
                placeholder="ex: Boromir"
              />
            </div>
            <div className="space-y-2">
              <Label>Unitate</Label>
              <ChoiceChips
                label="Unitate"
                value={unit}
                onChange={(v) => v && setUnit(v)}
                options={unitOptions(material.unit)}
              />
              {unit !== material.unit && Number(material.stockCount) !== 0 && (
                <p className="text-xs text-muted-foreground">
                  {convertMetric(Number(material.stockCount), material.unit, unit) !== null ? (
                    <>
                      Stocul, loturile și jurnalul se convertesc:{' '}
                      <span className="font-semibold text-foreground">
                        {formatUnitQty(Number(material.stockCount), material.unit)} ={' '}
                        {formatUnitQty(
                          convertMetric(Number(material.stockCount), material.unit, unit) ?? 0,
                          unit,
                        )}
                      </span>
                    </>
                  ) : (
                    'Nu există o conversie exactă între aceste unități — schimbarea e posibilă doar cu stocul la 0.'
                  )}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tip depozitare</Label>
              <ChoiceChips
                label="Tip depozitare"
                value={storageType}
                onChange={(v) => v && setStorageType(v)}
                options={STORAGE_OPTIONS}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rm-edit-min">Stoc minim</Label>
                <Input
                  id="rm-edit-min"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  aria-invalid={Number(minimumStock) < 0 ? true : undefined}
                  value={minimumStock}
                  onChange={(e) => setMinimumStock(e.target.value)}
                  placeholder="ex: 5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rm-edit-loss">Pierdere estimată (%)</Label>
                <Input
                  id="rm-edit-loss"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="100"
                  value={estimatedLossPercent}
                  onChange={(e) => setEstimatedLossPercent(e.target.value)}
                  placeholder="ex: 5"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <IconAction
              icon={X}
              word="Anulează"
              label="Anulează"
              title="Închide fără să salvezi"
              onClick={() => handleOpenChange(false)}
            />
            <IconAction
              icon={Save}
              word="Salvează"
              tone="primary"
              label="Salvează"
              title={
                !title.trim()
                  ? 'Dă-i o denumire materialului'
                  : Number(minimumStock) < 0
                    ? 'Stocul minim nu poate fi negativ'
                    : 'Salvează modificările'
              }
              onClick={handleSave}
              disabled={!title.trim() || Number(minimumStock) < 0 || saving}
              spinning={saving}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
