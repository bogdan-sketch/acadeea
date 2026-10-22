'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckSquare, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BulkActionResult, BulkDeletePreview, BulkDeleteResult } from '@/lib/types';
import type { BulkSelect } from '@/hooks/use-bulk-select';
import { BulkActionsMenu, type BulkActionDef } from '@/components/bulk-actions';

/** Toolbar pill that enters/leaves "Selectează" mode. Render only when the user can delete. */
export function BulkSelectToggle({
  select,
  className,
}: {
  select: BulkSelect;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={select.active}
      className={`rounded-full ${select.active ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground' : ''} ${className ?? ''}`}
      onClick={() => (select.active ? select.exit() : select.enter())}
    >
      <CheckSquare className="h-3.5 w-3.5" />
      {select.active ? 'Gata' : 'Selectează'}
    </Button>
  );
}

interface BulkSelectBarProps {
  select: BulkSelect;
  /** Plural, lower-case: "taskuri", "comenzi", "materii prime"… */
  entityLabel: string;
  /** Extra consequence line in the confirm dialog (stock side effects etc.). */
  warning?: string;
  /** `POST …/bulk-delete/preview` — what else the delete touches. Runs before the dialog opens. */
  onPreview?: (ids: string[]) => Promise<BulkDeletePreview>;
  /** `POST …/bulk-delete` with `cascade: true` (the user confirmed the dialog). Omit to hide "Șterge". */
  onDelete?: (ids: string[]) => Promise<BulkDeleteResult>;
  /** "Acțiuni" menu entries (gate on `can('update', <Subject>)` by passing `[]`/undefined). */
  actions?: BulkActionDef[];
  /** `POST …/bulk-action` — `{ ids, action, params }`. */
  onAction?: (
    ids: string[],
    key: string,
    params: Record<string, unknown>,
  ) => Promise<BulkActionResult>;
  /** Called after a run (success or partial) so the page refetches. Select mode is exited automatically. */
  onDone: () => void | Promise<void>;
}

/**
 * Sticky bottom bar shown while a list is in "Selectează" mode: counter,
 * "Șterge (N)" + "Anulează". Flow: preview (dependents) → confirm dialog →
 * delete with cascade → per-row result toasts → `onDone`.
 */
export function BulkSelectBar({
  select,
  entityLabel,
  warning,
  onPreview,
  onDelete,
  actions,
  onAction,
  onDone,
}: BulkSelectBarProps) {
  const [preview, setPreview] = useState<BulkDeletePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const count = select.selected.size;

  // Esc leaves select mode (QA m14) — unless the confirm dialog is open, where Esc closes that.
  useEffect(() => {
    if (!select.active || preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select.exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select, preview]);

  if (!select.active) return null;

  const openDialog = async () => {
    const ids = [...select.selected];
    if (ids.length === 0 || !onPreview) return;
    setPreviewing(true);
    try {
      setPreview(await onPreview(ids));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut verifica elementele selectate');
    } finally {
      setPreviewing(false);
    }
  };

  const run = async () => {
    const ids = [...select.selected];
    if (ids.length === 0 || !onDelete) return;
    setRunning(true);
    try {
      const res = await onDelete(ids);
      if (res.deleted.length > 0) {
        toast.success(`${res.deleted.length} ${res.deleted.length === 1 ? 'șters' : 'șterse'}`);
      }
      if (res.failed.length > 0) {
        const reasons = [...new Set(res.failed.map((f) => f.reason))].slice(0, 3);
        toast.error(`${res.failed.length} nu s-au putut șterge`, {
          description: reasons.join(' · '),
          duration: 8000,
        });
      }
      setPreview(null);
      select.exit();
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ștergerea a eșuat');
    } finally {
      setRunning(false);
    }
  };

  const dependents = preview?.dependents ?? [];
  const missing = preview?.missing.length ?? 0;
  const hasDeps = dependents.length > 0;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),12px)] sm:left-[var(--sidebar-width,0px)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-(--shadow-card-md) backdrop-blur-md">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {count === 0
              ? `Bifează ${entityLabel}`
              : `${count} ${count === 1 ? 'selectat' : 'selectate'}`}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={select.exit}
            disabled={running || previewing}
          >
            <X className="h-4 w-4" />
            Anulează
          </Button>
          {actions && actions.length > 0 && onAction && (
            <BulkActionsMenu
              actions={actions}
              count={count}
              disabled={running || previewing}
              onAction={(key, params) => onAction([...select.selected], key, params)}
              onDone={async () => {
                select.exit();
                await onDone();
              }}
            />
          )}
          {onDelete && onPreview && (
            <Button
              variant="destructive"
              size="sm"
              disabled={count === 0 || running || previewing}
              onClick={openDialog}
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Șterge{count > 0 ? ` (${count})` : ''}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={preview !== null} onOpenChange={(o) => !running && !o && setPreview(null)}>
        <DialogContent className="rounded-2xl p-6 sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-destructive">
              Ștergi {count} {count === 1 ? 'element' : 'elemente'}?
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              Acțiunea este definitivă și nu poate fi anulată.
              {warning ? ` ${warning}` : ''}
              {missing > 0 ? ` ${missing} nu mai există (vor fi ignorate).` : ''}
            </DialogDescription>
          </DialogHeader>

          {hasDeps && (
            <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-[13px]">
              <div className="mb-2 flex items-center gap-1.5 font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Se vor afecta și:
              </div>
              <ul className="space-y-1">
                {dependents.map((d) => (
                  <li key={d.key} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1">{d.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-xs text-muted-foreground">
                Acestea se șterg sau se deconectează împreună cu elementele selectate.
              </p>
            </div>
          )}

          <DialogFooter className="mx-0 mb-0 mt-5 border-0 bg-transparent p-0">
            <Button variant="outline" onClick={() => setPreview(null)} disabled={running}>
              Renunță
            </Button>
            <Button variant="destructive" onClick={run} disabled={running}>
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {hasDeps ? 'Șterge tot' : 'Șterge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
