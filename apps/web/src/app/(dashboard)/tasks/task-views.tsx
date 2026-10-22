'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { TaskVisibility } from '@horae/shared-types';
import type { Task } from '@/lib/types';
import { TaskStatus } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Truncate } from '@/components/truncate';
import { Hint } from '@/components/hint';
import type { BulkSelect } from '@/hooks/use-bulk-select';
import { Pill } from '../stock/_ui/parts';
import { PillStrip, PinnedFilters } from '@/components/pinned-filters';
import {
  Avatar,
  StatusBar,
  StatusTag,
  TASK_STATUS_STYLE,
  formatDue,
  isOverdue,
  shortName,
  taskName,
  taskQty,
} from './task-ui';
import { BOARD_COLUMNS, type BoardStatus } from './task-filters';
import type { TaskColumns } from './use-task-columns';

function LockTag({ visibility }: { visibility?: TaskVisibility }) {
  if (!visibility || visibility === TaskVisibility.EVERYONE) return null;
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-muted px-2 text-[11px] font-bold text-secondary-foreground">
      <Lock className="size-[11px]" strokeWidth={2.4} aria-hidden="true" />
      {visibility === TaskVisibility.SELECTED ? 'anumite persoane' : 'doar alocații'}
    </span>
  );
}

function Who({ task }: { task: Task }) {
  return task.assignedTo ? (
    <>
      <Avatar
        id={task.assignedTo.id}
        first={task.assignedTo.firstName}
        last={task.assignedTo.lastName}
      />
      {shortName(task.assignedTo)}
    </>
  ) : (
    <>
      <Avatar />
      Nealocat
    </>
  );
}

/** Where a card may be dropped, mirroring the API's VALID_TRANSITIONS (Finalizat opens the yield dialog). */
const DROP_TARGETS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.DE_FACUT]: [TaskStatus.IN_LUCRU],
  [TaskStatus.BLOCAT]: [TaskStatus.IN_LUCRU, TaskStatus.DE_FACUT],
  [TaskStatus.IN_LUCRU]: [TaskStatus.FINALIZAT],
  [TaskStatus.FINALIZAT]: [],
  [TaskStatus.ANULAT]: [],
};

/**
 * Tracks horizontal overflow of a scroller so the board can show edge fades
 * (the only scroll cue overlay scrollbars leave us).
 */
function useScrollFades() {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const left = el.scrollLeft > 2;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setFade((f) => (f.left === left && f.right === right ? f : { left, right }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);
  return { ref, fade };
}

/** "Afișează mai multe" — 42px worded button under a column or grid. */
export function ShowMoreButton({
  onClick,
  loading,
  remaining,
}: {
  onClick: () => void;
  loading: boolean;
  remaining: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading}
      className="inline-flex h-[42px] w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-ctl)] border border-border bg-card text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-wait disabled:opacity-60"
    >
      {loading && (
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
      )}
      Afișează mai multe
      <span className="text-xs font-bold text-muted-foreground">({remaining})</span>
    </button>
  );
}

