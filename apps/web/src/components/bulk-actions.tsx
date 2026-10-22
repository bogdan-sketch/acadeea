'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ListChecks, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChoiceChips } from '@/components/choice-chips';
import { ChoiceListField } from '@/components/choice-list';
import {
  locations as locationsApi,
  recipes as recipesApi,
  suppliers as suppliersApi,
  users as usersApi,
} from '@/lib/api';
import type { BulkActionResult, CategoryKind } from '@/lib/types';

/** One option in the "Acțiuni" menu of a list page in select mode. */
export type BulkActionParam =
  | { kind: 'enum'; options: { value: string; label: string }[] }
  | { kind: 'bool'; trueLabel: string; falseLabel: string }
  | { kind: 'user'; role?: string }
  | { kind: 'date' }
  | {
      kind: 'category';
      kinds: CategoryKind[];
      /** Offer "Misc (fără categorie)" → `null`. */
      allowNone?: boolean;
    }
  | { kind: 'number'; label: string; min?: number; step?: number }
  | { kind: 'location' }
  | { kind: 'supplier' };

export interface BulkActionDef {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Name of the param the API expects (`status`, `assignedToId`, …). Defaults to `key`. */
  paramName?: string;
  param?: BulkActionParam;
}

interface Pending {
  def: BulkActionDef;
  /** Already-chosen value (enum / bool submenu); otherwise picked in the dialog. */
  value?: unknown;
  valueLabel?: string;
}

interface BulkActionsMenuProps {
  actions: BulkActionDef[];
  count: number;
  disabled?: boolean;
  onAction: (key: string, params: Record<string, unknown>) => Promise<BulkActionResult>;
  onDone: () => void | Promise<void>;
}

/**
 * "Acțiuni" dropdown for bulk select mode. Enum/bool params are nested
 * submenus; the other param kinds open a small picker dialog. Every action
 * ends in a confirm step ("Aplici „X” la N elemente?").
 */
