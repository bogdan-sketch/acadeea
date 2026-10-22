import Link from 'next/link';
import type { LowStockItem } from '@/lib/types';
import { formatUnitQty } from '@/lib/utils';
import { Truncate } from '@/components/truncate';
import { EmptyRow, Panel } from './panel';
import { PackageCheck } from 'lucide-react';

const COLS = 'grid grid-cols-[minmax(0,1.6fr)_90px_90px_90px] items-center gap-3 px-5';

/** "Stoc critic" grid — Stoc red when 0, amber when under minimum. */
export function CriticalStock({ items }: { items: LowStockItem[] }) {
  return (
    <Panel title="Stoc critic" href="/stock" linkLabel="Vezi stocul →" className="flex-[2_1_460px]">
      {items.length === 0 ? (
        <EmptyRow icon={PackageCheck}>Totul e în stoc</EmptyRow>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[460px]">
            <div
              className={`${COLS} border-t border-border py-2 text-[11px] font-bold uppercase tracking-[.5px] text-muted-foreground`}
            >
              <span>Produs</span>
              <span className="text-right">Stoc</span>
              <span className="text-right">Minim</span>
              <span className="text-right">Acțiune</span>
            </div>
            {items.slice(0, 6).map((item) => (
              <div key={item.id} className={`${COLS} border-t border-border py-[5px] text-[13px]`}>
                <Truncate text={item.title} className="font-semibold" />
                <span
                  className={`text-right font-bold ${
                    item.currentStock === 0 ? 'text-[var(--st-red)]' : 'text-[var(--warning)]'
                  }`}
                >
                  {formatUnitQty(item.currentStock, item.unit)}
                </span>
                <span className="text-right text-muted-foreground">
                  {formatUnitQty(item.minimumStock, item.unit)}
                </span>
                {/* 32px tall text link (audit M-6), visually unchanged. */}
                <Link
                  href={`/stock/raw-materials/${item.id}`}
                  className="-mr-2 inline-flex min-h-[32px] items-center justify-end justify-self-end rounded-[9px] px-2 font-semibold text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  Comandă
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
