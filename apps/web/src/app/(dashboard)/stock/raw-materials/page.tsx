'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  rawMaterials as api,
  suppliers as suppliersApi,
  locations as locationsApi,
  stockExtra,
} from '@/lib/api';
import type {
  RawMaterial,
  RawMaterialQuery,
  Supplier,
  Location,
  StockImportResult,
} from '@/lib/types';
import { MaterialStatus } from '@horae/shared-types';
import {
  materialStatusLabels,
  materialStatusColors,
  unitTypeLabels,
  storageTypeLabels,
  selectableUnits,
} from '@/lib/constants';
import { BackLink } from '@/components/back-link';
import { FilterChips } from '@/components/filter-chips';
import { DataTable, type Column } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { StockAdjustmentDialog } from '@/components/stock-adjustment-dialog';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { Input } from '@/components/ui/input';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceListField } from '@/components/choice-list';
import { IconAction, PageHead } from '@/app/(dashboard)/stock/_ui/parts';
import { PinnedFilters } from '@/components/pinned-filters';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Search,
  Package,
  Truck,
  ArrowDownUp,
  X,
  FlaskConical,
  FileDown,
  FileUp,
} from 'lucide-react';
import { TestConsumptionDialog } from './test-consumption-dialog';
import { StockImportDialog } from './stock-import-dialog';
import { usePermissions } from '@/contexts/auth-context';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import { BulkSelectBar, BulkSelectToggle } from '@/components/bulk-select-bar';
import type { BulkActionDef } from '@/components/bulk-actions';
import { useDialogUnsavedGuard } from '@/hooks/use-unsaved-changes';
import { toast } from 'sonner';
import { UnitType, StorageType } from '@horae/shared-types';
import { formatUnitQty, unitQtySortKey } from '@/lib/utils';

const EMPTY_FORM = {
  title: '',
  producer: '',
  unit: UnitType.KILOGRAME as string,
  storageType: '' as string,
  supplierId: '' as string,
  locationId: '' as string,
};

const UNIT_OPTIONS = selectableUnits.map((u) => ({
  value: u,
  label: unitTypeLabels[u],
}));
const STORAGE_OPTIONS = (Object.values(StorageType) as StorageType[]).map((s) => ({
  value: s,
  label: storageTypeLabels[s],
}));

