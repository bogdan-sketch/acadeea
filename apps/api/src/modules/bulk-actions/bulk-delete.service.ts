import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SalesDeductionStatus, TaskStatus, TransferStatus } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { StockReservationService } from '@/modules/stock/services/stock-reservation.service';
import { SalesDeductionsService } from '@/modules/sales-deductions/sales-deductions.service';
import { SystemLogsService } from '@/modules/system-logs/system-logs.service';
import { RawMaterialsService } from '@/modules/raw-materials/raw-materials.service';
import { SystemLogLevel } from '@prisma/client';
import {
  BulkDeleteResource,
  BulkDependentKey,
  describeDependents,
  mergeCounts,
  toDependents,
} from './bulk-actions.resources';
import { BulkDeletePreviewDto, BulkDeleteResultDto } from './dto';

type Counts = Partial<Record<BulkDependentKey, number>>;

interface Actor {
  userId: string;
  email?: string;
  organizationId: string;
}

/**
 * Multi-select delete for the seven list resources. Design:
 *
 * - `preview(resource, ids)` → what ELSE the delete would touch ("dependents"),
 *   summed over the selection. Clients show it in the confirm dialog.
 * - `run(resource, ids, cascade)` → every id is deleted in its own
 *   transaction; a failure lands in `failed[{id, reason}]` and never aborts the
 *   batch. With `cascade: false` any row that has dependents is refused with a
 *   reason listing them (the user must confirm → clients resend with
 *   `cascade: true`). With `cascade: true` dependents are removed/unlinked so
 *   the delete always goes through.
 *
 * Every resource routine lists its RESTRICT foreign keys explicitly (see the
 * comments) — Prisma's defaults are SetNull for optional FKs, which would
 * leave XOR-violating orphans (a StockMovement with no material), so children
 * are deleted on purpose instead of nulled.
 */
@Injectable()
export class BulkDeleteService {
  private readonly logger = new Logger(BulkDeleteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockReservation: StockReservationService,
    private readonly salesDeductions: SalesDeductionsService,
    private readonly systemLogs: SystemLogsService,
    private readonly rawMaterials: RawMaterialsService,
  ) {}

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  async preview(resource: BulkDeleteResource, ids: string[]): Promise<BulkDeletePreviewDto> {
    const unique = [...new Set(ids)];
    const counts: Counts = {};
    const missing: string[] = [];
    for (const id of unique) {
      const c = await this.dependentsOf(resource, id);
      if (c === null) missing.push(id);
      else mergeCounts(counts, c);
    }
    return { found: unique.length - missing.length, missing, dependents: toDependents(counts) };
  }

  async run(
    resource: BulkDeleteResource,
    ids: string[],
    cascade: boolean,
    actor: Actor,
  ): Promise<BulkDeleteResultDto> {
    const result: BulkDeleteResultDto = { deleted: [], failed: [] };
    for (const id of [...new Set(ids)]) {
      try {
        if (!cascade) {
          const c = await this.dependentsOf(resource, id);
          if (c === null) throw new NotFoundException('Nu a fost găsit (poate a fost șters deja).');
          const deps = toDependents(c);
          if (deps.length > 0) {
            throw new BadRequestException(
              `Are dependențe — ${describeDependents(deps)}. Confirmă ștergerea împreună cu ele.`,
            );
          }
        }
        await this.deleteOne(resource, id, actor);
        result.deleted.push(id);
      } catch (err) {
        result.failed.push({ id, reason: reasonOf(err) });
      }
    }

    this.logger.warn(
      `Bulk delete ${resource}: ${result.deleted.length} deleted, ${result.failed.length} failed (cascade=${cascade}) by ${actor.email ?? actor.userId}`,
    );
    if (result.deleted.length > 0) {
      this.systemLogs.log({
        category: 'SYSTEM',
        action: 'bulk.delete',
        level: SystemLogLevel.WARN,
        message: `Ștergere multiplă ${resource}: ${result.deleted.length} șterse${
          result.failed.length ? `, ${result.failed.length} eșuate` : ''
        }${cascade ? ' (cu dependențe)' : ''}`,
        organizationId: actor.organizationId,
        userId: actor.userId,
        userEmail: actor.email ?? null,
        metadata: { resource, cascade, deleted: result.deleted, failed: result.failed },
      });
    }
    return result;
  }

  // ------------------------------------------------------------------
  // Dependents (preview + non-cascade guard). `null` = row not found.
  // ------------------------------------------------------------------

