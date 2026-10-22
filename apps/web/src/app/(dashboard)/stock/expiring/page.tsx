'use client';

import { useEffect, useState, useCallback } from 'react';
import { stock } from '@/lib/api';
import type { ExpiringItem } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { DataTable, type Column } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock } from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { formatUnitQty, unitQtySortKey } from '@/lib/utils';

export default function ExpiringPage() {
  const [data, setData] = useState<ExpiringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await stock.expiring(days);
      setData(res);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // Design status colors: red < 7 days, orange < 14, yellow < 30.
  const getUrgencyStyle = (daysUntil: number): React.CSSProperties | undefined => {
    if (daysUntil < 7) return { color: 'var(--st-red)' };
    if (daysUntil < 14) return { color: 'var(--st-orange)' };
    if (daysUntil < 30) return { color: 'var(--st-yellow)' };
    return undefined;
  };

  const columns: Column<ExpiringItem>[] = [
    {
      key: 'materialTitle',
      header: 'Denumire',
      sortValue: (item) => item.materialTitle,
      cell: (item) => <span className="font-semibold">{item.materialTitle}</span>,
    },
    {
      key: 'itemType',
      header: 'Tip',
      sortValue: (item) => (item.itemType === 'PRODUS' ? 'Produs' : 'Materie primă'),
      cell: (item) => (
        <StatusBadge
          label={item.itemType === 'PRODUS' ? 'Produs' : 'Materie primă'}
          colorClass={item.itemType === 'PRODUS' ? 'st-purple' : 'st-blue'}
        />
      ),
    },
    {
      key: 'locationName',
      header: 'Locație',
      sortValue: (item) => item.locationName ?? null,
      cell: (item) => item.locationName ?? '—',
    },
    {
      key: 'quantity',
      header: 'Cantitate',
      sortValue: (item) => unitQtySortKey(item.quantity, item.unit),
      cell: (item) => formatUnitQty(item.quantity, item.unit),
    },
    {
      key: 'expiryDate',
      header: 'Data expirare',
      sortValue: (item) => item.expiryDate,
      cell: (item) => format(new Date(item.expiryDate), 'dd MMM yyyy', { locale: ro }),
    },
    {
      key: 'daysUntilExpiry',
      header: 'Zile rămase',
      sortValue: (item) => item.daysUntilExpiry,
      cell: (item) => (
        <span
          className={item.daysUntilExpiry < 14 ? 'font-semibold' : undefined}
          style={getUrgencyStyle(item.daysUntilExpiry)}
        >
          {item.daysUntilExpiry} zile
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3.5">
      <BackLink href="/stock" label="Stoc" />
      <PageHeader
        title="Expirări apropiate"
        description="Materii prime și produse finite care expiră în curând"
      />

      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Zile</Label>
          <Input
            type="number"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 30)}
            className="w-24"
            min={1}
          />
        </div>
      </div>

      {data.length === 0 && !loading ? (
        <EmptyState
          icon={Clock}
          title="Totul în regulă"
          description={`Nimic nu expiră în următoarele ${days} zile.`}
        />
      ) : (
        <DataTable columns={columns} data={data} isLoading={loading} />
      )}
    </div>
  );
}
