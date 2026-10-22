'use client';

import { BackLink } from '@/components/back-link';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { dataReset } from '@/lib/api';
import { usePermissions } from '@/contexts/auth-context';
import type { ResetCategoryKey, ResetCategoryPreview } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageHead } from '../../stock/_ui/parts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Eraser, ShieldAlert, DatabaseBackup } from 'lucide-react';

const CONFIRM_WORD = 'RESETEAZA';

/** Etichete românești pentru modelele din sumar (restul rămân ca în API). */
const MODEL_LABELS_RO: Record<string, string> = {
  Task: 'Taskuri',
  TaskStatusHistory: 'Istoric taskuri',
  RecipeYieldHistory: 'Randamente',
  StockReservation: 'Rezervări',
  LotConsumption: 'Consumuri loturi',
  EquipmentReservation: 'Rezervări echipamente',
  StockMovement: 'Mișcări de stoc',
  StockLot: 'Loturi',
  RecipeStockLot: 'Loturi produse',
  MaterialStock: 'Stoc pe locații',
  RecipeStock: 'Stoc produse pe locații',
  StockTransfer: 'Transferuri',
  StockTransferItem: 'Articole transfer',
  TransferApproval: 'Aprobări transfer',
  Order: 'Comenzi',
  OrderItem: 'Articole comandă',
  OrderStatusHistory: 'Istoric comenzi',
  DeliveryNote: 'Avize de livrare',
  ConformityCertificate: 'Certificate',
  ExternalOrderSource: 'Comenzi externe',
  SalesDeduction: 'Scăderi din vânzări',
  SalesDeductionLine: 'Linii vânzări',
  Notification: 'Notificări',
  Recipe: 'Rețete',
  RecipeComponent: 'Componente rețete',
  RecipeIngredient: 'Ingrediente',
  RecipeVersion: 'Versiuni rețete',
  PriceHistory: 'Istoric prețuri',
  ProductMapping: 'Mapări produse',
  SalesProductAlias: 'Aliasuri vânzări',
  RawMaterial: 'Materii prime',
  Consumable: 'Consumabile',
  UnitConversion: 'Conversii unități',
};

function countLines(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([model, n]) => `${MODEL_LABELS_RO[model] ?? model}: ${n}`)
    .join(' · ');
}

/** Selecția + toate dependențele ei (recursiv). */
function resolve(
  selected: Set<ResetCategoryKey>,
  all: ResetCategoryPreview[],
): Set<ResetCategoryKey> {
  const byKey = new Map(all.map((c) => [c.key, c]));
  const out = new Set<ResetCategoryKey>();
  const visit = (k: ResetCategoryKey) => {
    if (out.has(k)) return;
    out.add(k);
    byKey.get(k)?.requires.forEach(visit);
  };
  selected.forEach(visit);
  return out;
}