  private async dependentsOf(resource: BulkDeleteResource, id: string): Promise<Counts | null> {
    const p = this.prisma;
    switch (resource) {
      case 'tasks': {
        const t = await p.task.findUnique({ where: { id }, select: { id: true } });
        if (!t) return null;
        return { subtasks: await p.task.count({ where: { parentTaskId: id } }) };
      }
      case 'orders': {
        const o = await p.order.findUnique({ where: { id }, select: { id: true } });
        return o ? {} : null;
      }
      case 'transfers': {
        const t = await p.stockTransfer.findUnique({ where: { id }, select: { status: true } });
        if (!t) return null;
        const active =
          t.status === TransferStatus.IN_ASTEPTARE || t.status === TransferStatus.IN_TRANZIT;
        return { activeTransfers: active ? 1 : 0 };
      }
      case 'raw-materials': {
        const m = await p.rawMaterial.findUnique({ where: { id }, select: { stockCount: true } });
        if (!m) return null;
        const [recipes, transferLines, reservations, nonZeroRow] = await Promise.all([
          p.recipeComponent.findMany({
            where: { ingredients: { some: { rawMaterialId: id } } },
            select: { recipeId: true },
            distinct: ['recipeId'],
          }),
          p.stockTransferItem.count({
            where: { rawMaterialId: id, transfer: { status: { not: TransferStatus.ANULAT } } },
          }),
          p.stockReservation.findMany({
            where: { rawMaterialId: id, isFulfilled: false, isReleased: false },
            select: { taskId: true },
            distinct: ['taskId'],
          }),
          p.materialStock.findFirst({
            where: { rawMaterialId: id, quantity: { not: 0 } },
            select: { id: true },
          }),
        ]);
        return {
          recipesUsing: recipes.length,
          transferLines,
          activeReservations: reservations.length,
          nonZeroStock: Number(m.stockCount) !== 0 || nonZeroRow ? 1 : 0,
        };
      }
      case 'consumables': {
        const c = await p.consumable.findUnique({ where: { id }, select: { stockCount: true } });
        if (!c) return null;
        const reservations = await p.stockReservation.findMany({
          where: { consumableId: id, isFulfilled: false, isReleased: false },
          select: { taskId: true },
          distinct: ['taskId'],
        });
        return {
          activeReservations: reservations.length,
          nonZeroStock: Number(c.stockCount) !== 0 ? 1 : 0,
        };
      }
      case 'recipes': {
        const r = await p.recipe.findUnique({ where: { id }, select: { id: true } });
        if (!r) return null;
        const [tasks, orderLines, semis, transferLines, salesLines] = await Promise.all([
          p.task.count({ where: { recipeId: id } }),
          p.orderItem.count({ where: { recipeId: id } }),
          p.recipeComponent.findMany({
            where: { ingredients: { some: { semipreparatRecipeId: id } } },
            select: { recipeId: true },
            distinct: ['recipeId'],
          }),
          p.stockTransferItem.count({
            where: { recipeId: id, transfer: { status: { not: TransferStatus.ANULAT } } },
          }),
          p.salesDeductionLine.count({ where: { recipeId: id } }),
        ]);
        return { tasks, orderLines, semipreparatIn: semis.length, transferLines, salesLines };
      }
      case 'sales-deductions': {
        const d = await p.salesDeduction.findUnique({ where: { id }, select: { status: true } });
        if (!d) return null;
        return { confirmedDeductions: d.status === SalesDeductionStatus.CONFIRMED ? 1 : 0 };
      }
    }
  }

  // ------------------------------------------------------------------
  // Delete routines (cascade always on here — the guard ran before)
  // ------------------------------------------------------------------

  private async deleteOne(resource: BulkDeleteResource, id: string, actor: Actor): Promise<void> {
    switch (resource) {
      case 'tasks':
        return this.deleteTask(id, actor);
      case 'orders':
        return this.deleteOrder(id);
      case 'transfers':
        return this.deleteTransfer(id);
      case 'raw-materials':
        return this.deleteRawMaterial(id);
      case 'consumables':
        return this.deleteConsumable(id);
      case 'recipes':
        return this.deleteRecipe(id, actor);
      case 'sales-deductions':
        return this.deleteSalesDeduction(id, actor);
    }
  }

