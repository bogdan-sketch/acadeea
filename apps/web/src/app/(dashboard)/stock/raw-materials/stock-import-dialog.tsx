'use client';

import { useState } from 'react';
import { stockExtra } from '@/lib/api';
import type { StockImportChange, StockImportResult } from '@/lib/types';
import { formatQty } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Check, Loader2, TriangleAlert, X } from 'lucide-react';

const FIELD_LABELS: Record<StockImportChange['field'], string> = {
  stockCount: 'Stoc',
  purchasePrice: 'Preț achiziție',
  minimumStock: 'Stoc minim',
};

/**
 * Diff-ul unui import Excel de stoc (dry run): ce s-ar schimba, ce coduri nu
 * s-au găsit, câte rânduri sunt neschimbate — cu buton „Aplică modificările"
 * care rulează importul pe bune (dryRun=false).
 */
export function StockImportDialog({
  file,
  result,
  onClose,
  onApplied,
}: {
  file: File;
  result: StockImportResult;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [applying, setApplying] = useState(false);

  const handleApply = async () => {
    setApplying(true);
    try {
      const applied = await stockExtra.importExcel(file, false);
      toast.success('Import aplicat', {
        description: `${applied.changes.length} ${
          applied.changes.length === 1 ? 'modificare aplicată' : 'modificări aplicate'
        }${applied.unchanged > 0 ? ` · ${applied.unchanged} neschimbate` : ''}`,
        duration: 6000,
      });
      onClose();
      onApplied();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Eroare la aplicarea importului');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !applying && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import stoc — verificare</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Fișier: <span className="font-semibold text-foreground">{file.name}</span>. Nimic nu a
            fost modificat încă — verifică diferențele și aplică-le mai jos.
          </p>

          {result.unknownIds.length > 0 && (
            <div className="flex items-start gap-2 rounded-[var(--radius-ctl)] bg-[var(--st-orange-bg)] px-3 py-2.5 text-xs text-[var(--st-orange)]">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {result.unknownIds.length}{' '}
                {result.unknownIds.length === 1
                  ? 'rând are un cod necunoscut și va fi ignorat'
                  : 'rânduri au coduri necunoscute și vor fi ignorate'}
                : {result.unknownIds.slice(0, 5).join(', ')}
                {result.unknownIds.length > 5 ? ` +${result.unknownIds.length - 5}` : ''}
              </span>
            </div>
          )}

          {result.changes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nicio modificare de aplicat — stocul e deja la fel ca în fișier.
            </p>
          ) : (
            <div className="max-h-[45vh] overflow-auto rounded-[var(--radius-ctl)] border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className="px-4 text-[11px] font-semibold uppercase tracking-[.4px]">
                      Produs
                    </TableHead>
                    <TableHead className="px-4 text-[11px] font-semibold uppercase tracking-[.4px]">
                      Câmp
                    </TableHead>
                    <TableHead className="px-4 text-right text-[11px] font-semibold uppercase tracking-[.4px]">
                      Din
                    </TableHead>
                    <TableHead className="px-4 text-right text-[11px] font-semibold uppercase tracking-[.4px]">
                      În
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.changes.map((c, i) => (
                    <TableRow key={`${c.id}-${c.field}-${i}`} className="hover:bg-transparent">
                      <TableCell className="px-4 py-2.5 text-sm font-semibold">{c.name}</TableCell>
                      <TableCell className="px-4 py-2.5 text-sm text-muted-foreground">
                        {FIELD_LABELS[c.field]}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-right text-sm text-muted-foreground">
                        {c.from == null ? '—' : formatQty(c.from)}
                      </TableCell>
                      <TableCell className="px-4 py-2.5 text-right text-sm font-semibold">
                        {formatQty(c.to)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {result.changes.length}{' '}
            {result.changes.length === 1 ? 'modificare' : 'modificări'}
            {result.unchanged > 0 &&
              ` · ${result.unchanged} ${result.unchanged === 1 ? 'rând neschimbat' : 'rânduri neschimbate'}`}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={applying}
            title="Renunță la import"
            aria-label="Renunță la import"
          >
            <X className="h-4 w-4" /> Renunță
          </Button>
          <Button
            onClick={handleApply}
            disabled={applying || result.changes.length === 0}
            title="Aplică modificările din fișier"
            aria-label="Aplică modificările"
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{' '}
            Aplică modificările
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
