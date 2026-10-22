'use client';

import { chartTooltipProps } from '@/components/chart-tooltip';

import { useEffect, useState, useCallback } from 'react';
import { analytics } from '@/lib/api';
import type { OrderAnalytics } from '@/lib/types';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format, subDays } from 'date-fns';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { formatPercent } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  NOUA: '#3b82f6',
  IN_PREGATIRE: '#f97316',
  PREGATITA: '#a855f7',
  IN_TRANZIT: '#6366f1',
  LIVRATA: '#22c55e',
  ANULATA: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  NOUA: 'Nouă',
  IN_PREGATIRE: 'În pregătire',
  PREGATITA: 'Pregătită',
  IN_TRANZIT: 'În tranzit',
  LIVRATA: 'Livrată',
  ANULATA: 'Anulată',
};

export default function OrderStatsPage() {
  const router = useRouter();
  const [from, setFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [data, setData] = useState<OrderAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await analytics.orders(from, to);
      setData(res);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const pieData = data
    ? Object.entries(data.ordersByStatus).map(([key, value]) => ({
        name: STATUS_LABELS[key] || key,
        value,
        color: STATUS_COLORS[key] || '#94a3b8',
      }))
    : [];

  const barData =
    data?.popularProducts.map((p) => ({
      name: p.name.length > 15 ? p.name.slice(0, 15) + '...' : p.name,
      cantitate: p.quantity,
    })) || [];

  return (
    <div className="space-y-6">
      <div>
        {/* Back link — muted 13px semibold, hover accent (design detail head) */}
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-2.5 inline-flex cursor-pointer items-center gap-0.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          <ChevronLeft className="h-[17px] w-[17px]" />
          Comenzi
        </button>
        <PageHeader
          title="Statistici comenzi"
          description="Distribuția pe status și produsele populare din interval"
        />
      </div>

      {/* Date range */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">De la</Label>
          <DatePicker
            value={from}
            onChange={setFrom}
            aria-label="Statistici de la data"
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Până la</Label>
          <DatePicker
            value={to}
            onChange={setTo}
            aria-label="Statistici până la data"
            align="end"
            className="w-40"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Se încarcă...</p>
      ) : data ? (
        <>
          {/* Summary stat cards — muted 12.5px label + 30px/700 value (design) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-(--shadow-card-sm)">
              <div className="text-[12.5px] font-medium text-muted-foreground">Total comenzi</div>
              <p className="mt-1.5 text-[30px] font-bold leading-none tracking-[-.5px]">
                {data.totalOrders}
              </p>
            </div>
            <div className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-(--shadow-card-sm)">
              <div className="text-[12.5px] font-medium text-muted-foreground">Rata la timp</div>
              <p className="mt-1.5 text-[30px] font-bold leading-none tracking-[-.5px]">
                {data.onTimeRate !== undefined ? formatPercent(data.onTimeRate * 100, 0) : '—'}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Status pie chart */}
            {pieData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Distribuție status</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip {...chartTooltipProps} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Popular products bar chart */}
            {barData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Produse populare</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={barData}>
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis />
                      <Tooltip {...chartTooltipProps} />
                      <Bar dataKey="cantitate" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Nu s-au putut încărca datele</p>
      )}
    </div>
  );
}
