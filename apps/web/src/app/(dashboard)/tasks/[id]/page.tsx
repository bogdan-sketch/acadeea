'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  tasks as tasksApi,
  organization as organizationApi,
  recipes as recipesApi,
  users as usersApi,
} from '@/lib/api';
import type { Task, TaskTraceability, TaskMaterialRequirement, User } from '@/lib/types';
import { TaskStatus } from '@/lib/types';
import { taskStatusLabels, allowedTaskTransitions, recipeTypeLabels } from '@/lib/constants';
import type { RecipeType } from '@horae/shared-types';
import { PriorityBadge } from '@/components/priority-badge';
import { BackLink } from '@/components/back-link';
import { EmptyState } from '@/components/empty-state';
import { Truncate } from '@/components/truncate';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  ChevronLeft,
  ClipboardList,
  Play,
  Check,
  Ban,
  RotateCcw,
  ArrowLeftRight,
  FileSearch,
  CircleAlert,
  CircleCheck,
  Plus,
  ShoppingCart,
  TriangleAlert,
  Printer,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TaskVisibility } from '@horae/shared-types';
import { usePermissions } from '@/contexts/auth-context';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { toast } from 'sonner';
import Link from 'next/link';
import { formatUnitQty, formatPercent } from '@/lib/utils';
import { parseDecimal } from '@/lib/ro-number';
import { Avatar, StatusTag, TASK_STATUS_STYLE, formatDue, isOverdue, taskQty } from '../task-ui';
import { BRAND_NAME } from '@/lib/brand';

// Status → text color for the history timeline (semantic st-* palette, never
// raw hex — re-tints in dark mode).
const STATUS_TEXT_COLOR: Record<TaskStatus, string> = {
  [TaskStatus.DE_FACUT]: 'var(--st-blue)',
  [TaskStatus.BLOCAT]: 'var(--st-yellow)',
  [TaskStatus.IN_LUCRU]: 'var(--st-orange)',
  [TaskStatus.FINALIZAT]: 'var(--st-green)',
  [TaskStatus.ANULAT]: 'var(--st-red)',
};