export function BulkActionsMenu({
  actions,
  count,
  disabled,
  onAction,
  onDone,
}: BulkActionsMenuProps) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [running, setRunning] = useState(false);

  const run = async (value: unknown) => {
    if (!pending) return;
    const { def } = pending;
    const name = def.paramName ?? def.key;
    const params: Record<string, unknown> = def.param ? { [name]: value } : {};
    setRunning(true);
    try {
      const res = await onAction(def.key, params);
      if (res.done.length > 0) {
        toast.success(`${res.done.length} ${res.done.length === 1 ? 'actualizat' : 'actualizate'}`);
      }
      if (res.failed.length > 0) {
        const reasons = [...new Set(res.failed.map((f) => f.reason))].slice(0, 3);
        toast.error(`${res.failed.length} nu s-au putut actualiza`, {
          description: reasons.join(' · '),
          duration: 8000,
        });
      }
      setPending(null);
      await onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Acțiunea a eșuat');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" disabled={disabled || count === 0}>
              <ListChecks className="h-4 w-4" />
              Acțiuni
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" side="top" sideOffset={8}>
          {actions.map((def) => {
            const Icon = def.icon;
            if (def.param?.kind === 'enum' || def.param?.kind === 'bool') {
              const options =
                def.param.kind === 'enum'
                  ? def.param.options
                  : [
                      { value: 'true', label: def.param.trueLabel },
                      { value: 'false', label: def.param.falseLabel },
                    ];
              const isBool = def.param.kind === 'bool';
              return (
                <DropdownMenuSub key={def.key}>
                  <DropdownMenuSubTrigger>
                    {Icon && <Icon className="h-4 w-4" />}
                    {def.label}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {options.map((o) => (
                      <DropdownMenuItem
                        key={o.value}
                        onClick={() =>
                          setPending({
                            def,
                            value: isBool ? o.value === 'true' : o.value,
                            valueLabel: o.label,
                          })
                        }
                      >
                        {o.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            }
            return (
              <DropdownMenuItem key={def.key} onClick={() => setPending({ def })}>
                {Icon && <Icon className="h-4 w-4" />}
                {def.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {pending && (
        <BulkActionDialog
          pending={pending}
          count={count}
          running={running}
          onCancel={() => !running && setPending(null)}
          onConfirm={run}
        />
      )}
    </>
  );
}

// ── Confirm / picker dialog ──────────────────────────────────────────────

type Opt = { value: string; label: string };

function BulkActionDialog({
  pending,
  count,
  running,
  onCancel,
  onConfirm,
}: {
  pending: Pending;
  count: number;
  running: boolean;
  onCancel: () => void;
  onConfirm: (value: unknown) => void;
}) {
  const { def } = pending;
  const param = def.param;
  const needsPicker = !!param && param.kind !== 'enum' && param.kind !== 'bool';
  const [value, setValue] = useState<string>('');
  const [options, setOptions] = useState<Opt[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const NONE = '__none__';
  const listKind =
    param?.kind === 'user' ||
    param?.kind === 'category' ||
    param?.kind === 'location' ||
    param?.kind === 'supplier';

  useEffect(() => {
    if (!listKind || !param) return;
    let cancelled = false;
    const load = async (): Promise<Opt[]> => {
      switch (param.kind) {
        case 'user': {
          const res = await usersApi.list({ limit: 200, isActive: true, role: param.role });
          return res.data.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }));
        }
        case 'location': {
          const all = await locationsApi.list();
          return all
            .filter((l) => l.isActive !== false)
            .map((l) => ({ value: l.id, label: l.name }));
        }
        case 'supplier': {
          const all = await suppliersApi.list();
          return all.map((s) => ({ value: s.id, label: s.name }));
        }
        case 'category': {
          const lists = await Promise.all(
            param.kinds.map((k) => recipesApi.categories(k).catch(() => [] as string[])),
          );
          const seen = new Set<string>();
          const out: Opt[] = [];
          for (const c of lists.flat()) {
            if (!seen.has(c)) {
              seen.add(c);
              out.push({ value: c, label: c });
            }
          }
          if (param.allowNone) out.unshift({ value: NONE, label: 'Misc (fără categorie)' });
          return out;
        }
        default:
          return [];
      }
    };
    load()
      .then((o) => {
        if (!cancelled) setOptions(o);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.key]);

  const resolved = (): unknown => {
    if (!param) return undefined;
    switch (param.kind) {
      case 'enum':
      case 'bool':
        return pending.value;
      case 'number':
        return Number(value);
      case 'date':
        return value ? new Date(`${value}T12:00:00`).toISOString() : undefined;
      case 'category':
      case 'supplier':
        return value === NONE ? null : value;
      default:
        return value;
    }
  };
  const ready =
    !needsPicker ||
    (param?.kind === 'number' ? value !== '' && !Number.isNaN(Number(value)) : value !== '');

  const chosenLabel =
    pending.valueLabel ??
    (listKind ? options?.find((o) => o.value === value)?.label : value ? value : undefined);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="rounded-2xl p-6 sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">{def.label}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Aplici „{def.label}
            {chosenLabel ? `: ${chosenLabel}` : ''}” la {count}{' '}
            {count === 1 ? 'element' : 'elemente'}?
          </DialogDescription>
        </DialogHeader>

        {needsPicker && param && (
          <div className="mt-3 space-y-2">
            {listKind && (
              <>
                <Label>{def.label}</Label>
                {loadError ? (
                  <p className="text-sm text-destructive">Nu am putut încărca opțiunile.</p>
                ) : options === null ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă…
                  </p>
                ) : options.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nicio opțiune disponibilă.</p>
                ) : options.length <= 10 ? (
                  <ChoiceChips
                    label={def.label}
                    value={value}
                    onChange={(v) => setValue(v ?? '')}
                    options={options}
                  />
                ) : (
                  <ChoiceListField
                    title={def.label}
                    placeholder="Alege…"
                    searchPlaceholder="Caută…"
                    value={value}
                    onChange={(v) => setValue(v)}
                    options={options}
                  />
                )}
              </>
            )}
            {param.kind === 'date' && (
              <>
                <Label>{def.label}</Label>
                <DatePicker value={value} onChange={setValue} aria-label={def.label} />
              </>
            )}
            {param.kind === 'number' && (
              <>
                <Label>{param.label}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={param.min}
                  step={param.step ?? 'any'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </>
            )}
          </div>
        )}

        <DialogFooter className="mx-0 mb-0 mt-5 border-0 bg-transparent p-0">
          <Button variant="outline" onClick={onCancel} disabled={running}>
            Renunță
          </Button>
          <Button onClick={() => onConfirm(resolved())} disabled={!ready || running}>
            {running && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplică la {count}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
