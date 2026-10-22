import { format, isToday, isYesterday } from 'date-fns';
import { ro } from 'date-fns/locale';
import { ActivityType, type Activity } from '@/lib/types';
import { EmptyRow, Panel } from './panel';
import { Activity as ActivityIcon } from 'lucide-react';

const DOT: Record<ActivityType, string> = {
  [ActivityType.ORDER_CREATED]: 'bg-primary',
  [ActivityType.ORDER_STATUS]: 'bg-primary',
  [ActivityType.TASK_TRANSITION]: 'bg-[var(--st-green)]',
  [ActivityType.STOCK_MOVEMENT]: 'bg-[var(--st-blue)]',
  [ActivityType.STOCK_AVAILABLE]: 'bg-[var(--st-blue)]',
  [ActivityType.LOW_STOCK]: 'bg-[var(--warning)]',
};

function when(ts: string): string {
  const d = new Date(ts);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `ieri ${format(d, 'HH:mm')}`;
  return format(d, 'd MMM HH:mm', { locale: ro });
}

export function ActivityFeed({ items }: { items: Activity[] }) {
  return (
    <Panel title="Activitate" href="/activity" linkLabel="Tot →" className="flex-[1_1_260px]">
      {items.length === 0 ? (
        <EmptyRow icon={ActivityIcon}>Nicio activitate</EmptyRow>
      ) : (
        items.slice(0, 5).map((a) => (
          <div key={a.id} className="flex gap-3 border-t border-border px-5 py-2.5">
            <span
              aria-hidden
              className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${DOT[a.type] ?? 'bg-primary'}`}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] leading-[1.35]">{a.title}</span>
              <span className="text-[11px] text-muted-foreground">{when(a.timestamp)}</span>
            </span>
          </div>
        ))
      )}
    </Panel>
  );
}