// Icon-only header actions per target status (tooltip + aria-label = title).
const TRANSITION_META: Record<TaskStatus, { title: string; icon: LucideIcon }> = {
  [TaskStatus.IN_LUCRU]: { title: 'Începe taskul', icon: Play },
  [TaskStatus.FINALIZAT]: { title: 'Finalizează', icon: Check },
  [TaskStatus.DE_FACUT]: { title: 'Deblochează taskul', icon: RotateCcw },
  [TaskStatus.BLOCAT]: { title: 'Marchează blocat: lipsește ceva', icon: TriangleAlert },
  [TaskStatus.ANULAT]: { title: 'Anulează taskul', icon: Ban },
};

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = usePermissions();
  const [task, setTask] = useState<Task | null>(null);
  const [trace, setTrace] = useState<TaskTraceability | null>(null);
  const [materials, setMaterials] = useState<TaskMaterialRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [yieldDialog, setYieldDialog] = useState(false);
  // Board drop on "Finalizat" lands here with ?finish=1: open the yield dialog once.
  useEffect(() => {
    if (!task || task.status !== TaskStatus.IN_LUCRU) return;
    if (new URLSearchParams(window.location.search).get('finish') !== '1') return;
    window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYieldDialog(true);
  }, [task]);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [actualYield, setActualYield] = useState('');
  // Byproducts declared on the task's recipe — the finalize dialog collects
  // the ACTUAL leftover quantity per byproduct (trimmings vary per batch).
  const [byproducts, setByproducts] = useState<{ id: string; name: string }[]>([]);
  const [byproductQty, setByproductQty] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  // Local-only "pregătit" ticks for the ingredient checklist.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [assignDialog, setAssignDialog] = useState(false);
  const [savingVis, setSavingVis] = useState(false);
  // Org name for the printed fișă header. Best-effort — falls back to the brand name.
  const [orgName, setOrgName] = useState(BRAND_NAME);

  useEffect(() => {
    organizationApi
      .get()
      .then((o) => o?.name && setOrgName(o.name))
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const t = await tasksApi.get(id);
        setTask(t);
        setNotes(t.notes ?? '');
        // Best-effort: scaled material requirements. A failure must not block
        // the task view, so it is loaded separately and errors swallowed.
        tasksApi
          .materialRequirements(id)
          .then(setMaterials)
          .catch(() => {});
        // Best-effort: byproducts declared on the recipe, for the finalize
        // dialog's leftover-quantity inputs.
        recipesApi
          .get(t.recipeId)
          .then((r) => setByproducts(r.byproducts ?? []))
          .catch(() => {});
        if (t.status === TaskStatus.FINALIZAT) {
          tasksApi
            .traceability(id)
            .then(setTrace)
            .catch(() => {});
        }
      } catch {
        toast.error('Nu s-a putut încărca taskul');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Active users for the assign dialog and the "Anumite persoane" picker.
  useEffect(() => {
    if (!can('update', 'Task')) return;
    usersApi
      .list({ limit: 100, isActive: true })
      .then((r) => setUsers(r.data))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveVisibility = async (visibility: TaskVisibility, visibleToIds: string[]) => {
    setSavingVis(true);
    try {
      const updated = await tasksApi.update(id, {
        visibility,
        visibleToIds: visibility === TaskVisibility.SELECTED ? visibleToIds : [],
      });
      setTask((prev) => (prev ? { ...prev, ...updated } : updated));
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Nu s-a putut schimba vizibilitatea');
    } finally {
      setSavingVis(false);
    }
  };

  const saveNotes = async () => {
    if (!task || !can('update', 'Task') || notes === (task.notes ?? '')) return;
    try {
      const updated = await tasksApi.update(id, { notes });
      setTask((prev) => (prev ? { ...prev, ...updated } : updated));
    } catch {
      toast.error('Nota nu s-a putut salva');
    }
  };

  const assignTo = async (userId: string) => {
    try {
      const updated = await tasksApi.assign(id, userId);
      setTask((prev) => (prev ? { ...prev, ...updated } : updated));
      setAssignDialog(false);
      toast.success('Task alocat');
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Alocarea a eșuat');
    }
  };

  const handleTransition = async (toStatus: TaskStatus) => {
    if (toStatus === TaskStatus.FINALIZAT) {
      setYieldDialog(true);
      return;
    }
    if (toStatus === TaskStatus.ANULAT) {
      setCancelDialog(true);
      return;
    }
    setTransitioning(true);
    try {
      const updated = await tasksApi.transition(id, { toStatus });
      setTask(updated);
      toast.success(`Task mutat la ${taskStatusLabels[toStatus]}`);
    } catch (err: unknown) {
      // Surface the server reason (e.g. insufficient-stock shortage details)
      // instead of a generic failure, and refresh so a now-BLOCAT task updates.
      const msg = (err as { message?: string }).message;
      toast.error(msg || 'Tranziția a eșuat');
      void tasksApi
        .get(id)
        .then(setTask)
        .catch(() => {});
    } finally {
      setTransitioning(false);
    }
  };

  const submitYield = async () => {
    const yieldValue = actualYield.trim() === '' ? undefined : parseDecimal(actualYield);
    if (yieldValue !== undefined && (yieldValue == null || yieldValue <= 0)) {
      toast.error('Cantitatea obținută trebuie să fie mai mare decât 0');
      return;
    }
    setTransitioning(true);
    try {
      // When the recipe declares byproducts, the operator's entries are
      // authoritative: send the list (empty inputs count as 0 = none left).
      const byproductList = byproducts
        .map((b) => ({ recipeId: b.id, quantity: parseDecimal(byproductQty[b.id]) ?? 0 }))
        .filter((b) => b.quantity > 0);
      const updated = await tasksApi.transition(id, {
        toStatus: TaskStatus.FINALIZAT,
        actualYield: yieldValue ?? undefined,
        byproducts: byproducts.length > 0 ? byproductList : undefined,
      });
      setTask(updated);
      setYieldDialog(false);
      toast.success('Task finalizat!');
    } catch (e) {
      toast.error('Finalizarea a eșuat', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setTransitioning(false);
    }
  };

  const submitCancel = async () => {
    setTransitioning(true);
    try {
      const updated = await tasksApi.transition(id, {
        toStatus: TaskStatus.ANULAT,
        cancelReason,
      });
      setTask(updated);
      setCancelDialog(false);
      toast.success('Task anulat');
    } catch {
      toast.error('Anularea a eșuat');
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex flex-col gap-5">
        <BackLink href="/tasks" label="Producție" />
        <EmptyState
          icon={ClipboardList}
          title="Taskul nu a fost găsit"
          description="A fost șters sau nu mai ai acces la el. Lista de producție are tot ce e activ."
          actionLabel="Înapoi la producție"
          actionHref="/tasks"
        />
      </div>
    );
  }

  const transitions = allowedTaskTransitions[task.status] || [];
  const canUpdate = can('update', 'Task');
  const hasShortages = !!task.shortages && task.shortages.length > 0;
  const overdue = isOverdue(task);
  const statusStyle = TASK_STATUS_STYLE[task.status];
  const missing = materials.filter((m) => !m.sufficient).length;
  const matKey = (m: TaskMaterialRequirement) => m.rawMaterialId || m.recipeId || m.title;
  const checkedCount = materials.filter((m) => checked[matKey(m)]).length;
  const created = task.statusHistory?.length
    ? [...task.statusHistory].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    : null;
  const createdAt = created?.createdAt ?? task.createdAt;
  const reserved = task.status === TaskStatus.IN_LUCRU || task.status === TaskStatus.FINALIZAT;
  const visibility = task.visibility ?? TaskVisibility.ASSIGNED;
  const visHint: Record<TaskVisibility, string> = {
    [TaskVisibility.ASSIGNED]: 'Doar alocații îl văd în Producție; administratorii văd oricum tot.',
    [TaskVisibility.EVERYONE]: 'Toți cei din organizație îl văd în listă și în calendar.',
    [TaskVisibility.SELECTED]: 'Alocații plus persoanele alese; administratorii văd oricum tot.',
  };
  const iconBtn =
    'inline-flex h-[42px] w-[42px] flex-none cursor-pointer items-center justify-center rounded-[var(--radius-ctl)] border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';

  const iconActions: {
    key: string;
    label: string;
    icon: LucideIcon;
    cls?: string;
    run: () => void;
  }[] = [];
  if (canUpdate) {
    for (const s of transitions) {
      if (s === TaskStatus.FINALIZAT) continue; // rendered as the green button
      const meta = TRANSITION_META[s];
      iconActions.push({
        key: `t-${s}`,
        label: meta.title,
        icon: meta.icon,
        cls:
          s === TaskStatus.BLOCAT
            ? 'text-[var(--st-orange)]'
            : s === TaskStatus.ANULAT
              ? 'text-destructive'
              : s === TaskStatus.IN_LUCRU
                ? 'text-primary'
                : undefined,
        run: () => handleTransition(s),
      });
    }
  }
  if (task.status === TaskStatus.FINALIZAT && trace) {
    iconActions.push({
      key: 'trace',
      label: 'Trasabilitate',
      icon: FileSearch,
      run: () => document.getElementById('trasabilitate')?.scrollIntoView({ behavior: 'smooth' }),
    });
    iconActions.push({
      key: 'print',
      label: 'Printează fișa de trasabilitate',
      icon: Printer,
      run: () => window.print(),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/tasks"
        className="inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronLeft className="size-3.5" strokeWidth={2.4} />
        Producție
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-muted-foreground">
            <span
              className="inline-flex h-6 items-center rounded-full px-[9px] text-xs font-bold"
              style={{ background: statusStyle.bg, color: statusStyle.fg }}
            >
              {statusStyle.label}
            </span>
            {task.dueDate && (
              <span className={overdue ? 'font-bold text-destructive' : undefined}>
                Termen {formatDue(task.dueDate)}
              </span>
            )}
          </span>
          <h1 className="font-serif text-[34px] font-semibold leading-[1.05] tracking-[-0.4px]">
            {task.recipeName} <span className="text-primary">{taskQty(task)}</span>
          </h1>
          <span className="text-sm text-muted-foreground">
            {task.title && <>Nume task: „{task.title}” · </>}
            rețeta{' '}
            <Link href={`/recipes/${task.recipeId}`} className="text-primary hover:underline">
              {task.recipeName}
            </Link>
            {task.locationName && <> · {task.locationName}</>}
          </span>
        </div>
        <TutorialAnchor id="tasks.transitions.start">
          <div className="flex flex-wrap items-center gap-2.5">
            {iconActions.map((a) => (
              <button
                key={a.key}
                type="button"
                title={a.label}
                aria-label={a.label}
                onClick={a.run}
                disabled={transitioning}
                className={`${iconBtn} ${a.cls ?? ''}`}
              >
                <a.icon className="size-[18px]" />
              </button>
            ))}
            {task.status === TaskStatus.BLOCAT && (
              <Link
                href="/stock/transfers/new"
                title="Cere transfer"
                aria-label="Cere transfer"
                className={iconBtn}
              >
                <ArrowLeftRight className="size-[18px]" />
              </Link>
            )}
            {canUpdate && transitions.includes(TaskStatus.FINALIZAT) && (
              <button
                type="button"
                title={`Finalizează: ${taskQty(task)} intră în stoc${
                  task.locationName ? ` la ${task.locationName}` : ''
                }`}
                aria-label="Finalizează taskul"
                onClick={() => handleTransition(TaskStatus.FINALIZAT)}
                disabled={transitioning}
                className="inline-flex h-[42px] cursor-pointer items-center gap-2 rounded-[var(--radius-ctl)] bg-[var(--st-green)] px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check className="size-[18px]" strokeWidth={2.6} />
                Finalizează
              </button>
            )}
          </div>
        </TutorialAnchor>
      </header>

      {/* Insufficient-stock alert — red tinted panel with the shortage detail */}
      {hasShortages && (
        <TutorialAnchor id="tasks.transitions.blocked">
          <div className="flex items-start gap-[11px] rounded-[var(--radius)] border border-destructive/15 bg-destructive/[0.07] px-5 py-4">
            <CircleAlert className="mt-px size-[18px] flex-none text-destructive" />
            <div className="flex-1">
              <div className="text-[13.5px] font-bold text-destructive">Stoc insuficient</div>
              {task.shortages!.map((s) => (
                <div key={s.id} className="mt-0.5 text-[13px] text-secondary-foreground">
                  {s.rawMaterialTitle || s.recipeName}: necesar{' '}
                  {formatUnitQty(s.requiredQuantity, s.unit)}, disponibil{' '}
                  {formatUnitQty(s.availableQuantity, s.unit)}.
                </div>
              ))}
              {task.status === TaskStatus.BLOCAT && (
                <div className="mt-0.5 text-[13px] text-secondary-foreground">
                  Taskul a fost trecut pe Blocat.
                </div>
              )}
              <Link
                href="/tasks/shopping-list"
                className="mt-2 inline-block text-[12.5px] font-semibold text-primary"
              >
                Deschide lista de cumpărături
              </Link>
            </div>
          </div>
        </TutorialAnchor>
      )}

      <div className="flex flex-wrap items-start gap-[18px]">
        {/* Left column — ingredients, subtasks, traceability */}
        <section className="flex min-w-0 flex-[2_1_460px] flex-col gap-[18px]">
          {materials.length > 0 && (
            <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-(--shadow-card-sm)">
              <div className="flex items-center justify-between gap-3 px-5 pb-2.5 pt-4">
                <h2 className="text-base font-bold">Ingrediente pentru {taskQty(task)}</h2>
                <span className="text-[13px] font-semibold text-muted-foreground">
                  {checkedCount} / {materials.length} pregătite
                </span>
              </div>
              <div className="px-5 pb-3.5">
                <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-[var(--st-green)]"
                    style={{ width: `${Math.round((checkedCount / materials.length) * 100)}%` }}
                  />
                </span>
              </div>
              {materials.map((m) => {
                const k = matKey(m);
                const done = !!checked[k];
                const aria = `${done ? 'Pregătit' : 'Marchează pregătit'}: ${m.title}`;
                return (
                  <div
                    key={k}
                    className="flex items-center gap-3.5 border-t border-border px-5 py-[11px]"
                  >
                    <button
                      type="button"
                      onClick={() => setChecked((c) => ({ ...c, [k]: !done }))}
                      aria-pressed={done}
                      aria-label={aria}
                      title={aria}
                      className={`inline-flex size-[26px] flex-none cursor-pointer items-center justify-center rounded-lg border-2 p-0 text-white ${
                        done
                          ? 'border-[var(--st-green)] bg-[var(--st-green)]'
                          : 'border-input bg-card'
                      }`}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </button>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className={`text-sm font-semibold ${
                          done ? 'text-muted-foreground line-through' : ''
                        }`}
                      >
                        {m.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {m.rawMaterialId ? 'Materie primă' : 'Semipreparat'}
                      </span>
                    </span>
                    <span className="flex-none text-sm font-bold">
                      {formatUnitQty(m.needed, m.unit)}
                    </span>
                    <span
                      className={`w-[72px] flex-none text-right text-xs font-bold ${
                        m.sufficient ? 'text-muted-foreground' : 'text-destructive'
                      }`}
                      title={`În stoc: ${formatUnitQty(m.currentStock, m.unit)}`}
                    >
                      {formatUnitQty(m.currentStock, m.unit)}
                    </span>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2 border-t border-border bg-muted/40 px-5 py-3">
                {missing > 0 && (
                  <Link
                    href="/tasks/shopping-list"
                    title="Deschide lista de cumpărături"
                    className="inline-flex h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-bold"
                    style={{ background: 'var(--st-orange-bg)', color: 'var(--st-orange)' }}
                  >
                    <ShoppingCart className="size-3.5" strokeWidth={2.4} />
                    Lipsește {missing} {missing === 1 ? 'ingredient' : 'ingrediente'}
                  </Link>
                )}
                <span className="inline-flex h-[34px] items-center rounded-full bg-muted px-3 text-[13px] font-semibold text-secondary-foreground">
                  {reserved ? 'Rezervat din stoc la start' : 'Se rezervă din stoc la start'}
                </span>
              </div>
            </div>
          )}

          {/* Subtaskuri semipreparate */}
          {task.subtasks && task.subtasks.length > 0 && (
            <DsCard title="Subtaskuri semipreparate">
              {task.subtasks.map((st) => (
                <div
                  key={st.id}
                  className="flex cursor-pointer items-center gap-3 border-t border-border px-6 py-[11px] transition-colors hover:bg-muted/60"
                  onClick={() => router.push(`/tasks/${st.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold">{st.recipeName}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {formatUnitQty(st.targetQuantity, st.targetUnit)}
                    </div>
                  </div>
                  <StatusTag status={st.status} />
                </div>
              ))}
            </DsCard>
          )}

          {/* Fișă de trasabilitate */}
          {trace && (
            <div
              id="trasabilitate"
              className="overflow-hidden rounded-[18px] border border-border bg-card shadow-(--shadow-card-sm)"
            >
              <div className="px-6 pb-1 pt-5 text-[15px] font-bold">Fișă de trasabilitate</div>
              <div className="px-6 pb-4 text-[11.5px] text-muted-foreground">
                {[
                  trace.recipeName,
                  formatUnitQty(trace.actualYield ?? trace.targetQuantity, trace.targetUnit),
                  trace.assignedToName || trace.createdByName,
                  trace.completedAt &&
                    format(new Date(trace.completedAt), 'd MMM yyyy', { locale: ro }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <TraceSection title="Ingrediente și loturi (FIFO)" items={trace.ingredients} />
              {trace.subtasks.map((sub) => (
                <TraceSection
                  key={sub.taskId}
                  title={`Semipreparat: ${sub.recipeName}`}
                  items={sub.ingredients}
                />
              ))}
            </div>
          )}

          {/* Istoric statusuri */}
          {task.statusHistory && task.statusHistory.length > 0 && (
            <DsCard title="Istoric statusuri">
              {task.statusHistory.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start justify-between gap-3 border-t border-border px-6 py-[11px] text-[12.5px]"
                >
                  <span className="flex min-w-0 items-start gap-[9px]">
                    <CircleCheck
                      className="mt-px h-4 w-4 flex-none"
                      style={{ color: STATUS_TEXT_COLOR[h.toStatus] }}
                    />
                    <span className="min-w-0">
                      <b style={{ color: STATUS_TEXT_COLOR[h.toStatus] }}>
                        {taskStatusLabels[h.toStatus]}
                      </b>
                      {' · '}
                      {h.fromStatus ? 'de' : 'creat de'}{' '}
                      {h.changedBy
                        ? `${h.changedBy.firstName} ${h.changedBy.lastName?.charAt(0) || ''}${h.changedBy.lastName ? '.' : ''}`
                        : '—'}
                      {h.reason && (
                        <span className="italic text-muted-foreground"> — {h.reason}</span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {format(new Date(h.createdAt), 'd MMM, HH:mm', { locale: ro })}
                  </span>
                </div>
              ))}
            </DsCard>
          )}
        </section>

        {/* Right column — who works, who sees, details, note */}
        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-[18px]">
          <SideCard title="Cine lucrează">
            <div className="flex flex-col gap-2.5">
              {task.assignedTo ? (
                <span className="flex items-center gap-2.5">
                  <Avatar
                    id={task.assignedTo.id}
                    first={task.assignedTo.firstName}
                    last={task.assignedTo.lastName}
                    size={32}
                  />
                  <span className="flex flex-col leading-[1.15]">
                    <span className="text-sm font-semibold">
                      {task.assignedTo.firstName} {task.assignedTo.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">Alocat</span>
                  </span>
                </span>
              ) : (
                <span className="text-[13px] text-muted-foreground">Nealocat</span>
              )}
            </div>
            {canUpdate && (
              <button
                type="button"
                title={task.assignedTo ? 'Schimbă persoana alocată' : 'Adaugă persoană la task'}
                aria-label={
                  task.assignedTo ? 'Schimbă persoana alocată' : 'Adaugă persoană la task'
                }
                onClick={() => setAssignDialog(true)}
                className="inline-flex h-[38px] cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-input bg-transparent text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="size-3.5" strokeWidth={2.4} />
                {task.assignedTo ? 'Schimbă' : 'Adaugă'}
              </button>
            )}
          </SideCard>

          <SideCard title="Cine vede taskul">
            <div role="group" aria-label="Vizibilitate" className="flex flex-wrap gap-1.5">
              {(
                [
                  [TaskVisibility.ASSIGNED, 'Doar alocații'],
                  [TaskVisibility.EVERYONE, 'Toată lumea'],
                  [TaskVisibility.SELECTED, 'Anumite persoane'],
                ] as const
              ).map(([v, label]) => {
                const on = visibility === v;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    disabled={!canUpdate || savingVis}
                    onClick={() => !on && saveVisibility(v, task.visibleToIds ?? [])}
                    className={`h-[34px] cursor-pointer rounded-full border px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed ${
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-card text-foreground hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {visibility === TaskVisibility.SELECTED && canUpdate && (
              <div className="flex flex-wrap gap-1.5">
                {users
                  .filter((u) => u.id !== task.assignedToId)
                  .map((u) => {
                    const ids = task.visibleToIds ?? [];
                    const on = ids.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        aria-pressed={on}
                        disabled={savingVis}
                        onClick={() =>
                          saveVisibility(
                            TaskVisibility.SELECTED,
                            on ? ids.filter((x) => x !== u.id) : [...ids, u.id],
                          )
                        }
                        className={`h-8 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-colors ${
                          on
                            ? 'border-primary bg-accent text-primary'
                            : 'border-input bg-card text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {u.firstName} {u.lastName}
                      </button>
                    );
                  })}
              </div>
            )}
            <span className="text-xs leading-[1.45] text-muted-foreground">
              {visHint[visibility]}
            </span>
          </SideCard>

          <SideCard title="Detalii">
            <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-2 text-[13px]">
              <dt className="text-muted-foreground">Randament</dt>
              <dd className="m-0 font-semibold">
                {task.actualYield != null
                  ? `${formatUnitQty(task.actualYield, task.targetUnit)} obținut din ${formatUnitQty(task.targetQuantity, task.targetUnit)}${
                      task.variancePercent != null
                        ? ` (${task.variancePercent > 0 ? '+' : ''}${formatPercent(task.variancePercent)})`
                        : ''
                    }`
                  : `țintă ${formatUnitQty(task.targetQuantity, task.targetUnit)}`}
              </dd>
              <dt className="text-muted-foreground">Creat</dt>
              <dd className="m-0 font-semibold">
                {format(new Date(createdAt), 'd MMM, HH:mm', { locale: ro })}
                {created?.changedBy &&
                  ` · ${created.changedBy.firstName} ${created.changedBy.lastName?.charAt(0) ?? ''}.`}
              </dd>
              {task.plannedDate && (
                <>
                  <dt className="text-muted-foreground">Planificat</dt>
                  <dd className="m-0 font-semibold">
                    {format(new Date(task.plannedDate), 'd MMM yyyy', { locale: ro })}
                  </dd>
                </>
              )}
              {task.priority ? (
                <>
                  <dt className="text-muted-foreground">Prioritate</dt>
                  <dd className="m-0 font-semibold">
                    <PriorityBadge priority={task.priority} />
                  </dd>
                </>
              ) : null}
              {task.locationName && (
                <>
                  <dt className="text-muted-foreground">Locație</dt>
                  <dd className="m-0 font-semibold">{task.locationName}</dd>
                </>
              )}
            </dl>
          </SideCard>

          <SideCard title="Notă">
            <Textarea
              aria-label="Notă pentru echipă"
              rows={3}
              placeholder="Ex. clientul vrea fără alune pe margine"
              value={notes}
              readOnly={!canUpdate}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              className="bg-muted/40 text-[13px]"
            />
          </SideCard>
        </aside>
      </div>

      {/* Alocă persoană */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Cine lucrează la task</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => assignTo(u.id)}
                aria-pressed={u.id === task.assignedToId}
                className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-sm font-semibold transition-colors hover:bg-muted ${
                  u.id === task.assignedToId ? 'bg-accent text-primary' : ''
                }`}
              >
                <Avatar id={u.id} first={u.firstName} last={u.lastName} size={28} />
                {u.firstName} {u.lastName}
              </button>
            ))}
            {users.length === 0 && (
              <p className="text-[13px] text-muted-foreground">Nu s-au găsit utilizatori.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Captură randament (modalRandament) */}
      <Dialog open={yieldDialog} onOpenChange={setYieldDialog}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader className="gap-0.5">
            <DialogTitle className="text-base font-bold">Captură randament</DialogTitle>
            <p className="text-[12.5px] text-muted-foreground">
              {task.displayName ?? task.recipeName}
            </p>
          </DialogHeader>
          <div className="overflow-hidden rounded-[var(--radius-ctl)] bg-muted">
            <div className="flex items-center justify-between px-3.5 py-[11px] text-[13.5px]">
              <span>Cantitate țintă</span>
              <span className="text-muted-foreground">
                {formatUnitQty(task.targetQuantity, task.targetUnit)}
              </span>
            </div>
            <div className="ml-3.5 h-px bg-border" />
            <div className="flex items-center justify-between gap-3 px-3.5 py-1.5 text-[13.5px]">
              <span>Cantitate obținută</span>
              <Input
                type="text"
                inputMode="decimal"
                className="h-8 w-28 bg-card text-right font-semibold"
                placeholder={formatUnitQty(task.targetQuantity, task.targetUnit)}
                value={actualYield}
                onChange={(e) => setActualYield(e.target.value)}
              />
            </div>
            {/* Byproducturi: cantitatea REALĂ rămasă (variază per șarjă); gol = 0 */}
            {byproducts.map((b) => (
              <TutorialAnchor key={b.id} id="tasks.transitions.byproducts">
                <div>
                  <div className="ml-3.5 h-px bg-border" />
                  <div className="flex items-center justify-between gap-3 px-3.5 py-1.5 text-[13.5px]">
                    <Truncate text={`Produs secundar — ${b.name}`} />
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="h-8 w-28 bg-card text-right font-semibold"
                      placeholder="0"
                      value={byproductQty[b.id] ?? ''}
                      onChange={(e) =>
                        setByproductQty((prev) => ({ ...prev, [b.id]: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </TutorialAnchor>
            ))}
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            Stocul crește cu cantitatea obținută; materialele se scad FIFO din loturi.
          </p>
          <Button
            className="h-auto w-full rounded-[var(--radius-ctl)] py-3"
            onClick={submitYield}
            disabled={transitioning}
            title="Confirmă și finalizează"
            aria-label="Confirmă și finalizează"
          >
            <Check className="h-4 w-4" />
          </Button>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anulare task</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motiv anulare</Label>
            <Textarea
              placeholder="De ce anulezi acest task?"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCancelDialog(false)}
              title="Înapoi"
              aria-label="Înapoi"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={submitCancel}
              disabled={transitioning}
              title="Anulează task"
              aria-label="Anulează task"
            >
              <Ban className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Printable fișă de trasabilitate (A4, clean black-on-white) */}
      {trace && (
        <>
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #fisa-print, #fisa-print * { visibility: visible !important; }
              #fisa-print {
                position: absolute; inset: 0; display: block !important;
                margin: 0; padding: 24px;
              }
              #fisa-print table { page-break-inside: auto; }
              #fisa-print tr { page-break-inside: avoid; page-break-after: auto; }
              #fisa-print h2 { page-break-after: avoid; }
            }
          `}</style>
          <div
            id="fisa-print"
            className="hidden bg-white text-black print:block"
            style={{ fontFamily: 'Georgia, serif', fontSize: 12, lineHeight: 1.4 }}
          >
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{orgName}</p>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 700,
                textAlign: 'center',
                margin: '4px 0 16px',
                letterSpacing: 0.5,
              }}
            >
              FIȘĂ DE TRASABILITATE
            </h1>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
              <tbody>
                <FisaMeta
                  label="Produs"
                  value={`${trace.recipeName} — ${recipeTypeLabels[trace.recipeType as RecipeType] || trace.recipeType}`}
                />
                <FisaMeta
                  label="Cantitate"
                  value={formatUnitQty(trace.actualYield ?? trace.targetQuantity, trace.targetUnit)}
                />
                <FisaMeta label="Executat de" value={trace.assignedToName || trace.createdByName} />
                <FisaMeta
                  label="Început"
                  value={
                    trace.startedAt
                      ? format(new Date(trace.startedAt), 'dd.MM.yyyy', { locale: ro })
                      : '—'
                  }
                />
                <FisaMeta
                  label="Finalizat"
                  value={
                    trace.completedAt
                      ? format(new Date(trace.completedAt), 'dd.MM.yyyy', { locale: ro })
                      : '—'
                  }
                />
              </tbody>
            </table>

            <FisaTable title="Ingrediente consumate" items={trace.ingredients} />
            {trace.subtasks.map((sub) => (
              <FisaTable
                key={sub.taskId}
                title={`Semipreparat: ${sub.recipeName}`}
                items={sub.ingredients}
              />
            ))}

            {trace.history.length > 0 && (
              <>
                <h2 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>
                  Istoric stări
                </h2>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <FisaHeadRow cells={['Stare', 'Efectuat de', 'Data']} />
                  </thead>
                  <tbody>
                    {trace.history.map((h, i) => (
                      <tr key={i}>
                        <FisaCell>
                          {(h.fromStatus
                            ? `${taskStatusLabels[h.fromStatus as TaskStatus] || h.fromStatus} → `
                            : '') + (taskStatusLabels[h.toStatus as TaskStatus] || h.toStatus)}
                        </FisaCell>
                        <FisaCell>{h.byName}</FisaCell>
                        <FisaCell>{format(new Date(h.at), 'dd.MM.yyyy', { locale: ro })}</FisaCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Design card: 16px-radius bordered card, warm shadow, 15/700 header band. */
function DsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm)">
      <div className="px-6 pb-4 pt-5 text-[15px] font-bold">{title}</div>
      {children}
    </div>
  );
}

/** Side card of the Task design: 18px radius, 16/700 title, padded body. */
function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3.5 rounded-[18px] border border-border bg-card px-5 py-[18px] shadow-(--shadow-card-sm)">
      <h2 className="text-base font-bold">{title}</h2>
      {children}
    </div>
  );
}

/** Traceability section (isTrace design): bold name + qty row, gray lot lines. */
function TraceSection({
  title,
  items,
}: {
  title: string;
  items: import('@/lib/types').TraceabilityIngredient[];
}) {
  return (
    <>
      <div className="border-t border-border px-6 pb-1 pt-3 text-[13px] font-bold">{title}</div>
      {items.length === 0 ? (
        <div className="border-t border-border px-6 py-[11px] text-[12.5px] italic text-muted-foreground">
          Fără consum înregistrat.
        </div>
      ) : (
        items.map((ing, i) => {
          // Pre-FIFO tasks: single heuristic lot on the ingredient itself
          const fallbackLine =
            ing.lots.length === 0
              ? [
                  ing.lotNumber && `lot ${ing.lotNumber}`,
                  ing.invoiceNumber && `factura ${ing.invoiceNumber}`,
                  ing.supplier,
                  ing.expiryDate && `exp ${new Date(ing.expiryDate).toLocaleDateString('ro-RO')}`,
                ]
                  .filter(Boolean)
                  .join(', ')
              : '';
          return (
            <div key={i} className="border-t border-border px-6 py-[11px]">
              <div className="flex justify-between gap-3 text-[13px]">
                <b>{ing.title}</b>
                <b className="shrink-0">{formatUnitQty(ing.quantity, ing.unit)}</b>
              </div>
              {ing.lots.length === 0 && fallbackLine && (
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {formatUnitQty(ing.quantity, ing.unit)} — {fallbackLine}
                </div>
              )}
              {ing.lots.map((lot, j) => {
                const parts = [
                  lot.lotNumber && `lot ${lot.lotNumber}`,
                  lot.invoiceNumber && `factura ${lot.invoiceNumber}`,
                  lot.supplier,
                  lot.expiryDate && `exp ${new Date(lot.expiryDate).toLocaleDateString('ro-RO')}`,
                ].filter(Boolean);
                return (
                  <div key={j} className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {formatUnitQty(lot.quantity, ing.unit)}
                    {parts.length > 0 && ` — ${parts.join(', ')}`}
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </>
  );
}

const FISA_TD: CSSProperties = { border: '0.5px solid #000', padding: '3px 6px' };

function FisaMeta({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ ...FISA_TD, fontWeight: 700, width: '28%', background: '#f2f2f2' }}>{label}</td>
      <td style={FISA_TD}>{value}</td>
    </tr>
  );
}

function FisaHeadRow({ cells }: { cells: string[] }) {
  return (
    <tr>
      {cells.map((c) => (
        <th
          key={c}
          style={{ ...FISA_TD, fontWeight: 700, textAlign: 'left', background: '#f2f2f2' }}
        >
          {c}
        </th>
      ))}
    </tr>
  );
}

function FisaCell({ children }: { children: ReactNode }) {
  return <td style={FISA_TD}>{children}</td>;
}

function FisaTable({
  title,
  items,
}: {
  title: string;
  items: import('@/lib/types').TraceabilityIngredient[];
}) {
  // Mirror the on-screen logic: one row per consumed FIFO lot; pre-FIFO tasks
  // fall back to the ingredient-level lot fields (single row).
  const rows: {
    title: string;
    quantity: number;
    unit: string;
    lotNumber: string | null;
    invoiceNumber: string | null;
    supplier: string | null;
    expiryDate: string | null;
  }[] = [];
  for (const ing of items) {
    if (ing.lots.length > 0) {
      for (const lot of ing.lots) {
        rows.push({
          title: ing.title,
          quantity: lot.quantity,
          unit: ing.unit,
          lotNumber: lot.lotNumber,
          invoiceNumber: lot.invoiceNumber,
          supplier: lot.supplier,
          expiryDate: lot.expiryDate,
        });
      }
    } else {
      rows.push({
        title: ing.title,
        quantity: ing.quantity,
        unit: ing.unit,
        lotNumber: ing.lotNumber,
        invoiceNumber: ing.invoiceNumber,
        supplier: ing.supplier,
        expiryDate: ing.expiryDate,
      });
    }
  }
  return (
    <>
      <h2 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{title}</h2>
      {rows.length === 0 ? (
        <p style={{ fontStyle: 'italic', marginBottom: 8 }}>Fără consum înregistrat.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <FisaHeadRow
              cells={['Ingredient', 'Cantitate', 'Lot', 'Factură', 'Furnizor', 'Expirare']}
            />
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <FisaCell>{r.title}</FisaCell>
                <FisaCell>{formatUnitQty(r.quantity, r.unit)}</FisaCell>
                <FisaCell>{r.lotNumber || '—'}</FisaCell>
                <FisaCell>{r.invoiceNumber || '—'}</FisaCell>
                <FisaCell>{r.supplier || '—'}</FisaCell>
                <FisaCell>
                  {r.expiryDate ? new Date(r.expiryDate).toLocaleDateString('ro-RO') : '—'}
                </FisaCell>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
