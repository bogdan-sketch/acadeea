'use client';

import { useEffect, useState } from 'react';
import { stock } from '@/lib/api';
import type { LowStockItem } from '@/lib/types';
import { formatUnitQty, unitQtySortKey } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { DataTable, type Column } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Package } from 'lucide-react';
import { BackLink } from '@/components/back-link';

export default function LowStockPage() {
  const [data, setData] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    stock
      .lowStock()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const columns: Column<LowStockItem>[] = [
    {
      key: 'title',
      header: 'Material',
      sortValue: (item) => item.title,
      cell: (item) => <span className="font-semibold">{item.title}</span>,
    },
    {
      key: 'currentStock',
      header: 'Stoc curent',
      className: 'text-right',
      sortValue: (item) => unitQtySortKey(item.currentStock, item.unit),
      cell: (item) => (
        <span
          className="font-semibold"
          style={item.currentStock === 0 ? { color: 'var(--st-red)' } : undefined}
        >
          {formatUnitQty(item.currentStock, item.unit)}
        </span>
      ),
    },
    {
      key: 'minimumStock',
      header: 'Minim',
      className: 'text-right',
      sortValue: (item) => unitQtySortKey(item.minimumStock, item.unit),
      cell: (item) => formatUnitQty(item.minimumStock, item.unit),
    },
    {
      key: 'deficit',
      header: 'Deficit',
      className: 'text-right',
      sortValue: (item) => unitQtySortKey(item.minimumStock - item.currentStock, item.unit),
      cell: (item) => {
        const deficit = item.minimumStock - item.currentStock;
        return (
          <span className="font-bold" style={{ color: 'var(--st-red)' }}>
            -{formatUnitQty(deficit, item.unit)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-3.5">
      <BackLink href="/stock" label="Stoc" />
      <PageHeader title="Stoc scăzut" description="Materiale sub nivelul minim de stoc" />

      {data.length === 0 && !loading ? (
        <EmptyState
          icon={Package}
          title="Totul în regulă"
          description="Niciun material sub nivelul minim de stoc."
        />
      ) : (
        <DataTable columns={columns} data={data} isLoading={loading} />
      )}
    </div>
  );
}
