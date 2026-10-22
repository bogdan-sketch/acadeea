'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * "Selectează" mode — pass the object from `useBulkSelect()` (or anything
 * shape-compatible). While `active`, the table grows a leading checkbox
 * column, a header "select all on this page" checkbox, and a row click
 * toggles selection instead of calling `onRowClick`. Needs `getRowKey`.
 */
export interface DataTableSelection {
  active: boolean;
  isSelected: (key: string) => boolean;
  toggle: (key: string) => void;
  toggleAll: (keys: string[]) => void;
}

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /**
   * Opt-in header sorting: return the row's comparable value (string/number).
   * Sorting is client-side over the CURRENT page (server pagination is
   * untouched); click cycles asc → desc → off.
   */
  sortValue?: (row: T) => string | number | null | undefined;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  page?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  /**
   * Stable row identity (e.g. `(row) => row.id`). Without it rows reconcile
   * by position, which mismatches row state/DOM when client sorting reorders
   * the page. Falls back to the index.
   */
  getRowKey?: (row: T, index: number) => string;
  selection?: DataTableSelection;
}

export function DataTable<T>({
  columns,
  data,
  page = 1,
  total,
  limit = 20,
  onPageChange,
  onRowClick,
  isLoading,
  getRowKey,
  selection,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const selecting = !!selection?.active;
  const rowKey = (row: T, i: number) => (getRowKey ? getRowKey(row, i) : String(i));
  const pageKeys = data.map(rowKey);
  const selectedOnPage = selection ? pageKeys.filter((k) => selection.isSelected(k)).length : 0;
  const colCount = columns.length + (selecting ? 1 : 0);

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortAsc(true);
    } else if (sortAsc) {
      setSortAsc(false);
    } else {
      setSortKey(null); // third click: back to server order
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return data;
    const list = [...data];
    list.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'ro', { numeric: true });
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [data, columns, sortKey, sortAsc]);

  // Design system table (prototype .tcard/.thead/.trow): bordered 16px-radius
  // card with soft shadow, surface-2 uppercase header band, 14px rows with
  // hairline dividers and hover wash.
  return (
    <div>
      {/* xl+: overflow-x-visible so the header cells can stick to the window
          (an overflow-x-auto ancestor would swallow position:sticky). Below xl
          keeps horizontal scrolling and loses stickiness — can't have both. */}
      <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-card shadow-(--shadow-card-sm) xl:overflow-x-visible">
        <Table>
          <TableHeader>
            <TableRow className="border-0 bg-muted hover:bg-muted">
              {selecting && (
                <TableHead className="h-auto w-12 bg-muted px-4 pb-3 pt-3.5 first:rounded-tl-[calc(var(--radius-card)-1px)] xl:sticky xl:top-[var(--dt-sticky-top,var(--pinned-h,0px))] xl:z-10">
                  <Checkbox
                    aria-label="Selectează tot"
                    checked={pageKeys.length > 0 && selectedOnPage === pageKeys.length}
                    indeterminate={selectedOnPage > 0 && selectedOnPage < pageKeys.length}
                    onCheckedChange={() => selection!.toggleAll(pageKeys)}
                  />
                </TableHead>
              )}
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  // Sticky under an optional StickyActions bar: --dt-sticky-top
                  // is set by pages that render one above; else it sits under <PinnedFilters>.
                  className={`h-auto bg-muted px-6 pb-3 pt-3.5 text-[11px] font-semibold uppercase tracking-[.5px] text-muted-foreground first:rounded-tl-[calc(var(--radius-card)-1px)] last:rounded-tr-[calc(var(--radius-card)-1px)] xl:sticky xl:top-[var(--dt-sticky-top,var(--pinned-h,0px))] xl:z-10 ${col.className ?? ''}`}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      // Client-side sort — with server pagination it only
                      // reorders the rows in view, and the tooltip says so.
                      title={`Sortează după ${col.header.toLowerCase()}${
                        total !== undefined && total > limit ? ' (pagina curentă)' : ''
                      }`}
                      // -my-2/py-2: a ≥32px hit target (WCAG 2.5.8, M-6)
                      // without growing the 16px header band.
                      className="-my-2 inline-flex cursor-pointer items-center gap-1 rounded-md py-2 uppercase tracking-[.4px] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
                    >
                      {col.header}
                      {sortKey === col.key ? (
                        sortAsc ? (
                          <ArrowUp className="h-[11px] w-[11px]" />
                        ) : (
                          <ArrowDown className="h-[11px] w-[11px]" />
                        )
                      ) : (
                        <ArrowUpDown className="h-[11px] w-[11px] text-text-tertiary" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow className="border-t border-border">
                <TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">
                  Se încarcă...
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow className="border-t border-border">
                <TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">
                  Nu există date
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((row, i) => {
                const key = rowKey(row, i);
                const checked = selecting && selection!.isSelected(key);
                return (
                  <TableRow
                    key={key}
                    data-selected={checked || undefined}
                    className={`border-t border-border ${
                      selecting
                        ? `cursor-pointer ${checked ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/60'}`
                        : onRowClick
                          ? 'cursor-pointer hover:bg-muted/60'
                          : 'hover:bg-transparent'
                    }`}
                    onClick={() => (selecting ? selection!.toggle(key) : onRowClick?.(row))}
                  >
                    {selecting && (
                      <TableCell
                        className="w-12 px-4 py-[15px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label="Selectează rândul"
                          checked={checked}
                          onCheckedChange={() => selection!.toggle(key)}
                        />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={`px-6 py-[15px] text-sm ${col.className ?? ''}`}
                      >
                        {col.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {onPageChange && total !== undefined && (
        <div className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">
            {total} rezultate — pagina {page} din {Math.max(1, Math.ceil(total / limit))}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              title="Pagina anterioară"
              aria-label="Pagina anterioară"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page * limit >= (total ?? 0)}
              title="Pagina următoare"
              aria-label="Pagina următoare"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
