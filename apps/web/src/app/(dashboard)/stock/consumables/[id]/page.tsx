'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { consumables as consumablesApi, stock as stockApi } from '@/lib/api';
import type { Consumable, StockLot, StockMovement } from '@/lib/types';
import { StockMovementType, UnitType } from '@horae/shared-types';
import {
  materialStatusLabels,
  materialStatusColors,
  movementTypeLabels,
  unitTypeLabels,
} from '@/lib/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconAction } from '@/app/(dashboard)/stock/_ui/parts';
import { StatusBadge } from '@/components/status-badge';
import { Truncate } from '@/components/truncate';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StockAdjustmentDialog } from '@/components/stock-adjustment-dialog';
import {
  ArrowLeft,
  Loader2,
  PackagePlus,
  SlidersHorizontal,
  TrendingDown,
  Waypoints,
} from 'lucide-react';
import { BackLink } from '@/components/back-link';
import { usePermissions } from '@/contexts/auth-context';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { formatUnitQty, splitUnitQty, formatMoney } from '@/lib/utils';

// Movement-type capsules (design st-* utilities; no shared map exists for this enum).
const movementTypeColors: Record<StockMovementType, string> = {
  [StockMovementType.INTRARE]: 'st-green',
  [StockMovementType.INTRARE_PRODUCTIE]: 'st-green',
  [StockMovementType.IESIRE_PRODUCTIE]: 'st-orange',
  [StockMovementType.IESIRE_TESTE]: 'st-purple',
  [StockMovementType.IESIRE_VANZARE]: 'st-red',
  [StockMovementType.AJUSTARE]: 'st-gray',
  [StockMovementType.REZERVARE]: 'st-indigo',
  [StockMovementType.ELIBERARE]: 'st-blue',
};

