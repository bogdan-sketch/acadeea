'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Check, Plus, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Truncate } from '@/components/truncate';
import { cn } from '@/lib/utils';

export interface ChoiceListOption {
  value: string;
  /** Plain text — shown in the row and matched by the search. */
  label: string;
  /** Muted second line under the label. */
  hint?: string;
  /** Right-aligned extra (stock on hand, unit…). */
  meta?: ReactNode;
  /** Small capsule after the label ("Produs", "semipreparat"). */
  badge?: string;
  /** Rows with the same group render under one heading. */
  group?: string;
  /** Extra text the search should also match (producer, code…). */
  keywords?: string;
  disabled?: boolean;
}

/** Diacritics-insensitive, case-insensitive contains. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

type Row =
  | { kind: 'heading'; key: string; text: string }
  | { kind: 'option'; opt: ChoiceListOption };

/**
 * Searchable list for long option sets (recipes, products, people, suppliers):
 * a 42px search field over an always-visible scrollable list of rows. The
 * selected row carries a check mark; ↑/↓ move, Enter picks, Esc clears the
 * query. Use inline, or through `ChoiceListField` when the form only has room
 * for a trigger button.
 */
export function ChoiceList({
  value,
  options,
  onChange,
  placeholder = 'Caută…',
  emptyText = 'Niciun rezultat.',
  onCreate,
  createLabel,
  autoFocus,
  className,
  listClassName,
}: {
  value: string | null | undefined;
  options: ChoiceListOption[];
  onChange: (value: string, option: ChoiceListOption) => void;
  placeholder?: string;
  emptyText?: string;
  /** Offer a "create" row at the bottom (receives the current query). */
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  autoFocus?: boolean;
  className?: string;
  /** Height/scroll class of the list; defaults to `max-h-72`. */
  listClassName?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  // Keyboard cursor, tracked by VALUE so filtering never strands it: when the
  // cursor's row is filtered out the cursor falls back to the first row.
  const [cursor, setCursor] = useState<string | null>(value ?? null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(query);
    const hits = q
      ? options.filter((o) =>
          normalize(`${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`).includes(q),
        )
      : options;
    // Group order = first appearance; ungrouped rows keep their place.
    const grouped = new Map<string, ChoiceListOption[]>();
    const loose: ChoiceListOption[] = [];
    for (const o of hits) {
      if (!o.group) {
        loose.push(o);
        continue;
      }
      const list = grouped.get(o.group) ?? [];
      list.push(o);
      grouped.set(o.group, list);
    }
    const rows: Row[] = loose.map((opt) => ({ kind: 'option', opt }));
    for (const [text, list] of grouped) {
      rows.push({ kind: 'heading', key: `h:${text}`, text });
      for (const opt of list) rows.push({ kind: 'option', opt });
    }
    return rows;
  }, [options, query]);

  const selectable = useMemo(
    () => filtered.flatMap((r) => (r.kind === 'option' && !r.opt.disabled ? [r.opt] : [])),
    [filtered],
  );

  const active = Math.max(
    selectable.findIndex((o) => o.value === cursor),
    0,
  );
  const moveTo = (idx: number) => {
    const opt = selectable[Math.min(Math.max(idx, 0), selectable.length - 1)];
    if (opt) setCursor(opt.value);
  };

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[id="${id}-opt-${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, id]);

  const createText = createLabel
    ? createLabel(query.trim())
    : query.trim()
      ? `Adaugă „${query.trim()}”`
      : 'Adaugă nou';

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveTo(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveTo(active - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      moveTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      moveTo(selectable.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = selectable[active];
      if (opt) onChange(opt.value, opt);
      else if (onCreate) onCreate(query.trim());
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      e.stopPropagation();
      setQuery('');
    }
  };

  let optionIndex = -1;
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label className="flex h-[42px] items-center gap-2 rounded-[var(--radius-ctl)] border border-input bg-card px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <Search aria-hidden className="h-4 w-4 flex-none text-muted-foreground" />
        <input
          type="search"
          role="combobox"
          aria-expanded
          aria-controls={`${id}-list`}
          aria-activedescendant={selectable[active] ? `${id}-opt-${active}` : undefined}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />
      </label>
      <div
        ref={listRef}
        id={`${id}-list`}
        role="listbox"
        aria-label={placeholder}
        className={cn(
          'overflow-y-auto rounded-[var(--radius-ctl)] border border-border bg-card p-1',
          listClassName ?? 'max-h-72',
        )}
      >
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">{emptyText}</p>
        )}
        {filtered.map((row) => {
          if (row.kind === 'heading') {
            return (
              <p
                key={row.key}
                className="px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[.5px] text-muted-foreground first:pt-1.5"
              >
                {row.text}
              </p>
            );
          }
          const { opt } = row;
          const idx = opt.disabled ? -1 : ++optionIndex;
          const selected = opt.value === value;
          const isActive = idx === active;
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              id={idx >= 0 ? `${id}-opt-${idx}` : undefined}
              aria-selected={selected}
              disabled={opt.disabled}
              onMouseMove={() => idx >= 0 && idx !== active && setCursor(opt.value)}
              onClick={() => onChange(opt.value, opt)}
              className={cn(
                'flex min-h-[42px] w-full cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                isActive && 'bg-muted',
                selected && 'font-semibold',
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <Truncate text={opt.label} className="flex-1" />
                  {opt.badge && (
                    <span className="flex-none rounded-full bg-muted px-1.5 py-px text-[11px] font-semibold text-muted-foreground">
                      {opt.badge}
                    </span>
                  )}
                </span>
                {opt.hint && (
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {opt.hint}
                  </span>
                )}
              </span>
              {opt.meta && (
                <span className="flex-none text-xs font-normal text-muted-foreground">
                  {opt.meta}
                </span>
              )}
              <Check
                aria-hidden
                className={cn('h-4 w-4 flex-none text-primary', !selected && 'invisible')}
              />
            </button>
          );
        })}
        {onCreate && (
          <button
            type="button"
            onClick={() => onCreate(query.trim())}
            className="mt-1 flex min-h-[42px] w-full cursor-pointer items-center gap-2 rounded-[9px] border-t border-border px-2.5 py-2 text-left text-[13.5px] font-semibold text-primary transition-colors hover:bg-muted"
          >
            <Plus className="h-4 w-4 flex-none" />
            <span className="truncate">{createText}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 42px field that shows the chosen option and opens the searchable list in a
 * dialog — for forms where a long list cannot sit inline (one per table row).
 */
export function ChoiceListField({
  value,
  options,
  onChange,
  title,
  placeholder = 'Alege…',
  searchPlaceholder,
  emptyText,
  onCreate,
  createLabel,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  value: string | null | undefined;
  options: ChoiceListOption[];
  onChange: (value: string, option: ChoiceListOption) => void;
  /** Dialog title ("Alege rețeta"). */
  title: string;
  /** Trigger text while nothing is chosen. */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-[42px] w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-ctl)] border border-input bg-transparent px-[13px] text-left text-sm transition-colors outline-none hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          className,
        )}
      >
        {selected ? (
          <Truncate text={selected.label} className="flex-1 font-medium" />
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
        <Search aria-hidden className="h-4 w-4 flex-none text-muted-foreground" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">Caută și alege din listă.</DialogDescription>
          </DialogHeader>
          <ChoiceList
            autoFocus
            value={value}
            options={options}
            placeholder={searchPlaceholder}
            emptyText={emptyText}
            listClassName="max-h-[50vh]"
            onChange={(v, opt) => {
              onChange(v, opt);
              setOpen(false);
            }}
            onCreate={
              onCreate
                ? (q) => {
                    setOpen(false);
                    onCreate(q);
                  }
                : undefined
            }
            createLabel={createLabel}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