export default function DataResetPage() {
  const { can } = usePermissions();
  const router = useRouter();
  const isAdmin = can('manage', 'all');

  const [categories, setCategories] = useState<ResetCategoryPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<ResetCategoryKey>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const { categories } = await dataReset.preview();
      setCategories(categories);
    } catch {
      toast.error('Nu am putut încărca categoriile de date');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/profil');
      return;
    }
    void load();
  }, [isAdmin, router, load]);

  const effective = useMemo(() => resolve(selected, categories), [selected, categories]);
  const effectiveList = useMemo(
    () => categories.filter((c) => effective.has(c.key)),
    [categories, effective],
  );
  const effectiveTotal = effectiveList.reduce((s, c) => s + c.total, 0);
  const includesDanger = effectiveList.some((c) => c.danger);

  if (!isAdmin) return null;

  const toggle = (key: ResetCategoryKey, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const run = async () => {
    if (confirmText !== CONFIRM_WORD || effective.size === 0) return;
    setRunning(true);
    try {
      const result = await dataReset.run([...selected]);
      toast.success(
        `Datele au fost resetate (${result.total} înregistrări șterse). S-a creat un backup înainte.`,
        { duration: 5000 },
      );
      setDialogOpen(false);
      setConfirmText('');
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.error(
        (err as { message?: string }).message || 'Resetarea a eșuat — datele NU au fost modificate',
      );
    } finally {
      setRunning(false);
    }
  };

  const operational = categories.filter((c) => !c.danger);
  const danger = categories.filter((c) => c.danger);

  const renderRow = (cat: ResetCategoryPreview) => {
    const implied = !selected.has(cat.key) && effective.has(cat.key);
    const checked = selected.has(cat.key) || implied;
    const lines = countLines(cat.counts);
    return (
      <label
        key={cat.key}
        className="flex cursor-pointer items-start justify-between gap-4 rounded-[var(--radius-ctl)] px-3 py-3 hover:bg-muted/60"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
            {cat.label}
            <Badge variant={cat.total > 0 ? 'secondary' : 'outline'}>
              {cat.total} {cat.total === 1 ? 'înregistrare' : 'înregistrări'}
            </Badge>
            {implied && <Badge variant="outline">inclus automat</Badge>}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {cat.description}
          </span>
          {lines && (
            <span className="mt-1 block text-[11px] text-muted-foreground/80">{lines}</span>
          )}
        </span>
        <Switch
          checked={checked}
          disabled={implied || running}
          onCheckedChange={(on) => toggle(cat.key, on)}
          aria-label={cat.label}
        />
      </label>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/profil?tab=setari#zona-periculoasa" label="Profil & setări" />
      <PageHead
        title="Resetare date"
        meta="Golește selectiv datele organizației — alegi exact ce se șterge"
      />
      <div className="flex max-w-3xl flex-col gap-5">
        <Alert>
          <DatabaseBackup />
          <AlertTitle>Se face backup automat înainte</AlertTitle>
          <AlertDescription>
            Înainte de orice resetare se salvează starea organizației în Backup &amp; Restaurare.
            Dacă te răzgândești, poți restaura de acolo.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Date operaționale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              operational.map(renderRow)
            )}
          </CardContent>
        </Card>

        {!loading && danger.length > 0 && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-4 w-4" />
                Date de bază
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="px-3 pb-2 text-xs text-muted-foreground">
                Rețetele și materiile prime nu se șterg niciodată implicit — doar dacă le bifezi
                aici. Ștergerea lor include automat datele care depind de ele.
              </p>
              {danger.map(renderRow)}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {effective.size === 0
              ? 'Nimic selectat'
              : `${effectiveList.map((c) => c.label).join(', ')} — ${effectiveTotal} înregistrări`}
          </p>
          <Button
            variant="destructive"
            className="h-[42px]"
            disabled={loading || effective.size === 0}
            onClick={() => {
              setConfirmText('');
              setDialogOpen(true);
            }}
          >
            <Eraser className="h-4 w-4" />
            Resetează selecția
          </Button>
        </div>
      </div>

      {/* Confirmare — dialog + cuvânt tastat */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !running && setDialogOpen(o)}>
        <DialogContent className="rounded-2xl p-6 sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-destructive">
              Resetezi {effectiveList.length === 1 ? 'categoria' : 'categoriile'} selectate?
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed">
              Se șterg definitiv <strong>{effectiveTotal} înregistrări</strong> din:{' '}
              {effectiveList.map((c) => c.label).join(', ')}.
              {includesDanger && (
                <>
                  {' '}
                  <strong className="text-destructive">
                    Include date de bază (rețete / materii prime).
                  </strong>
                </>
              )}{' '}
              Înainte se salvează automat un backup.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
            className="flex flex-col"
          >
            <Label htmlFor="reset-confirm" className="text-xs font-semibold text-muted-foreground">
              Scrie {CONFIRM_WORD} pentru a confirma
            </Label>
            <Input
              id="reset-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={running}
              autoFocus
              autoComplete="off"
              placeholder={CONFIRM_WORD}
              className="mt-1.5"
            />
            <DialogFooter className="mx-0 mb-0 mt-5 border-0 bg-transparent p-0">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDialogOpen(false)}
                disabled={running}
              >
                Anulează
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={running || confirmText !== CONFIRM_WORD}
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eraser className="h-4 w-4" />
                )}
                Resetează
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
