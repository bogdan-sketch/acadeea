'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { addDays, endOfDay, format, isSameDay, startOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import { useAuth, usePermissions } from '@/contexts/auth-context';
import {
  dashboard,
  activity as activityApi,
  tasks as tasksApi,
  orders as ordersApi,
  stock as stockApi,
} from '@/lib/api';
import {
  OrderStatus,
  TaskStatus,
  type Activity,
  type DashboardStats,
  type ExpiringItem,
  type Order,
  type Task,
  type TaskQuery,
} from '@/lib/types';
import { StatCard } from '@/components/stat-card';
import { IconAction } from './stock/_ui/parts';
import { PageHeader } from '@/components/page-header';
import { STICKY_HEAD } from '@/lib/sticky-head';
import { CriticalStock } from '@/components/dashboard/critical-stock';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { TodayOrders, TodayProduction } from '@/components/dashboard/today-lists';

/**
 * Dashboard per the Claude Design prototype (Main.dc.html): greeting + date
 * eyebrow, 4 KPI cards, "Producția de azi" + "Comenzile de azi" side by side,
 * then "Stoc critic" (2/3) + "Activitate" (1/3). Everything stacks on phones.
 */

type DueTaskQuery = TaskQuery & { dueAfter: string; dueBefore: string };

export default function DashboardPage() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [calendarOrders, setCalendarOrders] = useState<Order[]>([]);
  const [expiring, setExpiring] = useState<ExpiringItem[]>([]);

  useEffect(() => {
    const now = new Date();
    const taskQuery: DueTaskQuery = {
      dueAfter: startOfDay(now).toISOString(),
      dueBefore: endOfDay(now).toISOString(),
      limit: 50,
    };
    dashboard
      .stats()
      .then(setStats)
      .catch(() => {});
    activityApi
      .list({ limit: 5 })
      .then((r) => setRecentActivity(r.data))
      .catch(() => {});
    tasksApi
      .list(taskQuery)
      .then((r) =>
        setTodayTasks(
          r.data
            .filter((t) => t.status !== TaskStatus.ANULAT)
            .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')),
        ),
      )
      .catch(() => {});
    // Calendar keys are date-only (UTC midnight): pad the range a day each way
    // and bucket by local day on the client.
    ordersApi
      .calendar(format(addDays(now, -1), 'yyyy-MM-dd'), format(addDays(now, 3), 'yyyy-MM-dd'))
      .then((res) =>
        setCalendarOrders(
          Object.values(res)
            .flat()
            .filter((o) => o.status !== OrderStatus.ANULATA && o.dueDate),
        ),
      )
      .catch(() => {});
    stockApi
      .expiring(3)
      .then(setExpiring)
      .catch(() => {});
  }, []);

  const now = new Date();
  const todayRaw = format(now, 'EEEE, d MMMM yyyy · HH:mm', { locale: ro });
  const eyebrow = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);

  const ordersToday = calendarOrders
    .filter((o) => isSameDay(new Date(o.dueDate!), now))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  const outOfStock =
    stats?.outOfStockCount ??
    stats?.lowStockMaterials.filter((m) => m.currentStock === 0).length ??
    0;
  const stockAlerts =
    stats != null
      ? (stats.lowStockCount ?? stats.lowStockMaterials.length - outOfStock) + outOfStock
      : undefined;
  const tasksToday = todayTasks.length || (stats?.todayTasksDue ?? 0);
  const doneToday = todayTasks.filter((t) => t.status === TaskStatus.FINALIZAT).length;
  const inProgress = todayTasks.filter((t) => t.status === TaskStatus.IN_LUCRU).length;
  const ordersDue = stats?.todayOrdersDue ?? 0;

  const firstName = user?.firstName ?? '';
  const ordersLine = !stats
    ? ''
    : ordersDue === 0
      ? ' Azi nu ies comenzi.'
      : ordersDue === 1
        ? ' Azi iese 1 comandă.'
        : ` Azi ies ${ordersDue} comenzi.`;
  const title = `Bună, ${firstName}.${ordersLine}`;

  const expiringNames = expiring
    .slice(0, 2)
    .map((e) => e.materialTitle)
    .join(' · ');

  const addOrder = can('create', 'Order') ? (
    <IconAction
      icon={Plus}
      tone="primary"
      word="Comandă"
      href="/orders/new"
      label="Comandă nouă"
      title="Comandă nouă: client, produse, termen, livrare sau ridicare"
    />
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="hidden sm:block [&>div]:mb-0">
        <PageHeader eyebrow={eyebrow} title={title} actions={addOrder} />
      </div>
      <div className={`flex items-end justify-between gap-3 sm:hidden ${STICKY_HEAD}`}>
        <div className="min-w-0">
          <div className="mb-1 text-[13px] font-semibold text-muted-foreground">{eyebrow}</div>
          <h1 className="font-serif text-[26px] font-semibold leading-[1.05] tracking-[-0.4px]">
            {title}
          </h1>
        </div>
        {addOrder}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <Link href="/tasks" className="block min-w-0 h-full">
          <StatCard
            tone="blue"
            label="Taskuri azi"
            value={stats || todayTasks.length ? tasksToday : '—'}
            sub={`${doneToday} finalizate · ${inProgress} în lucru`}
          />
        </Link>
        <Link href="/orders" className="block min-w-0 h-full">
          <StatCard
            label="Comenzi de livrat"
            value={stats ? ordersDue : '—'}
            sub={
              stats
                ? `${stats.todayPickups ?? 0} ridicări · ${stats.todayDeliveries ?? 0} livrare`
                : undefined
            }
          />
        </Link>
        <Link href="/stock/low-stock" className="block min-w-0 h-full">
          <StatCard
            tone="orange"
            label="Alerte stoc"
            value={stockAlerts ?? '—'}
            sub={
              stats
                ? `${outOfStock} epuizat · ${Math.max(0, (stockAlerts ?? 0) - outOfStock)} sub minim`
                : undefined
            }
          />
        </Link>
        <Link href="/stock/expiring" className="block min-w-0 h-full">
          <StatCard
            tone="green"
            label="Expiră în 3 zile"
            value={expiring.length}
            sub={expiringNames || undefined}
          />
        </Link>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-[18px]">
        <TodayProduction tasks={todayTasks} />
        <TodayOrders orders={ordersToday} upcoming={calendarOrders} />
      </div>

      <div className="flex flex-wrap items-start gap-[18px]">
        <CriticalStock items={stats?.lowStockMaterials ?? []} />
        <ActivityFeed items={recentActivity} />
      </div>
    </div>
  );
}
