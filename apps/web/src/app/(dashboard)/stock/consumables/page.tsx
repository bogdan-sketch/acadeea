'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { consumables as api } from '@/lib/api';
import type { Consumable, PaginationQuery } from '@/lib/types';
import { materialStatusLabels, materialStatusColors, unitTypeLabels } from '@/lib/constants';
import { DataTable, type Column } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { IconAction, PageHead } from '@/app/(dashboard)/stock/_ui/parts';
import { Plus, Search, Droplets, X } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { usePermissions } from '@/contexts/auth-context';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import { BulkSelectBar, BulkSelectToggle } from '@/components/bulk-select-bar';
import type { BulkActionDef } from '@/components/bulk-actions';
import { useDialogUnsavedGuard } from '@/hooks/use-unsaved-changes';
import { toast } from 'sonner';
import { UnitType } from '@horae/shared-types';
import { formatUnitQty, unitQtySortKey } from '@/lib/utils';

const EMPTY_FORM = { title: '' };

// Consumables are counted in pieces — the API has no unit field for them.
const UNIT = UnitType.BUCATI;

export default function ConsumablesPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const select = useBulkSelect();
  const canDelete = can('delete', 'Consumable');
  const canUpdate = can('update', 'Consumable');
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
    {
      key: 'minimumStock',
      label: 'Stoc minim',
      param: { kind: 'number', label: 'Stoc minim', min: 0 },
    },
  ];
  const [data, setData] = useState<Consumable[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<PaginationQuery>({ page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const closeCreate = useCallback(() => {
    setShowCreate(false);
    setForm(EMPTY_FORM);
  }, []);
  const isDirty = JSON.stringify(form) !== JSON.stringify(EMPTY_FORM);
  const { handleOpenChange, confirmDialog } = useDialogUnsavedGuard({
    isDirty,
    onClose: closeCreate,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.list(query);
      setData(res.data);
      setTotal(res.total);
    } catch {
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
      await api.create({ title: form.title.trim() });
      toast.success('Consumabil creat');
      closeCreate();
      load();
    } catch (err: unknown) {
      toast.error('Eroare la crearea consumabilului', {
        description: (err as { message?: string }).message,
      });
    } finally {
      setSaving(false);
    }
  };

  // Same table language as the raw-materials design screen.
  const columns: Column<Consumable>[] = [
    {
      key: 'title',
      header: 'Denumire',
      sortValue: (c) => c.title,
      cell: (c) => <span className="font-semibold">{c.title}</span>,
    },
    {
      key: 'category',
      header: 'Categorie',
      sortValue: (c) => c.category || 'Misc',
      cell: (c) => <span className="text-muted-foreground">{c.category || 'Misc'}</span>,
    },
    {
      key: 'stock',
      header: 'Stoc',
      className: 'text-right',
      sortValue: (c) => unitQtySortKey(c.stockCount, c.unit ?? UNIT),
      cell: (c) => (
        <span className="font-semibold">{formatUnitQty(c.stockCount, c.unit ?? UNIT)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (c) => materialStatusLabels[c.status],
      cell: (c) => (
        <StatusBadge
          label={materialStatusLabels[c.status]}
          colorClass={materialStatusColors[c.status]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-3.5">
      <BackLink href="/stock" label="Stoc" />
      <PageHead title="Consumabile" meta={`${total} articole`}>
        {can('create', 'Consumable') && (
          <IconAction
            icon={Plus}
            word="Consumabil"
            tone="primary"
            label="Consumabil nou"
            title="Adaugă un consumabil (ambalaje, cutii, etichete…)"
            onClick={() => setShowCreate(true)}
          />
        )}
      </PageHead>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full max-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Caută..."
            className="pl-9"
            value={query.search || ''}
            onChange={(e) => setQuery({ ...query, search: e.target.value, page: 1 })}
          />
        </div>
        {(canDelete || canUpdate) && <BulkSelectToggle select={select} />}
      </div>
      {data.length === 0 && !loading ? (
        <EmptyState icon={Droplets} title="Niciun consumabil" />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          page={query.page}
          total={total}
          limit={query.limit}
          onPageChange={(p) => setQuery({ ...query, page: p })}
          onRowClick={(c) => router.push(`/stock/consumables/${c.id}`)}
          getRowKey={(c) => c.id}
          isLoading={loading}
          selection={select}
        />
      )}
      <BulkSelectBar
        select={select}
        entityLabel="consumabile"
        warning="Se șterg definitiv, împreună cu stocul, mișcările și loturile."
        onPreview={canDelete ? (ids) => api.bulkDeletePreview(ids) : undefined}
        onDelete={canDelete ? (ids) => api.bulkDelete(ids) : undefined}
        actions={canUpdate ? bulkActions : undefined}
        onAction={(ids, key, params) => api.bulkAction(ids, key, params)}
        onDone={load}
      />
      <Dialog open={showCreate} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consumabil nou</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="consumable-title">Denumire *</Label>
              <Input
                id="consumable-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Consumabilele se numără în {unitTypeLabels[UNIT]} (bucăți).
            </p>
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
              label="Creează consumabilul"
              title={
                form.title.trim() ? 'Salvează consumabilul nou' : 'Dă-i o denumire consumabilului'
              }
              onClick={handleCreate}
              disabled={saving || !form.title.trim()}
              spinning={saving}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