  /**
   * Task: subtasks first (same routine), live reservations released through
   * StockReservationService so reservedCount/MaterialStock stay right, then
   * RESTRICT children (StockReservation, RecipeYieldHistory) + the row.
   * TaskStatusHistory / LotConsumption / EquipmentReservation cascade;
   * StockMovement.taskId / RecipeStockLot.taskId are optional → SetNull
   * (stock history is kept, just unlinked).
   */
  private async deleteTask(id: string, actor: Actor): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: { id: true, status: true, subtasks: { select: { id: true } } },
    });
    if (!task) throw new NotFoundException('Taskul nu a fost găsit (poate a fost șters deja).');

    for (const st of task.subtasks) await this.deleteTask(st.id, actor);

    if (task.status === TaskStatus.IN_LUCRU) {
      await this.stockReservation.releaseForTask(id, actor.userId);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.stockReservation.deleteMany({ where: { taskId: id } });
      await tx.recipeYieldHistory.deleteMany({ where: { taskId: id } });
      await tx.task.delete({ where: { id } });
    });
  }

  /**
   * Order: delivery note (RESTRICT) removed, external sources unlinked (the
   * (integrationId, externalId) key keeps a webhook replay from recreating
   * it); items / status history / certificate cascade.
   */
  private async deleteOrder(id: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id }, select: { id: true } });
    if (!order)
      throw new NotFoundException('Comanda nu a fost găsită (poate a fost ștearsă deja).');
    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryNote.deleteMany({ where: { orderId: id } });
      await tx.externalOrderSource.updateMany({ where: { orderId: id }, data: { orderId: null } });
      await tx.order.delete({ where: { id } });
    });
  }

  /**
   * Transfer: an active one still holds stock that already left the source
   * → put it back (same bookkeeping as ANULAT), claimed atomically so a
   * concurrent cancel can't double-return. Items + approval cascade.
   */
  private async deleteTransfer(id: string): Promise<void> {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!transfer) {
      throw new NotFoundException('Transferul nu a fost găsit (poate a fost șters deja).');
    }
    await this.prisma.$transaction(async (tx) => {
      const active =
        transfer.status === TransferStatus.IN_ASTEPTARE ||
        transfer.status === TransferStatus.IN_TRANZIT;
      if (active) {
        const claimed = await tx.stockTransfer.updateMany({
          where: {
            id,
            status: { in: [TransferStatus.IN_ASTEPTARE, TransferStatus.IN_TRANZIT] },
          },
          data: { status: TransferStatus.ANULAT },
        });
        if (claimed.count === 0) {
          throw new BadRequestException('Transferul a fost procesat între timp — reîncarcă.');
        }
        await this.returnTransferStock(
          tx as unknown as PrismaService,
          transfer.fromLocationId,
          transfer.items,
        );
      }
      await tx.stockTransfer.delete({ where: { id } });
    });
  }

  private async returnTransferStock(
    tx: PrismaService,
    fromLocationId: string,
    items: { rawMaterialId: string | null; recipeId: string | null; quantity: Prisma.Decimal }[],
  ): Promise<void> {
    for (const item of items) {
      if (item.rawMaterialId) {
        await tx.materialStock.upsert({
          where: {
            locationId_rawMaterialId: {
              locationId: fromLocationId,
              rawMaterialId: item.rawMaterialId,
            },
          },
          update: { quantity: { increment: item.quantity } },
          create: {
            locationId: fromLocationId,
            rawMaterialId: item.rawMaterialId,
            quantity: item.quantity,
          },
        });
      } else if (item.recipeId) {
        await tx.recipeStock.upsert({
          where: { locationId_recipeId: { locationId: fromLocationId, recipeId: item.recipeId } },
          update: { quantity: { increment: item.quantity } },
          create: { locationId: fromLocationId, recipeId: item.recipeId, quantity: item.quantity },
        });
      }
    }
  }

  /**
   * Raw material: exactly the single delete (`RawMaterialsService.hardDelete`)
   * — refused while any location holds stock or the material is on a
   * non-cancelled transfer (printed avize are fiscal history), re-checked
   * inside the transaction. `cascade` does NOT bypass that guard: such
   * materials land in `failed[]` with the reason and must be discontinued
   * instead. When allowed, the whole stock trail goes with it.
   */
  private async deleteRawMaterial(id: string): Promise<void> {
    const m = await this.prisma.rawMaterial.findUnique({ where: { id }, select: { id: true } });
    if (!m)
      throw new NotFoundException('Materia primă nu a fost găsită (poate a fost ștearsă deja).');
    await this.rawMaterials.hardDelete(id);
  }

  /** Consumable: lots, movements, reservations, price history, then the row. */
  private async deleteConsumable(id: string): Promise<void> {
    const c = await this.prisma.consumable.findUnique({ where: { id }, select: { id: true } });
    if (!c) throw new NotFoundException('Consumabilul nu a fost găsit (poate a fost șters deja).');
    await this.prisma.$transaction(async (tx) => {
      await tx.stockLot.deleteMany({ where: { consumableId: id } });
      await tx.stockMovement.deleteMany({ where: { consumableId: id } });
      await tx.stockReservation.deleteMany({ where: { consumableId: id } });
      await tx.priceHistory.deleteMany({ where: { consumableId: id } });
      await tx.consumable.delete({ where: { id } });
    });
  }

  /**
   * Recipe: production tasks go first (task routine, incl. subtasks and live
   * reservations), order lines keep the product name but lose the link,
   * ingredient rows of OTHER recipes using this one as semipreparat are
   * removed (an ingredient with no material would be a broken row), transfer
   * lines are removed (XOR), finished-goods stock / lots / movements /
   * reservations / yield history / price history / product mappings are
   * deleted; sales lines are unlinked; byproducts lose their source; versions,
   * components and sales aliases cascade.
   */
  private async deleteRecipe(id: string, actor: Actor): Promise<void> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      select: { id: true, name: true, tasks: { select: { id: true } } },
    });
    if (!recipe)
      throw new NotFoundException('Rețeta nu a fost găsită (poate a fost ștearsă deja).');

    for (const t of recipe.tasks) {
      // A task may already be gone as a subtask of an earlier one in this loop.
      const still = await this.prisma.task.findUnique({
        where: { id: t.id },
        select: { id: true },
      });
      if (still) await this.deleteTask(t.id, actor);
    }

    await this.prisma.$transaction(async (tx) => {
      const lines = await tx.orderItem.findMany({
        where: { recipeId: id },
        select: { id: true, label: true },
      });
      for (const l of lines) {
        await tx.orderItem.update({
          where: { id: l.id },
          data: { recipeId: null, label: l.label ?? recipe.name },
        });
      }
      await tx.recipeIngredient.deleteMany({ where: { semipreparatRecipeId: id } });
      await tx.stockTransferItem.deleteMany({ where: { recipeId: id } });
      await tx.stockReservation.deleteMany({ where: { recipeId: id } });
      await tx.stockMovement.deleteMany({ where: { recipeId: id } });
      await tx.recipeStockLot.deleteMany({ where: { recipeId: id } });
      await tx.recipeStock.deleteMany({ where: { recipeId: id } });
      await tx.recipeYieldHistory.deleteMany({ where: { recipeId: id } });
      await tx.priceHistory.deleteMany({ where: { recipeId: id } });
      await tx.productMapping.deleteMany({ where: { recipeId: id } });
      await tx.salesDeductionLine.updateMany({ where: { recipeId: id }, data: { recipeId: null } });
      await tx.recipe.updateMany({ where: { sourceRecipeId: id }, data: { sourceRecipeId: null } });
      await tx.recipe.delete({ where: { id } });
    });
  }

  /** Sales deduction: CONFIRMED → revert first (stock comes back), then delete (lines cascade). */
  private async deleteSalesDeduction(id: string, actor: Actor): Promise<void> {
    const d = await this.prisma.salesDeduction.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!d) throw new NotFoundException('Scăderea nu a fost găsită (poate a fost ștearsă deja).');
    if (d.status === SalesDeductionStatus.CONFIRMED) {
      await this.salesDeductions.revert(id, actor.userId);
    }
    await this.prisma.salesDeduction.delete({ where: { id } });
  }
}

/** User-facing reason out of whatever the delete routine threw. */
export function reasonOf(err: unknown): string {
  if (err instanceof HttpException) {
    const res = err.getResponse();
    if (typeof res === 'string') return res;
    if (res && typeof res === 'object' && 'message' in res) {
      const m = (res as { message: unknown }).message;
      return Array.isArray(m) ? m.join(' ') : String(m);
    }
    return err.message;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
    return 'Există încă înregistrări legate de acest rând (restricție de integritate).';
  }
  if (err instanceof Error) return err.message;
  return 'Eroare necunoscută';
}