/** One task card — the board's design, reused by the status pages. */
export function TaskCard({
  task: t,
  movable = false,
  dimmed = false,
  onDragStart,
  onDragEnd,
  compact = false,
}: {
  task: Task;
  /** Board lanes: tighter card, no status tag (the lane already says it). */
  compact?: boolean;
  movable?: boolean;
  dimmed?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const done = t.status === TaskStatus.FINALIZAT;
  return (
    <Link
      href={`/tasks/${t.id}`}
      draggable={movable}
      onDragStart={movable ? onDragStart : undefined}
      onDragEnd={movable ? onDragEnd : undefined}
      title={movable ? 'Trage cardul în altă coloană pentru a schimba starea' : undefined}
      className={`flex min-w-0 flex-col border border-border bg-card text-foreground shadow-(--shadow-card-sm) transition-shadow hover:shadow-(--shadow-card-md) focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 ${
        compact ? 'gap-1.5 rounded-[12px] p-2.5' : 'gap-2.5 rounded-[14px] p-3.5'
      } ${movable ? 'cursor-grab active:cursor-grabbing' : ''} ${dimmed ? 'opacity-40' : ''}`}
    >
      <span className="flex items-start justify-between gap-2">
        <Truncate
          text={taskName(t)}
          className={`font-semibold leading-[1.3] ${compact ? 'text-[13px]' : 'text-sm'}`}
        />
        <span
          className={`flex-none font-serif font-semibold leading-none ${compact ? 'text-[15px]' : 'text-[18px]'}`}
        >
          {taskQty(t)}
        </span>
      </span>
      {compact ? (
        t.visibility && t.visibility !== TaskVisibility.EVERYONE ? (
          <span className="-mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Lock className="size-[10px]" strokeWidth={2.4} aria-hidden="true" />
            {t.visibility === TaskVisibility.SELECTED ? 'anumite persoane' : 'doar alocații'}
          </span>
        ) : null
      ) : (
        <span className="flex flex-wrap gap-1.5">
          <StatusTag status={t.status} />
          <LockTag visibility={t.visibility} />
        </span>
      )}
      <StatusBar status={t.status} height={compact ? 3 : 5} />
      {done && (t.completedAt || t.actualYield != null) && (
        <span
          className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-muted-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}
        >
          {t.completedAt && (
            <span>
              Gata <span className="font-semibold text-foreground">{formatDue(t.completedAt)}</span>
            </span>
          )}
          {t.actualYield != null && (
            <span>
              {compact ? 'Rand.' : 'Randament'}{' '}
              <span className="font-semibold text-foreground">
                {taskQty({ targetQuantity: t.actualYield, targetUnit: t.targetUnit })}
              </span>
            </span>
          )}
        </span>
      )}
      <span
        className={`flex items-center justify-between gap-2 text-muted-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <Who task={t} />
        </span>
        <span className={`flex-none ${isOverdue(t) ? 'font-bold text-destructive' : ''}`}>
          {t.dueDate ? formatDue(t.dueDate) : ''}
        </span>
      </span>
    </Link>
  );
}

export function TaskBoard({
  columns,
  onMove,
  onLoadMore,
  allHref,
}: {
  /** Per-status cards + API totals (see useTaskColumns). */
  columns: TaskColumns;
  /** Called when a card is dropped on another column; omit to make the board read-only. */
  onMove?: (task: Task, to: TaskStatus) => void;
  /** Loads the next page of one column. */
  onLoadMore: (status: BoardStatus) => void;
  /** Link to the page with every card of a status. */
  allHref: (status: BoardStatus) => string;
}) {
  const [dragging, setDragging] = useState<Task | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  // Phones show one column at a time, picked with status chips.
  const [mobileCol, setMobileCol] = useState<TaskStatus>(TaskStatus.DE_FACUT);
  const { ref: scroller, fade } = useScrollFades();
  const canDrop = (to: TaskStatus) => !!dragging && DROP_TARGETS[dragging.status].includes(to);

  const onDragOver = (status: TaskStatus) => (e: DragEvent) => {
    if (!canDrop(status)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (over !== status) setOver(status);
  };
  const onDrop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault();
    const t = dragging;
    setDragging(null);
    setOver(null);
    if (t && DROP_TARGETS[t.status].includes(status)) onMove?.(t, status);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* < 640: status chips pick the visible column (statuses follow the flow). */}
      <PinnedFilters sub className="sm:hidden">
        <PillStrip label="Coloană">
          {BOARD_COLUMNS.map((status) => {
            const s = TASK_STATUS_STYLE[status];
            return (
              <Pill key={status} on={mobileCol === status} onClick={() => setMobileCol(status)}>
                {s.label}
                <span className="text-[11px] font-bold">{columns[status].total}</span>
              </Pill>
            );
          })}
        </PillStrip>
      </PinnedFilters>
      {/* ≥1180: four columns in one row (scrolls with edge fades if the pane is narrower);
          640–1179: two columns per row, nothing hidden (audit M-3). Columns never scroll
          on their own: they hold a page of cards plus "Afișează mai multe". */}
      <div className="relative">
        {fade.left && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent"
          />
        )}
        {fade.right && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent"
          />
        )}
        <div ref={scroller} className="-mx-1 overflow-x-auto px-1 pb-2">
          <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-[repeat(5,minmax(172px,1fr))]">
            {BOARD_COLUMNS.map((status) => {
              const { tasks: col, total, loadingMore } = columns[status];
              const s = TASK_STATUS_STYLE[status];
              const target = canDrop(status);
              return (
                <section
                  key={status}
                  aria-label={s.label}
                  onDragOver={onDragOver(status)}
                  onDragEnter={onDragOver(status)}
                  onDragLeave={() => over === status && setOver(null)}
                  onDrop={onDrop(status)}
                  className={`flex min-w-0 flex-col gap-2 self-stretch rounded-[var(--radius-card)] p-1 transition-colors ${target ? 'min-h-[160px]' : ''} ${
                    mobileCol === status ? '' : 'max-sm:hidden'
                  } ${
                    over === status
                      ? 'bg-primary/10 ring-2 ring-primary/40'
                      : target
                        ? 'bg-muted/60 ring-1 ring-dashed ring-border'
                        : ''
                  }`}
                >
                  <div className="flex min-h-8 items-center justify-between gap-2 px-1.5 pt-1">
                    <span className="flex items-center gap-2 text-[13px] font-bold">
                      <span
                        aria-hidden="true"
                        className="size-[9px] rounded-full"
                        style={{ background: s.fg }}
                      />
                      {s.label}
                    </span>
                    {total > 0 ? (
                      <Hint
                        label={`Toate taskurile „${s.label}”`}
                        detail="Pagină cu toate cardurile"
                      >
                        <Link
                          href={allHref(status)}
                          aria-label={`Toate (${total}) — ${s.label}`}
                          className="inline-flex min-h-8 items-center rounded-lg px-1.5 text-xs font-bold text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                        >
                          Toate ({total})
                        </Link>
                      </Hint>
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground">0</span>
                    )}
                  </div>
                  {col.map((t) => (
                    <TaskCard
                      compact
                      key={t.id}
                      task={t}
                      movable={!!onMove && DROP_TARGETS[t.status].length > 0}
                      dimmed={dragging?.id === t.id}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', t.id);
                        setDragging(t);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                    />
                  ))}
                  {col.length < total && (
                    <ShowMoreButton
                      onClick={() => onLoadMore(status)}
                      loading={loadingMore}
                      remaining={total - col.length}
                    />
                  )}
                  {/* An empty lane shows nothing; only while dragging does it
                      invite the drop. */}
                  {col.length === 0 && target && (
                    <span className="px-1.5 py-6 text-center text-[13px] font-semibold text-muted-foreground">
                      Lasă cardul aici
                    </span>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const LIST_GRID = 'grid items-center gap-3 px-5 py-3';
const LIST_COLS = 'grid-cols-[minmax(0,2fr)_70px_130px_110px_120px_160px]';

export function TaskList({
  tasks,
  select,
  onOpen,
}: {
  tasks: Task[];
  select: BulkSelect;
  onOpen: (t: Task) => void;
}) {
  const ids = tasks.map((t) => t.id);
  const allSelected = ids.length > 0 && ids.every((id) => select.isSelected(id));
  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-card shadow-(--shadow-card-sm)">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div
            className={`${LIST_GRID} ${LIST_COLS} text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground`}
          >
            <span className="flex items-center gap-3">
              {select.active && (
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => select.toggleAll(ids)}
                  aria-label="Selectează toate taskurile"
                />
              )}
              Task
            </span>
            <span className="text-right">Cant.</span>
            <span>Status</span>
            <span>Cine</span>
            <span>Termen</span>
            <span>Progres</span>
          </div>
          {tasks.map((t) => (
            <div
              key={t.id}
              role="link"
              tabIndex={0}
              onClick={() => (select.active ? select.toggle(t.id) : onOpen(t))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if (select.active) select.toggle(t.id);
                else onOpen(t);
              }}
              className={`${LIST_GRID} ${LIST_COLS} cursor-pointer border-t border-border text-[13px] transition-colors hover:bg-muted/50 ${
                select.isSelected(t.id) ? 'bg-accent' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-3 font-semibold">
                {select.active && (
                  <Checkbox
                    checked={select.isSelected(t.id)}
                    onCheckedChange={() => select.toggle(t.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Selectează ${taskName(t)}`}
                  />
                )}
                <Truncate text={taskName(t)} />
              </span>
              <span className="text-right font-bold">{taskQty(t)}</span>
              <span>
                <StatusTag status={t.status} />
              </span>
              <Truncate
                text={t.assignedTo ? shortName(t.assignedTo) : 'Nealocat'}
                className="text-muted-foreground"
              />
              <span
                className={isOverdue(t) ? 'font-bold text-destructive' : 'text-muted-foreground'}
              >
                {formatDue(t.dueDate)}
              </span>
              <StatusBar status={t.status} height={6} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
