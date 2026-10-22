'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { transfers as api } from '@/lib/api';
import type { Transfer, TransferQuery } from '@/lib/types';
import { TransferStatus } from '@/lib/types';
import { transferStatusLabels, transferStatusColors } from '@/lib/constants';
import { BackLink } from '@/components/back-link';
import { DataTable, type Column } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { FilterChips } from '@/components/filter-chips';
import { Plus, ArrowLeftRight, ArrowRight, Check, X } from 'lucide-react';
import { IconAction, PageHead } from '../_ui/parts';
import { PinnedFilters } from '@/components/pinned-filters';
import { usePermissions } from '@/contexts/auth-context';
import { useBulkSelect } from '@/hooks/use-bulk-select';
import { BulkSelectBar, BulkSelectToggle } from '@/components/bulk-select-bar';
import type { BulkActionDef } from '@/components/bulk-actions';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { toast } from 'sonner';

export default function TransfersPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const select = useBulkSelect();
  const canDelete = can('delete', 'Transfer');
  const canUpdate = can('update', 'Transfer');
  const bulkActions: BulkActionDef[] = [
    {
      key: 'status',
      label: 'Status',
      param: {
        kind: 'enum',
        options: [
          { value: TransferStatus.IN_TRANZIT, label: 'În tranzit' },
          { value: TransferStatus.FINALIZAT, label: 'Finalizează' },
          { value: TransferStatus.ANULAT, label: 'Anulează' },
        ],
      },
    },
  ];
  const [data, setData] = useState<Transfer[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<TransferQuery>({ page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);

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

  // Design (isTransfers): Transfer(#) | Ruta | Articole | Cerut de | Status.
  // There is no serial field on Transfer — the short id (same base as the printed
  // foaie's TR- number) stands in for the design's "#TF-088".
  const columns: Column<Transfer>[] = [
    {
      key: 'code',
      header: 'Transfer',
      className: 'w-[110px]',
      cell: (t) => <span className="font-semibold">#{t.id.slice(0, 8)}</span>,
    },
    {
      key: 'route',
      header: 'Rută',
      sortValue: (t) => `${t.fromLocationName} → ${t.toLocationName}`,
      cell: (t) => (
        <span className="inline-flex items-center gap-1.5">
          {t.fromLocationName}
          <ArrowRight className="h-[13px] w-[13px] shrink-0 text-muted-foreground" />
          {t.toLocationName}
          {t.adhocDestination && (
            <Badge variant="secondary" className="rounded-full text-[11px]">
              Eveniment
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Articole',
      sortValue: (t) => t.items?.length || 0,
      cell: (t) => <span className="text-muted-foreground">{t.items?.length || 0} articole</span>,
    },
    {
      key: 'requestedBy',
      header: 'Cerut de',
      sortValue: (t) => t.createdAt,
      cell: (t) => (
        <span className="text-muted-foreground">
          {t.createdByName || '—'} · {format(new Date(t.createdAt), 'd MMM', { locale: ro })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-[130px]',
      sortValue: (t) => transferStatusLabels[t.status],
      cell: (t) => (
        <StatusBadge
          label={transferStatusLabels[t.status]}
          colorClass={transferStatusColors[t.status]}
        />
      ),
    },
    ...(can('manage', 'Transfer')
      ? [
          {
            key: 'actions' as const,
            header: 'Acțiuni',
            cell: (t: Transfer) =>
              t.status === TransferStatus.IN_ASTEPTARE ? (
                <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <span className="[&_button]:text-[var(--st-green)]">
                    <IconAction
                      row
                      icon={Check}
                      label="Aprobă transferul"
                      title="Aprobă transferul — pleacă spre destinație"
                      onClick={async () => {
                        try {
                          await api.approve(t.id);
                          toast.success('Transfer aprobat');
                          load();
                        } catch (e) {
                          toast.error('Nu s-a putut aproba transferul', {
                            description: e instanceof Error ? e.message : undefined,
                          });
                        }
                      }}
                    />
                  </span>
                  <span className="[&_button]:text-[var(--st-red)]">
                    <IconAction
                      row
                      icon={X}
                      label="Respinge transferul"
                      title="Respinge transferul — stocul rămâne la sursă"
                      onClick={async () => {
                        try {
                          await api.reject(t.id);
                          toast.success('Transfer respins');
                          load();
                        } catch (e) {
                          toast.error('Nu s-a putut respinge transferul', {
                            description: e instanceof Error ? e.message : undefined,
                          });
                        }
                      }}
                    />
                  </span>
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/stock" label="Stoc" />
      <PageHead title="Transferuri" meta={`Între locații · ${total} în total`}>
        {can('create', 'Transfer') && (
          <IconAction
            icon={Plus}
            tone="primary"
            word="Nou"
            href="/stock/transfers/new"
            label="Transfer nou"
            title="Mută stoc între locații sau spre un eveniment"
          />
        )}
      </PageHead>
      {/* Status pills — fără „Toate”: click filtrează, click pe cel activ scoate filtrul. */}
      <PinnedFilters>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <FilterChips<TransferStatus>
              options={Object.values(TransferStatus).map((s) => ({
                value: s,
                label: transferStatusLabels[s],
              }))}
              value={query.status ?? null}
              onChange={(v) => setQuery({ ...query, status: v ?? undefined, page: 1 })}
            />
          </div>
          {(canDelete || canUpdate) && <BulkSelectToggle select={select} />}
        </div>
      </PinnedFilters>
      {data.length === 0 && !loading ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Niciun transfer"
          description={
            query.status
              ? 'Niciun transfer cu starea aleasă.'
              : 'Mută stoc între locații cu primul transfer.'
          }
          actionLabel={can('create', 'Transfer') && !query.status ? 'Transfer nou' : undefined}
          actionHref={
            can('create', 'Transfer') && !query.status ? '/stock/transfers/new' : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          page={query.page}
          total={total}
          limit={query.limit}
          onPageChange={(p) => setQuery({ ...query, page: p })}
          onRowClick={(t) => router.push(`/stock/transfers/${t.id}`)}
          getRowKey={(t) => t.id}
          isLoading={loading}
          selection={select}
        />
      )}

      <BulkSelectBar
        select={select}
        entityLabel="transferuri"
        warning="Transferurile active returnează stocul la sursă."
        onPreview={canDelete ? (ids) => api.bulkDeletePreview(ids) : undefined}
        onDelete={canDelete ? (ids) => api.bulkDelete(ids) : undefined}
        actions={canUpdate ? bulkActions : undefined}
        onAction={(ids, key, params) => api.bulkAction(ids, key, params)}
        onDone={load}
      />
    </div>
  );
}