export default function RawMaterialsPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const select = useBulkSelect();
  const canDelete = can('delete', 'RawMaterial');
  const canUpdate = can('update', 'RawMaterial');
  const bulkActions: BulkActionDef[] = [
    {
      key: 'category',
      label: 'Categorie',
      param: { kind: 'category', kinds: ['MATERIE_PRIMA'], allowNone: true },
    },
    {
      key: 'status',
      label: 'Status',
      param: {
        kind: 'enum',
        options: [
          { value: 'ACTIVE', label: 'Activ' },
          { value: 'DISCONTINUED', label: 'Întrerupt' },
        ],
      },
    },
    { key: 'supplier', label: 'Furnizor', paramName: 'supplierId', param: { kind: 'supplier' } },
    {
      key: 'minimumStock',
      label: 'Stoc minim',
      param: { kind: 'number', label: 'Stoc minim', min: 0 },
    },
  ];
  const [data, setData] = useState<RawMaterial[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<RawMaterialQuery>({ page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierList, setSupplierList] = useState<Supplier[]>([]);
  const [locationList, setLocationList] = useState<Location[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  // Consum teste (IESIRE_TESTE) — materii prime scoase pentru probe.
  const [testOpen, setTestOpen] = useState(false);
  // Export/Import Excel (doar admin): exportul descarcă tot stocul; importul
  // rulează întâi un dry run și arată diff-ul înainte de aplicare.
  const isAdmin = can('manage', 'all');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    file: File;
    result: StockImportResult;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const closeCreate = useCallback(() => {
    setShowCreate(false);
    setForm(EMPTY_FORM);
  }, []);
  const isDirty = JSON.stringify(form) !== JSON.stringify(EMPTY_FORM);
  const { handleOpenChange, confirmDialog } = useDialogUnsavedGuard({
    isDirty,
    onClose: closeCreate,
  });

  useEffect(() => {
    suppliersApi
      .list()
      .then(setSupplierList)
      .catch(() => {});
    locationsApi
      .list()
      .then(setLocationList)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.list(query);
      setData(res.data);
      setTotal(res.total);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.create({
        title: form.title,
        producer: form.producer || undefined,
        unit: form.unit as UnitType,
        storageType: (form.storageType as StorageType) || undefined,
        supplierId: form.supplierId || undefined,
        locationId: form.locationId || undefined,
      });
      toast.success('Material creat');
      closeCreate();
      load();
    } catch {
      toast.error('Eroare la creare');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await stockExtra.exportExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stoc-${new Date().toISOString().slice(0, 10)}.xlsx`;
      // Anchor must be in the DOM before click (some engines ignore detached
      // anchors), removed after, and the object URL revoked on a later tick so
      // the download has started before it's freed.
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success('Stoc exportat');
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Exportul a eșuat');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      // Dry run: doar calculează diff-ul — nimic nu se modifică încă.
      const result = await stockExtra.importExcel(file, true);
      setImportPreview({ file, result });
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Fișierul nu a putut fi citit');
    } finally {
      setImporting(false);
      // Permite re-selectarea aceluiași fișier după o corecție.
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  // Design (isRawMaterials): Denumire / Categorie / Furnizor / Stoc (right) / Status.
  const columns: Column<RawMaterial>[] = [
    {
      key: 'title',
      header: 'Denumire',
      sortValue: (m) => m.title,
      cell: (m) => <span className="font-semibold">{m.title}</span>,
    },
    {
      key: 'category',
      header: 'Categorie',
      sortValue: (m) => m.category || 'Misc',
      cell: (m) => <span className="text-muted-foreground">{m.category || 'Misc'}</span>,
    },
    {
      key: 'supplier',
      header: 'Furnizor',
      sortValue: (m) => m.supplierName ?? null,
      cell: (m) => <span className="text-muted-foreground">{m.supplierName || '—'}</span>,
    },
    {
      key: 'stock',
      header: 'Stoc',
      className: 'text-right',
      sortValue: (m) => unitQtySortKey(m.stockCount, m.unit),
      cell: (m) => <span className="font-semibold">{formatUnitQty(m.stockCount, m.unit)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (m) => materialStatusLabels[m.status],
      cell: (m) => (
        <StatusBadge
          label={materialStatusLabels[m.status]}
          colorClass={materialStatusColors[m.status]}
        />
      ),
    },
  ];

  const statusChips = [
    ...Object.values(MaterialStatus).map((s) => ({
      value: s as string,
      label: materialStatusLabels[s],
    })),
  ];

  return (
    <div className="space-y-3.5">
      {/* Head is a direct child of the page so it can stick/collapse over the whole list. */}
      {/* Design back link: "‹ Stoc" */}
      <BackLink href="/stock" label="Stoc" />
      <PageHead title="Materii prime" meta={`${total} articole`}>
        {isAdmin && (
          <>
            <TutorialAnchor id="stock.excel.export">
              <span className="inline-flex">
                <IconAction
                  icon={FileDown}
                  word="Export"
                  label="Exportă Excel"
                  title="Descarcă tot stocul ca fișier Excel"
                  spinning={exporting}
                  disabled={exporting}
                  onClick={handleExport}
                />
              </span>
            </TutorialAnchor>
            <TutorialAnchor id="stock.excel.import">
              <span className="inline-flex">
                <IconAction
                  icon={FileUp}
                  word="Import"
                  label="Importă Excel"
                  title="Încarcă un Excel exportat — vezi diferențele înainte de aplicare"
                  spinning={importing}
                  disabled={importing}
                  onClick={() => importInputRef.current?.click()}
                />
              </span>
            </TutorialAnchor>
          </>
        )}
        {can('create', 'StockMovement') && (
          <>
            <TutorialAnchor id="stock.testConsumption.open">
              <span className="inline-flex">
                <IconAction
                  icon={FlaskConical}
                  word="Teste"
                  label="Consum teste"
                  title="Scade din stoc materiile folosite la probe"
                  onClick={() => setTestOpen(true)}
                />
              </span>
            </TutorialAnchor>
            <IconAction
              icon={ArrowDownUp}
              word="Mișcare"
              label="Mișcare stoc"
              title="Intrare sau ajustare pentru un material"
              onClick={() => setAdjustOpen(true)}
            />
            <IconAction
              icon={Truck}
              word="Recepție"
              label="Recepție marfă"
              title="Înregistrează mai multe materii prime dintr-o factură"
              href="/stock/receive"
            />
          </>
        )}
        {can('create', 'RawMaterial') && (
          <TutorialAnchor id="stock.rawMaterial.create.open">
            <span className="inline-flex">
              <IconAction
                icon={Plus}
                word="Material"
                tone="primary"
                label="Material nou"
                title="Adaugă o materie primă nouă"
                onClick={() => setShowCreate(true)}
              />
            </span>
          </TutorialAnchor>
        )}
      </PageHead>

      {isAdmin && (
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => handleImportFile(e.target.files?.[0])}
        />
      )}

      {/* Search scrolls away; the status chips stay pinned. */}
      <div className="flex">
        <div className="relative w-full max-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Caută material..."
            className="pl-9"
            value={query.search || ''}
            onChange={(e) => setQuery({ ...query, search: e.target.value, page: 1 })}
          />
        </div>
      </div>
      <PinnedFilters>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <FilterChips
              options={statusChips}
              value={(query.status as string) ?? null}
              onChange={(v) =>
                setQuery({
                  ...query,
                  status: (v as MaterialStatus | null) ?? undefined,
                  page: 1,
                })
              }
            />
          </div>
          {(canDelete || canUpdate) && <BulkSelectToggle select={select} />}
        </div>
      </PinnedFilters>

      {data.length === 0 && !loading ? (
        query.search || query.status ? (
          <EmptyState
            icon={Search}
            title={query.search ? `Niciun rezultat pentru „${query.search}”` : 'Niciun material'}
            description="Încearcă alt cuvânt sau scoate filtrul de status."
          />
        ) : (
          <EmptyState
            icon={Package}
            title="Niciun material"
            description="Adaugă primul material."
          />
        )
      ) : (
        <DataTable
          columns={columns}
          data={data}
          page={query.page}
          total={total}
          limit={query.limit}
          onPageChange={(p) => setQuery({ ...query, page: p })}
          onRowClick={(m) => router.push(`/stock/raw-materials/${m.id}`)}
          getRowKey={(m) => m.id}
          isLoading={loading}
          selection={select}
        />
      )}

      <BulkSelectBar
        select={select}
        entityLabel="materii prime"
        warning="Se șterg definitiv, împreună cu stocul, mișcările și loturile. Materiile de pe un transfer (aviz emis) nu se pot șterge."
        onPreview={canDelete ? (ids) => api.bulkDeletePreview(ids) : undefined}
        onDelete={canDelete ? (ids) => api.bulkDelete(ids) : undefined}
        actions={canUpdate ? bulkActions : undefined}
        onAction={(ids, key, params) => api.bulkAction(ids, key, params)}
        onDone={load}
      />

      <StockAdjustmentDialog open={adjustOpen} onOpenChange={setAdjustOpen} onSuccess={load} />

      <TestConsumptionDialog open={testOpen} onOpenChange={setTestOpen} onSuccess={load} />

      {importPreview && (
        <StockImportDialog
          file={importPreview.file}
          result={importPreview.result}
          onClose={() => setImportPreview(null)}
          onApplied={load}
        />
      )}

      <Dialog open={showCreate} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Material nou</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rm-title">Denumire *</Label>
              <Input
                id="rm-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-producer">Producător</Label>
              <Input
                id="rm-producer"
                value={form.producer}
                onChange={(e) => setForm({ ...form, producer: e.target.value })}
              />
            </div>
            {supplierList.length > 0 && (
              <div className="space-y-2">
                <Label>Furnizor</Label>
                <ChoiceListField
                  title="Alege furnizorul"
                  placeholder="Alege furnizorul"
                  searchPlaceholder="Caută furnizor…"
                  emptyText="Niciun furnizor găsit."
                  value={form.supplierId}
                  options={[
                    { value: '', label: 'Fără furnizor' },
                    ...supplierList.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                  onChange={(v) => setForm({ ...form, supplierId: v })}
                />
              </div>
            )}
            {locationList.length > 0 && (
              <div className="space-y-2">
                <Label>Locație</Label>
                <ChoiceChips
                  label="Locație"
                  allowClear
                  value={form.locationId}
                  onChange={(v) => setForm({ ...form, locationId: v ?? '' })}
                  options={locationList.map((l) => ({ value: l.id, label: l.name }))}
                />
              </div>
            )}
            <TutorialAnchor id="stock.rawMaterial.create.unit">
              <div className="space-y-2">
                <Label>Unitate</Label>
                <ChoiceChips
                  label="Unitate"
                  value={form.unit}
                  onChange={(v) => v && setForm({ ...form, unit: v })}
                  options={UNIT_OPTIONS}
                />
              </div>
            </TutorialAnchor>
            <div className="space-y-2">
              <Label>Depozitare</Label>
              <ChoiceChips
                label="Depozitare"
                allowClear
                value={form.storageType}
                onChange={(v) => setForm({ ...form, storageType: v ?? '' })}
                options={STORAGE_OPTIONS}
              />
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
              icon={Plus}
              word="Creează"
              tone="primary"
              label="Creează materialul"
              title={form.title ? 'Salvează materia primă nouă' : 'Dă-i o denumire materialului'}
              onClick={handleCreate}
              disabled={saving || !form.title}
              spinning={saving}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
