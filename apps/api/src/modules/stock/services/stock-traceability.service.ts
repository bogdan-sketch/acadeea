import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  StockTraceabilityDto,
  StockTraceabilityQueryDto,
  TraceabilityItemDto,
  TraceabilityRowDto,
} from '../dto/stock-traceability.dto';

/** Safety cap — a product's whole history fits comfortably below this. */
const MAX_ROWS = 3000;

const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  plannedDate: true,
  createdAt: true,
  recipe: { select: { name: true } },
  assignedTo: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TaskSelect;

type TaskInfo = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

/**
 * "Trasabilitate produs" — every production task that used one stock item:
 *  - CONSUMED: IESIRE_PRODUCTIE movements of the item tied to a task (finalized
 *    tasks; one row per task, quantities summed), with the raw-material intake
 *    lots consumed FIFO (LotConsumption);
 *  - RESERVED: live reservations (not fulfilled, not released) — tasks planned
 *    or in progress that will use it;
 *  - PRODUCED (recipes only): INTRARE_PRODUCTIE — the tasks that made it.
 * Optional [from, to] filters on the row date. Read-only.
 */
@Injectable()
export class StockTraceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getTraceability(q: StockTraceabilityQueryDto): Promise<StockTraceabilityDto> {
    const ids = [q.rawMaterialId, q.consumableId, q.recipeId].filter(Boolean);
    if (ids.length !== 1) {
      throw new BadRequestException(
        'Exactly one of rawMaterialId, consumableId or recipeId must be provided',
      );
    }
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    const item = await this.resolveItem(q);

    const itemWhere: Prisma.StockMovementWhereInput = q.rawMaterialId
      ? { rawMaterialId: q.rawMaterialId }
      : q.consumableId
        ? { consumableId: q.consumableId }
        : { recipeId: q.recipeId };
    const dateWhere =
      from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {};

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        ...itemWhere,
        ...dateWhere,
        taskId: { not: null },
        movementType: {
          in: q.recipeId
            ? [StockMovementType.IESIRE_PRODUCTIE, StockMovementType.INTRARE_PRODUCTIE]
            : [StockMovementType.IESIRE_PRODUCTIE],
        },
      },
      select: {
        taskId: true,
        movementType: true,
        quantity: true,
        unit: true,
        createdAt: true,
        location: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });

    const reservations = await this.prisma.stockReservation.findMany({
      where: {
        ...(q.rawMaterialId
          ? { rawMaterialId: q.rawMaterialId }
          : q.consumableId
            ? { consumableId: q.consumableId }
            : { recipeId: q.recipeId }),
        isFulfilled: false,
        isReleased: false,
      },
      select: {
        taskId: true,
        quantityReserved: true,
        unit: true,
        createdAt: true,
        location: { select: { name: true } },
      },
      take: MAX_ROWS,
    });

    const taskIds = [
      ...new Set([
        ...movements.map((m) => m.taskId as string),
        ...reservations.map((r) => r.taskId),
      ]),
    ];
    const tasks = new Map<string, TaskInfo>(
      (
        await this.prisma.task.findMany({ where: { id: { in: taskIds } }, select: TASK_SELECT })
      ).map((t) => [t.id, t]),
    );

    // FIFO lots per task (raw materials only).
    const lotsByTask = new Map<string, TraceabilityRowDto['lots']>();
    if (q.rawMaterialId && taskIds.length) {
      const consumptions = await this.prisma.lotConsumption.findMany({
        where: { rawMaterialId: q.rawMaterialId, taskId: { in: taskIds } },
        select: {
          taskId: true,
          quantity: true,
          stockLot: { select: { lotNumber: true, supplierInvoice: true } },
        },
      });
      for (const c of consumptions) {
        // FIFO splits leave float dust (1e-18 kg) — not a real lot draw.
        if (Number(c.quantity) < 0.0005) continue;
        const list = lotsByTask.get(c.taskId) ?? [];
        list.push({
          lotNumber: c.stockLot.lotNumber,
          quantity: Number(c.quantity),
          supplierInvoice: c.stockLot.supplierInvoice,
        });
        lotsByTask.set(c.taskId, list);
      }
    }

    // One row per (task, kind): a task may consume the item in several movements.
    const rows = new Map<string, TraceabilityRowDto>();
    const base = (task: TaskInfo) => ({
      taskId: task.id,
      taskName: task.title?.trim() || task.recipe.name,
      recipeName: task.recipe.name,
      taskStatus: task.status,
      assignedToName: task.assignedTo
        ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`.trim()
        : null,
    });

    for (const m of movements) {
      const task = tasks.get(m.taskId as string);
      if (!task) continue;
      const kind = m.movementType === StockMovementType.INTRARE_PRODUCTIE ? 'PRODUCED' : 'CONSUMED';
      const key = `${task.id}:${kind}`;
      const existing = rows.get(key);
      if (existing) {
        existing.quantity += Number(m.quantity);
        continue; // movements are newest first → the first one carries the date
      }
      rows.set(key, {
        ...base(task),
        kind,
        date: m.createdAt.toISOString(),
        quantity: Number(m.quantity),
        unit: m.unit,
        locationName: m.location?.name ?? null,
        lots: kind === 'CONSUMED' ? (lotsByTask.get(task.id) ?? []) : [],
      });
    }

    for (const r of reservations) {
      const task = tasks.get(r.taskId);
      if (!task) continue;
      const when = task.plannedDate ?? r.createdAt;
      if ((from && when < from) || (to && when > to)) continue;
      const key = `${task.id}:RESERVED`;
      const existing = rows.get(key);
      if (existing) {
        existing.quantity += Number(r.quantityReserved);
        continue;
      }
      rows.set(key, {
        ...base(task),
        kind: 'RESERVED',
        date: when.toISOString(),
        quantity: Number(r.quantityReserved),
        unit: r.unit,
        locationName: r.location?.name ?? null,
        lots: [],
      });
    }

    const list = [...rows.values()].sort((a, b) => b.date.localeCompare(a.date));
    const sum = (kind: TraceabilityRowDto['kind']) =>
      round(list.filter((r) => r.kind === kind).reduce((s, r) => s + r.quantity, 0));
    for (const r of list) r.quantity = round(r.quantity);

    return {
      item,
      totals: {
        consumed: sum('CONSUMED'),
        reserved: sum('RESERVED'),
        produced: sum('PRODUCED'),
        taskCount: new Set(list.map((r) => r.taskId)).size,
      },
      rows: list,
    };
  }

  private async resolveItem(q: StockTraceabilityQueryDto): Promise<TraceabilityItemDto> {
    if (q.rawMaterialId) {
      const m = await this.prisma.rawMaterial.findUnique({
        where: { id: q.rawMaterialId },
        select: { id: true, title: true, unit: true },
      });
      if (!m) throw new NotFoundException('Materia primă nu a fost găsită');
      return { kind: 'RAW_MATERIAL', id: m.id, name: m.title, unit: m.unit };
    }
    if (q.consumableId) {
      const c = await this.prisma.consumable.findUnique({
        where: { id: q.consumableId },
        select: { id: true, title: true },
      });
      if (!c) throw new NotFoundException('Consumabilul nu a fost găsit');
      return { kind: 'CONSUMABLE', id: c.id, name: c.title, unit: 'BUCATI' };
    }
    const r = await this.prisma.recipe.findUnique({
      where: { id: q.recipeId },
      select: { id: true, name: true, unit: true },
    });
    if (!r) throw new NotFoundException('Rețeta nu a fost găsită');
    return { kind: 'RECIPE', id: r.id, name: r.name, unit: r.unit };
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
