'use client';

import Link from 'next/link';
import { addDays, format, isSameDay } from 'date-fns';
import { ro } from 'date-fns/locale';
import { TaskStatus, type Order, type Task } from '@/lib/types';
import {
  orderStatusColors,
  orderStatusLabels,
  taskStatusColors,
  taskStatusLabels,
} from '@/lib/constants';
import { formatUnitQty } from '@/lib/utils';
import { StatusBadge } from '@/components/status-badge';
import { Truncate } from '@/components/truncate';
import { hasTimeOfDay } from '@/components/time-of-day';
import { EmptyRow, Panel } from './panel';
import { orderCustomer, orderTitle } from '@/app/(dashboard)/orders/order-ui';
import { ClipboardList, ShoppingCart } from 'lucide-react';

// Progress derived from status until task steps exist (REDESIGN-PLAN.md).
const TASK_PROGRESS: Partial<Record<TaskStatus, { pct: number; color: string }>> = {
  [TaskStatus.DE_FACUT]: { pct: 0, color: 'bg-muted-foreground' },
  [TaskStatus.IN_LUCRU]: { pct: 50, color: 'bg-[var(--st-blue)]' },
  [TaskStatus.BLOCAT]: { pct: 15, color: 'bg-[var(--st-orange)]' },
  [TaskStatus.FINALIZAT]: { pct: 100, color: 'bg-[var(--st-green)]' },
};

function qtyChip(task: Task): string {
  return task.targetUnit === 'BUCATI'
    ? `×${task.targetQuantity}`
    : formatUnitQty(task.targetQuantity, task.targetUnit);
}

function who(task: Task): string {
  if (!task.assignedTo) return 'Nealocat';
  const { firstName, lastName } = task.assignedTo;
  return `${firstName}${lastName ? ` ${lastName[0]}.` : ''}`;
}

export function TodayProduction({ tasks }: { tasks: Task[] }) {
  return (
    <Panel title="Producția de azi" href="/tasks" linkLabel="Toate taskurile →">
      {tasks.length === 0 ? (
        <EmptyRow icon={ClipboardList}>Niciun task azi</EmptyRow>
      ) : (
        tasks.slice(0, 6).map((task) => {
          const prog = TASK_PROGRESS[task.status] ?? { pct: 0, color: 'bg-muted-foreground' };
          const due = task.dueDate ? new Date(task.dueDate) : null;
          const dueLabel = due && hasTimeOfDay(due) ? `până la ${format(due, 'HH:mm')}` : null;
          return (
            <Link
              key={task.id}
              href={`/tasks/${task.id}`}
              className="flex items-center gap-3.5 border-t border-border px-5 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/60"
            >
              <span className="inline-flex h-10 min-w-10 flex-none items-center justify-center rounded-[var(--radius-ctl)] bg-muted px-1.5 font-serif text-[15px] font-semibold">
                {qtyChip(task)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <Truncate
                  text={task.displayName ?? task.recipeName}
                  className="text-sm font-semibold"
                />
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{who(task)}</span>
                  {dueLabel && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{dueLabel}</span>
                    </>
                  )}
                </span>
                <span className="mt-[3px] h-[5px] overflow-hidden rounded-full bg-border/60">
                  <span
                    className={`block h-full rounded-full ${prog.color}`}
                    style={{ width: `${prog.pct}%` }}
                  />
                </span>
              </span>
              <StatusBadge
                label={taskStatusLabels[task.status]}
                colorClass={taskStatusColors[task.status]}
                className="flex-none"
              />
            </Link>
          );
        })
      )}
    </Panel>
  );
}

type OrderWithFulfillment = Order & { fulfillmentType?: 'PICKUP' | 'DELIVERY' };

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function TodayOrders({ orders, upcoming }: { orders: Order[]; upcoming: Order[] }) {
  const now = new Date();
  const chips = [1, 2].map((n) => {
    const day = addDays(now, n);
    const count = upcoming.filter((o) => o.dueDate && isSameDay(new Date(o.dueDate), day)).length;
    const label = n === 1 ? 'Mâine' : cap(format(day, 'EEEE', { locale: ro }));
    return { n, label, count };
  });
  return (
    <Panel title="Comenzile de azi" href="/orders" linkLabel="Toate comenzile →">
      {orders.length === 0 ? (
        <EmptyRow icon={ShoppingCart}>Nicio comandă de livrat azi</EmptyRow>
      ) : (
        orders.slice(0, 6).map((o) => {
          const mode = (o as OrderWithFulfillment).fulfillmentType;
          return (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="flex items-center gap-3.5 border-t border-border px-5 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/60"
            >
              <span className="flex w-[52px] flex-none flex-col items-center leading-none">
                {/* Only a real time of day is shown; date-only due dates read "17 oct" (QA M1). */}
                {o.dueDate && hasTimeOfDay(o.dueDate) ? (
                  <span className="font-serif text-xl font-semibold">
                    {format(new Date(o.dueDate), 'HH:mm')}
                  </span>
                ) : (
                  <span className="text-center font-serif text-[13px] font-semibold leading-tight">
                    {o.dueDate ? format(new Date(o.dueDate), 'd MMM', { locale: ro }) : '—'}
                  </span>
                )}
                {mode && (
                  <span className="mt-1 text-[10px] font-bold tracking-[.4px] text-muted-foreground">
                    {mode === 'PICKUP' ? 'RIDICARE' : 'LIVRARE'}
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <Truncate text={orderTitle(o)} className="text-sm font-semibold" />
                <Truncate
                  text={orderCustomer(o) || '—'}
                  className="text-xs text-muted-foreground"
                />
              </span>
              <StatusBadge
                label={orderStatusLabels[o.status]}
                colorClass={orderStatusColors[o.status]}
                className="flex-none"
              />
            </Link>
          );
        })
      )}
      <div className="mt-auto flex flex-wrap gap-2 border-t border-border px-5 py-3">
        {chips.map((c) => (
          <Link
            key={c.n}
            href="/calendar"
            className="inline-flex h-[34px] items-center rounded-full border border-border px-3 text-[13px] font-semibold transition-colors hover:bg-muted"
          >
            {c.label} · {c.count} {c.count === 1 ? 'comandă' : 'comenzi'}
          </Link>
        ))}
      </div>
    </Panel>
  );
}