export default function ConsumableDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = usePermissions();

  const [consumable, setConsumable] = useState<Consumable | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [lots, setLots] = useState<StockLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'INTRARE' | 'AJUSTARE'>('AJUSTARE');

  // No setLoading(true) here: the page starts with loading=true, and reloads
  // after a dialog save refresh the data in place without a full-page spinner.
  const load = useCallback(async () => {
    try {
      const [item, moves, intake] = await Promise.all([
        consumablesApi.get(id),
        stockApi
          .movements({ consumableId: id, limit: 20 })
          .then((r) => r.data)
          .catch(() => [] as StockMovement[]),
        stockApi.lots({ consumableId: id }).catch(() => [] as StockLot[]),
      ]);
      setConsumable(item);
      setMovements(moves);
      setLots(intake);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openDialog = (mode: 'INTRARE' | 'AJUSTARE') => {
    setDialogMode(mode);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!consumable) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Înapoi
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Consumabilul nu a fost găsit.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Consumables are counted in pieces — the API response has no `unit` field.
  const unitLabel = unitTypeLabels[UnitType.BUCATI];

  return (
    <div className="space-y-4">
      {/* Design headline: back link, serif title-row + status/category capsules */}
      <div>
        <BackLink label="Stoc" />
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-serif text-[26px] font-bold leading-[1.15] tracking-[-0.3px]">
            {consumable.title}
          </h1>
          <StatusBadge
            label={materialStatusLabels[consumable.status]}
            colorClass={materialStatusColors[consumable.status]}
          />
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {consumable.category || 'Misc'}
          </span>
        </div>
        {consumable.producer && (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{consumable.producer}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {can('create', 'StockMovement') && (
          <>
            <IconAction
              icon={PackagePlus}
              word="Recepție"
              tone="primary"
              label="Recepție marfă"
              title="Înregistrează o intrare în stoc pentru acest consumabil"
              onClick={() => openDialog('INTRARE')}
            />
            <IconAction
              icon={SlidersHorizontal}
              word="Ajustare"
              label="Ajustare stoc"
              title="Corectează stocul la valoarea reală"
              onClick={() => openDialog('AJUSTARE')}
            />
          </>
        )}
        {can('read', 'StockMovement') && (
          <IconAction
            icon={Waypoints}
            word="Trasabilitate"
            label="Trasabilitate"
            title="Toate taskurile care au folosit consumabilul"
            href={`/stock/traceability?consumableId=${id}`}
          />
        )}
      </div>

      <StockAdjustmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultMode={dialogMode}
        presetItem={{
          kind: 'consumable',
          id: consumable.id,
          title: consumable.title,
          unit: UnitType.BUCATI,
          stockCount: consumable.stockCount,
        }}
        onSuccess={load}
      />

      {/* Prominent current-stock block — right under the quick actions. */}
      <Card>
        <CardContent className="py-5">
          <p className="text-[12.5px] font-medium text-muted-foreground">În stoc</p>
          <p className="mt-1 text-[26px] font-bold leading-none tracking-[-.4px] tabular-nums">
            {splitUnitQty(consumable.stockCount, UnitType.BUCATI)[0]}{' '}
            <span className="text-[15px] font-semibold text-muted-foreground">
              {splitUnitQty(consumable.stockCount, UnitType.BUCATI)[1]}
            </span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informații</CardTitle>
        </CardHeader>
        {/* krow rows: 13.5px, muted key / value, hairline dividers */}
        <CardContent className="divide-y divide-border px-0 pt-1 text-[13.5px]">
          <Row
            label="Stoc minim"
            value={formatUnitQty(consumable.minimumStock ?? 0, UnitType.BUCATI)}
          />
          <Row label="Unitate" value={unitLabel} />
          <Row label="Categorie" value={consumable.category || 'Misc'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" /> Mișcări recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nicio mișcare înregistrată.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead>Cantitate</TableHead>
                    <TableHead>Notă</TableHead>
                    <TableHead>De către</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => {
                    // AJUSTARE stores the ABSOLUTE value the stock was set to,
                    // not a delta — render it neutral, without sign or color.
                    const isAdjustment = m.movementType === StockMovementType.AJUSTARE;
                    const isIntake =
                      m.movementType === StockMovementType.INTRARE ||
                      m.movementType === StockMovementType.INTRARE_PRODUCTIE;
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <StatusBadge
                            label={movementTypeLabels[m.movementType] || m.movementType}
                            colorClass={movementTypeColors[m.movementType] || 'st-gray'}
                          />
                        </TableCell>
                        <TableCell>
                          {isAdjustment ? (
                            <span>= {formatUnitQty(m.quantity, m.unit)}</span>
                          ) : (
                            <span
                              className="font-semibold"
                              style={{
                                color: isIntake ? 'var(--st-green)' : 'var(--st-red)',
                              }}
                            >
                              {isIntake ? '+' : '-'}
                              {formatUnitQty(m.quantity, m.unit)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {m.referenceNote ? (
                            <Truncate
                              text={m.referenceNote}
                              className="max-w-[240px] text-muted-foreground"
                            />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>{m.createdByName || '—'}</TableCell>
                        <TableCell>
                          {format(new Date(m.createdAt), 'dd MMM yyyy', { locale: ro })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {lots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackagePlus className="h-4 w-4" /> Istoric intrări ({lots.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {lots.map((lot) => (
                <div key={lot.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
                  <span className="w-24 font-medium">
                    {format(new Date(lot.receivedAt), 'dd MMM yyyy', { locale: ro })}
                  </span>
                  <span className="font-medium">
                    {formatUnitQty(lot.quantity, lot.unit || UnitType.BUCATI)}
                  </span>
                  {lot.purchasePrice != null && (
                    <span className="text-sm text-muted-foreground">
                      {formatMoney(lot.purchasePrice)}
                    </span>
                  )}
                  {lot.lotNumber && (
                    <span className="text-sm text-muted-foreground">Lot {lot.lotNumber}</span>
                  )}
                  {lot.supplierInvoice && (
                    <span className="text-sm text-muted-foreground">
                      Factură {lot.supplierInvoice}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// krow (design): muted key left / value right, hairline dividers via the parent.
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
