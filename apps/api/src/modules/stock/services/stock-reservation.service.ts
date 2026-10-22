import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, MaterialStatus, UnitType } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { RecipeResolutionService } from '@/modules/recipes';
import { WebsocketService, StockUpdateDto, MovementType } from '@/modules/websocket';
import { consumeRecipeLotsFifo } from '../recipe-lot-fifo.util';
import { buildLotNumber, bucharestDayStartUtc } from './lot-naming.util';

const UNIT_SHORT: Record<string, string> = {
  MILIGRAME: 'mg',
  GRAME: 'g',
  KILOGRAME: 'kg',
  MILILITRI: 'ml',
  LITRI: 'l',
  BUCATI: 'buc',
  LINGURITE: 'lgț',
  LINGURI: 'lg',
  CANI: 'căni',
  OUNCES: 'oz',
  POUNDS: 'lb',
};

/** Human quantity for messages: "13 g" instead of "0.0133 KILOGRAME". */
function fmtQty(value: number, unit: string): string {
  let v = Number(value);
  let u = unit;
  if (u === 'KILOGRAME' && v > 0 && v < 1) {
    v *= 1000;
    u = 'GRAME';
  } else if (u === 'LITRI' && v > 0 && v < 1) {
    v *= 1000;
    u = 'MILILITRI';
  }
  const n = Math.round(v * 100) / 100;
  return `${n.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} ${UNIT_SHORT[u] ?? u.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Types for raw SQL query results
// ---------------------------------------------------------------------------

interface ConsumableRow {
  id: string;
  title: string;
  stockCount: Prisma.Decimal;
  reservedCount: Prisma.Decimal;
  minimumStock: Prisma.Decimal;
  status: string;
}

interface MaterialStockRow {
  id: string;
  locationId: string;
  rawMaterialId: string;
  quantity: Prisma.Decimal;
  reservedCount: Prisma.Decimal;
}

interface RecipeStockRow {
  id: string;
  locationId: string;
  recipeId: string;
  quantity: Prisma.Decimal;
  reservedCount: Prisma.Decimal;
}

interface StockLotRow {
  id: string;
  rawMaterialId: string;
  remainingQuantity: Prisma.Decimal;
}

/** Operator-reported byproduct quantity sent with a finalize transition. */
export interface ByproductInput {
  recipeId: string;
  quantity: number;
}

interface ShortageInfo {
  rawMaterialId?: string;
  rawMaterialTitle?: string;
  recipeId?: string;
  recipeName?: string;
  needed: number;
  available: number;
  unit: string;
}

/**
 * Read-only material requirement for a task, scaled to its target quantity.
 * `needed` is the scaled amount (e.g. 3.2 kg for 300 cookies, not the 2.2 kg
 * base recipe). `currentStock` is the physical stock right now and `stockAfter`
 * is what remains once this task is produced.
 */
export interface MaterialRequirement {
  rawMaterialId?: string;
  recipeId?: string;
  title: string;
  unit: string;
  needed: number;
  currentStock: number;
  available: number;
  stockAfter: number;
  sufficient: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class StockReservationService {
  private readonly logger = new Logger(StockReservationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipeResolution: RecipeResolutionService,
    private readonly ws: WebsocketService,
  ) {}

  // ---------------------------------------------------------------------------
  // Per-location helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the location stock should be drawn from: the task's location, else
   * the system default (first active LABORATOR, else first active location).
   */
  private async resolveLocationId(taskLocationId: string | null): Promise<string | null> {
    if (taskLocationId) return taskLocationId;
    const lab = await this.prisma.location.findFirst({
      where: { isActive: true, type: 'LABORATOR' },
      orderBy: { createdAt: 'asc' },
    });
    if (lab) return lab.id;
    const any = await this.prisma.location.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return any?.id ?? null;
  }

  /**
   * Recompute a raw material's global aggregate (stockCount/reservedCount) as the
   * sum of its per-location MaterialStock rows, and refresh its status. Keeps the
   * global views working while per-location stock is the source of truth.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async syncRawMaterialAggregate(tx: any, rawMaterialId: string): Promise<void> {
    const agg = await tx.materialStock.aggregate({
      where: { rawMaterialId },
      _sum: { quantity: true, reservedCount: true },
    });
    const stockCount = Number(agg._sum.quantity ?? 0);
    const reservedCount = Number(agg._sum.reservedCount ?? 0);
    const material = await tx.rawMaterial.findUnique({ where: { id: rawMaterialId } });
    if (!material) return;
    await tx.rawMaterial.update({
      where: { id: rawMaterialId },
      data: {
        stockCount,
        reservedCount,
        status: this.computeStatus(
          stockCount,
          Number(material.minimumStock),
          material.status as MaterialStatus,
        ),
      },
    });
  }

  /** Recompute a recipe's global stock/reserved as the sum of its RecipeStock rows. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async syncRecipeAggregate(tx: any, recipeId: string): Promise<void> {
    const agg = await tx.recipeStock.aggregate({
      where: { recipeId },
      _sum: { quantity: true, reservedCount: true },
    });
    await tx.recipe.update({
      where: { id: recipeId },
      data: {
        stockCount: Math.round(Number(agg._sum.quantity ?? 0)),
        reservedCount: Math.round(Number(agg._sum.reservedCount ?? 0)),
      },
    });
  }

  /**
   * Reserve stock for a task when it transitions DE_FACUT -> IN_LUCRU.
   * Uses SELECT FOR UPDATE (pessimistic locking) to prevent race conditions.
   *
   * Steps:
   * 1. Load the task to get recipe and scale info
   * 2. Resolve recipe into flat ingredient list
   * 3. For each raw material: lock row -> check available (stockCount - reservedCount) >= needed -> increment reservedCount
   * 4. Create StockReservation rows
   * 5. Create StockMovement rows (type: REZERVARE)
   * 6. All-or-nothing in one transaction
   *
   * @throws NotFoundException if the task does not exist
   * @throws BadRequestException with detailed shortage info if insufficient stock
   */
  async reserveForTask(taskId: string, userId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { recipe: true },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID "${taskId}" not found`);
    }

    const locationId = await this.resolveLocationId(task.locationId);
    if (!locationId) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: 'STOCK_002',
        message: 'Nicio locație de producție configurată. Asignează o locație task-ului.',
      });
    }

    // Resolve recipe into flat ingredient list
    const resolved = await this.recipeResolution.resolveTree(
      task.recipeId,
      Number(task.targetQuantity),
      task.targetUnit,
    );

    const ingredients = resolved.resolvedIngredients;
    const stockedSemis = resolved.stockedSemipreparate;

    if (ingredients.length === 0 && stockedSemis.length === 0) {
      this.logger.log(`Task "${taskId}" has no ingredients to reserve`);
      return;
    }

    await this.prisma.$transaction(
      async (tx) => {
        const shortages: ShortageInfo[] = [];

        // Phase 1a: Lock per-location raw-material stock and check availability
        for (const ingredient of ingredients) {
          const [stock] = await tx.$queryRaw<MaterialStockRow[]>`
            SELECT * FROM "MaterialStock"
            WHERE "locationId" = ${locationId}::uuid AND "rawMaterialId" = ${ingredient.rawMaterialId}::uuid
            FOR UPDATE
          `;

          const available = stock ? Number(stock.quantity) - Number(stock.reservedCount) : 0;
          const needed = ingredient.quantity;

          if (available < needed) {
            const material = await tx.rawMaterial.findUnique({
              where: { id: ingredient.rawMaterialId },
            });
            shortages.push({
              rawMaterialId: ingredient.rawMaterialId,
              rawMaterialTitle: material?.title ?? ingredient.rawMaterialTitle,
              needed,
              available,
              unit: ingredient.unit,
            });
          }
        }

        // Phase 1b: Lock per-location semipreparate stock and check availability
        for (const semi of stockedSemis) {
          const [stock] = await tx.$queryRaw<RecipeStockRow[]>`
            SELECT * FROM "RecipeStock"
            WHERE "locationId" = ${locationId}::uuid AND "recipeId" = ${semi.recipeId}::uuid
            FOR UPDATE
          `;

          const available = stock ? Number(stock.quantity) - Number(stock.reservedCount) : 0;
          const needed = semi.quantity;

          if (available < needed) {
            shortages.push({
              recipeId: semi.recipeId,
              recipeName: semi.recipeName,
              needed,
              available,
              unit: semi.unit,
            });
          }
        }

        if (shortages.length > 0) {
          const shortageDetails = shortages
            .map((s) => {
              const name = s.rawMaterialTitle ?? s.recipeName ?? 'Necunoscut';
              return `${name}: necesar ${fmtQty(s.needed, s.unit)}, disponibil ${fmtQty(s.available, s.unit)}`;
            })
            .join('; ');

          throw new BadRequestException({
            statusCode: 400,
            errorCode: 'STOCK_001',
            message: `Stoc insuficient: ${shortageDetails}`,
            shortages: shortages.map((s) => ({
              rawMaterialId: s.rawMaterialId,
              rawMaterialTitle: s.rawMaterialTitle,
              recipeId: s.recipeId,
              recipeName: s.recipeName,
              needed: s.needed,
              available: s.available,
              unit: s.unit,
            })),
          });
        }

        // Phase 2a: Reserve per-location raw-material stock
        for (const ingredient of ingredients) {
          await tx.materialStock.upsert({
            where: {
              locationId_rawMaterialId: { locationId, rawMaterialId: ingredient.rawMaterialId },
            },
            update: { reservedCount: { increment: ingredient.quantity } },
            create: {
              locationId,
              rawMaterialId: ingredient.rawMaterialId,
              quantity: 0,
              reservedCount: ingredient.quantity,
            },
          });

          await tx.stockReservation.create({
            data: {
              taskId,
              rawMaterialId: ingredient.rawMaterialId,
              locationId,
              quantityReserved: ingredient.quantity,
              unit: ingredient.unit as UnitType,
            },
          });

          await tx.stockMovement.create({
            data: {
              rawMaterialId: ingredient.rawMaterialId,
              locationId,
              movementType: 'REZERVARE',
              quantity: ingredient.quantity,
              unit: ingredient.unit as UnitType,
              taskId,
              performedById: userId,
              referenceNote: `Rezervare pentru taskul „${Number(task.targetQuantity)} ${task.recipe.name}”`,
            },
          });

          await this.syncRawMaterialAggregate(tx, ingredient.rawMaterialId);
        }

        // Phase 2b: Reserve per-location semipreparate stock
        for (const semi of stockedSemis) {
          await tx.recipeStock.upsert({
            where: { locationId_recipeId: { locationId, recipeId: semi.recipeId } },
            update: { reservedCount: { increment: semi.quantity } },
            create: {
              locationId,
              recipeId: semi.recipeId,
              quantity: 0,
              reservedCount: semi.quantity,
            },
          });

          await tx.stockReservation.create({
            data: {
              taskId,
              recipeId: semi.recipeId,
              locationId,
              quantityReserved: semi.quantity,
              unit: semi.unit as UnitType,
            },
          });

          await tx.stockMovement.create({
            data: {
              recipeId: semi.recipeId,
              locationId,
              movementType: 'REZERVARE',
              quantity: semi.quantity,
              unit: semi.unit as UnitType,
              taskId,
              performedById: userId,
              referenceNote: `Rezervare pentru taskul „${Number(task.targetQuantity)} ${task.recipe.name}”`,
            },
          });

          await this.syncRecipeAggregate(tx, semi.recipeId);
        }
      },
      { timeout: 15000 },
    );

    // Emit WebSocket events after successful transaction
    for (const ingredient of ingredients) {
      const material = await this.prisma.rawMaterial.findUnique({
        where: { id: ingredient.rawMaterialId },
      });

      if (material) {
        const stockUpdate: StockUpdateDto = {
          materialId: material.id,
          materialTitle: material.title,
          newStockCount: Number(material.stockCount),
          movementType: MovementType.OUT,
        };

        this.ws.emitStockUpdate(stockUpdate);

        if (Number(material.stockCount) <= Number(material.minimumStock)) {
          this.ws.emitLowStockAlert(stockUpdate);
        }
      }
    }

    this.logger.log(
      `Reserved stock for task "${Number(task.targetQuantity)} ${task.recipe.name}" (${taskId}): ${ingredients.length} raw materials, ${stockedSemis.length} stocked semipreparate`,
    );
  }

  /**
   * Fulfill reservations when task transitions IN_LUCRU -> FINALIZAT.
   * Deducts actual stock (stockCount) and marks reservations as fulfilled.
   *
   * Steps:
   * 1. Find all unfulfilled reservations for this task
   * 2. Lock each material row
   * 3. Decrement stockCount by reserved quantity
   * 4. Decrement reservedCount by reserved quantity
   * 5. Mark reservations as fulfilled
   * 6. Create StockMovement rows (type: IESIRE_PRODUCTIE)
   * 7. Update material status based on new stock level
   */
  async fulfillForTask(
    taskId: string,
    userId: string,
    outputLocationId?: string,
    byproductInputs?: ByproductInput[],
  ): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { recipe: true, subtasks: { select: { recipeId: true } } },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID "${taskId}" not found`);
    }

    // Byproducts declared on the produced recipe (isByproduct semipreparate
    // linked via sourceRecipeId) — credited as extra production output below.
    // Subtask recipes are included too, so the parent's finalize can still
    // report a subtask's trimmings. Explicit quantities are required for
    // those (no auto fallback) — a subtask's own finalize already applies the
    // declared-yield fallback for its recipe.
    const byproductSourceIds = [
      task.recipeId,
      ...task.subtasks.map((s) => s.recipeId).filter((rid) => rid !== task.recipeId),
    ];
    const byproducts = await this.prisma.recipe.findMany({
      where: { sourceRecipeId: { in: byproductSourceIds }, isByproduct: true, isArchived: false },
    });

    // Operator-reported quantities (trimmings vary per batch, so the client
    // sends the ACTUAL leftover amounts). When present, the list is
    // authoritative; unknown recipe ids are rejected.
    if (byproductInputs && byproductInputs.length > 0) {
      const declared = new Set(byproducts.map((b) => b.id));
      const unknown = byproductInputs.filter((i) => !declared.has(i.recipeId));
      if (unknown.length > 0) {
        throw new BadRequestException({
          statusCode: 400,
          errorCode: 'STOCK_004',
          message: `Rețetele [${unknown.map((u) => u.recipeId).join(', ')}] nu sunt byproducturi active ale rețetei produse`,
        });
      }
    }
    const byproductQtyById = byproductInputs
      ? new Map(byproductInputs.map((i) => [i.recipeId, i.quantity]))
      : null;
    // Byproducts credited in the transaction — websocket stock updates are
    // emitted for these after commit (same pattern as the reservation emits).
    const creditedByproductIds: string[] = [];

    const reservations = await this.prisma.stockReservation.findMany({
      where: {
        taskId,
        isFulfilled: false,
        isReleased: false,
      },
    });

    const productionLocationId = await this.resolveLocationId(task.locationId);
    // Finished goods land here. Phase 2 will allow a different destination +
    // auto-generate a transfer; for now it defaults to the production location.
    const destinationLocationId = outputLocationId ?? productionLocationId;

    await this.prisma.$transaction(
      async (tx) => {
        // Fulfill input reservations
        for (const reservation of reservations) {
          const quantity = Number(reservation.quantityReserved);
          const locId = reservation.locationId ?? productionLocationId;

          if (reservation.rawMaterialId) {
            if (locId) {
              const [stock] = await tx.$queryRaw<MaterialStockRow[]>`
                SELECT * FROM "MaterialStock"
                WHERE "locationId" = ${locId}::uuid AND "rawMaterialId" = ${reservation.rawMaterialId}::uuid
                FOR UPDATE
              `;
              if (stock) {
                await tx.materialStock.update({
                  where: {
                    locationId_rawMaterialId: {
                      locationId: locId,
                      rawMaterialId: reservation.rawMaterialId,
                    },
                  },
                  data: {
                    quantity: Math.max(0, Number(stock.quantity) - quantity),
                    reservedCount: Math.max(0, Number(stock.reservedCount) - quantity),
                  },
                });
              }
              await this.syncRawMaterialAggregate(tx, reservation.rawMaterialId);
            }

            await tx.stockMovement.create({
              data: {
                rawMaterialId: reservation.rawMaterialId,
                locationId: locId,
                movementType: 'IESIRE_PRODUCTIE',
                quantity,
                unit: reservation.unit,
                taskId,
                performedById: userId,
                referenceNote: 'Consum în producție',
              },
            });

            await this.consumeLotsFifo(
              tx,
              taskId,
              reservation.rawMaterialId,
              quantity,
              reservation.unit,
            );
          } else if (reservation.consumableId) {
            const [consumable] = await tx.$queryRaw<ConsumableRow[]>`
              SELECT * FROM "Consumable" WHERE "id" = ${reservation.consumableId}::uuid FOR UPDATE
            `;

            if (!consumable) {
              throw new NotFoundException(
                `Consumable with ID "${reservation.consumableId}" not found`,
              );
            }

            const newStockCount = Number(consumable.stockCount) - quantity;
            const newReservedCount = Number(consumable.reservedCount) - quantity;

            await tx.consumable.update({
              where: { id: reservation.consumableId },
              data: {
                stockCount: Math.max(0, newStockCount),
                reservedCount: Math.max(0, newReservedCount),
                status: this.computeStatus(
                  newStockCount,
                  Number(consumable.minimumStock),
                  consumable.status as MaterialStatus,
                ),
              },
            });

            await tx.stockMovement.create({
              data: {
                consumableId: reservation.consumableId,
                locationId: locId,
                movementType: 'IESIRE_PRODUCTIE',
                quantity,
                unit: reservation.unit,
                taskId,
                performedById: userId,
                referenceNote: 'Consum în producție',
              },
            });
          } else if (reservation.recipeId) {
            // Stocked semipreparate — deduct from the location's RecipeStock
            if (locId) {
              const [stock] = await tx.$queryRaw<RecipeStockRow[]>`
                SELECT * FROM "RecipeStock"
                WHERE "locationId" = ${locId}::uuid AND "recipeId" = ${reservation.recipeId}::uuid
                FOR UPDATE
              `;
              if (stock) {
                await tx.recipeStock.update({
                  where: {
                    locationId_recipeId: { locationId: locId, recipeId: reservation.recipeId },
                  },
                  data: {
                    quantity: Math.max(0, Number(stock.quantity) - quantity),
                    reservedCount: Math.max(0, Number(stock.reservedCount) - quantity),
                  },
                });
                // Mirror the aggregate decrement on the per-batch lots (FIFO).
                await consumeRecipeLotsFifo(tx, reservation.recipeId, locId, quantity);
              }
              await this.syncRecipeAggregate(tx, reservation.recipeId);
            }

            await tx.stockMovement.create({
              data: {
                recipeId: reservation.recipeId,
                locationId: locId,
                movementType: 'IESIRE_PRODUCTIE',
                quantity,
                unit: reservation.unit,
                taskId,
                performedById: userId,
                referenceNote: 'Consum în producție',
              },
            });
          }

          // Mark reservation as fulfilled
          await tx.stockReservation.update({
            where: { id: reservation.id },
            data: { isFulfilled: true },
          });
        }

        // Production output: add actualYield to the destination location's RecipeStock
        const recipe = task.recipe;
        if ((recipe.type === 'FINAL' || recipe.type === 'SEMIPREPARAT') && productionLocationId) {
          const actualYield =
            task.actualYield != null ? Number(task.actualYield) : Number(task.targetQuantity);

          // Batch expiry from the recipe's shelf life (presets 1/2/3/6/12
          // months or custom). Stored conservatively on the stock row: the
          // EARLIEST expiry among batches CURRENTLY in stock wins — a stale
          // expiry left on an emptied row must NOT poison the fresh batch,
          // so the pre-increment quantity decides whether the old value counts.
          let batchExpiry: Date | null = null;
          if (recipe.shelfLifeMonths != null && recipe.shelfLifeMonths > 0) {
            batchExpiry = new Date();
            const day = batchExpiry.getDate();
            batchExpiry.setMonth(batchExpiry.getMonth() + recipe.shelfLifeMonths);
            // setMonth overflows short months (Jan 31 + 1 → Mar 3) — clamp to
            // the last day of the intended month (food expiry must not gain days).
            if (batchExpiry.getDate() < day) batchExpiry.setDate(0);
          }
          const stampExpiry = async (locationId: string) => {
            if (!batchExpiry) return;
            const rowBefore = await tx.recipeStock.findUnique({
              where: { locationId_recipeId: { locationId, recipeId: recipe.id } },
              select: { quantity: true, expiryDate: true },
            });
            // The row was already incremented by the surrounding upsert, so
            // "had stock before this batch" = quantity > actualYield… we read
            // AFTER the upsert; previous quantity = current − this batch.
            const prevQuantity = Number(rowBefore?.quantity ?? 0) - actualYield;
            const current = prevQuantity > 0 ? (rowBefore?.expiryDate ?? null) : null;
            await tx.recipeStock.update({
              where: { locationId_recipeId: { locationId, recipeId: recipe.id } },
              data: { expiryDate: current && current < batchExpiry ? current : batchExpiry },
            });
          };

          // Produce where the task was made.
          await tx.recipeStock.upsert({
            where: {
              locationId_recipeId: { locationId: productionLocationId, recipeId: recipe.id },
            },
            update: { quantity: { increment: actualYield } },
            create: {
              locationId: productionLocationId,
              recipeId: recipe.id,
              quantity: actualYield,
              reservedCount: 0,
            },
          });
          await stampExpiry(productionLocationId);

          await tx.stockMovement.create({
            data: {
              recipeId: recipe.id,
              locationId: productionLocationId,
              movementType: 'INTRARE_PRODUCTIE',
              quantity: actualYield,
              unit: recipe.unit,
              taskId,
              performedById: userId,
              referenceNote: `Producție din taskul „${Number(task.targetQuantity)} ${task.recipe.name}”`,
            },
          });

          // Finalized to a different location → move the goods there and record a
          // transfer (foaie de drum) for the transport.
          if (destinationLocationId && destinationLocationId !== productionLocationId) {
            const prodStock = await tx.recipeStock.findUnique({
              where: {
                locationId_recipeId: { locationId: productionLocationId, recipeId: recipe.id },
              },
            });
            await tx.recipeStock.update({
              where: {
                locationId_recipeId: { locationId: productionLocationId, recipeId: recipe.id },
              },
              data: {
                quantity: Math.max(0, Number(prodStock?.quantity ?? 0) - actualYield),
              },
            });
            await tx.recipeStock.upsert({
              where: {
                locationId_recipeId: { locationId: destinationLocationId, recipeId: recipe.id },
              },
              update: { quantity: { increment: actualYield } },
              create: {
                locationId: destinationLocationId,
                recipeId: recipe.id,
                quantity: actualYield,
                reservedCount: 0,
              },
            });
            await stampExpiry(destinationLocationId);

            await tx.stockTransfer.create({
              data: {
                fromLocationId: productionLocationId,
                toLocationId: destinationLocationId,
                status: 'FINALIZAT',
                completedAt: new Date(),
                createdById: userId,
                notes: `Transfer automat: finalizare task "${Number(task.targetQuantity)} ${task.recipe.name}" la altă locație`,
                items: {
                  create: [
                    { recipeId: recipe.id, quantity: actualYield, unit: recipe.unit as UnitType },
                  ],
                },
              },
            });
          }

          await this.syncRecipeAggregate(tx, recipe.id);

          // Per-batch lot for the finished goods (stoc diferențiat pe șarje).
          // Created at the location the stock actually LANDS in, so the
          // internal production→destination move above needs no FIFO pass —
          // for the fresh batch it is a net zero at the production location.
          // The aggregate RecipeStock stays authoritative; lots only refine it.
          if (actualYield > 0 && destinationLocationId) {
            const producedAt = new Date();
            // ClickUp "Stoc diferentiat nume": human-readable lot ids —
            // ddMMyyyy-<Nume produs> N, where N counts the batches of this
            // product made the same ROMANIA calendar day (10082026-Fistic 1,
            // 10082026-Fistic 2), not the server process's UTC day.
            //
            // pg_advisory_xact_lock serializes concurrent finalizes of the SAME
            // recipe within this transaction so two overlapping requests can't
            // both read todayCount=0 and both mint "...1" — the lock is released
            // automatically at commit/rollback.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${recipe.id}))`;
            const dayStart = bucharestDayStartUtc(producedAt);
            const todayCount = await tx.recipeStockLot.count({
              where: { recipeId: recipe.id, producedAt: { gte: dayStart } },
            });
            await tx.recipeStockLot.create({
              data: {
                recipeId: recipe.id,
                locationId: destinationLocationId,
                lotNumber: buildLotNumber(recipe.name, producedAt, todayCount),
                quantity: actualYield,
                remainingQuantity: actualYield,
                expiryDate: batchExpiry,
                taskId,
                producedAt,
              },
            });
          }

          // Byproducts: what this production leaves behind (ex. resturi de
          // blat). Credited at the PRODUCTION location — scraps stay in the
          // lab, they don't follow the finished goods to the destination.
          // The operator-reported quantities (dto.byproducts) win when sent —
          // trimmings vary per batch and are NOT derivable from the recipe.
          // Legacy fallback (field omitted): declared yield × batch multiple,
          // for the produced recipe's own byproducts only (a subtask recipe's
          // byproduct has no meaningful scale on the parent task).
          for (const bp of byproducts) {
            const bpQty = byproductQtyById
              ? (byproductQtyById.get(bp.id) ?? 0)
              : bp.sourceRecipeId === task.recipeId
                ? Number(bp.yieldQuantity) * Number(task.scaleFactor)
                : 0;
            if (!(bpQty > 0)) continue;

            // Same conservative shelf-life stamping as the main product, from
            // the byproduct's own shelfLifeMonths (month-overflow clamped).
            let bpExpiry: Date | null = null;
            if (bp.shelfLifeMonths != null && bp.shelfLifeMonths > 0) {
              bpExpiry = new Date();
              const day = bpExpiry.getDate();
              bpExpiry.setMonth(bpExpiry.getMonth() + bp.shelfLifeMonths);
              if (bpExpiry.getDate() < day) bpExpiry.setDate(0);
            }

            const bpRow = await tx.recipeStock.upsert({
              where: {
                locationId_recipeId: { locationId: productionLocationId, recipeId: bp.id },
              },
              update: { quantity: { increment: bpQty } },
              create: {
                locationId: productionLocationId,
                recipeId: bp.id,
                quantity: bpQty,
                reservedCount: 0,
              },
            });
            if (bpExpiry) {
              // upsert returned the post-increment row: previous quantity =
              // current − this batch; a stale expiry on an emptied row must
              // not poison the fresh batch.
              const prevQuantity = Number(bpRow.quantity) - bpQty;
              const current = prevQuantity > 0 ? bpRow.expiryDate : null;
              await tx.recipeStock.update({
                where: {
                  locationId_recipeId: { locationId: productionLocationId, recipeId: bp.id },
                },
                data: { expiryDate: current && current < bpExpiry ? current : bpExpiry },
              });
            }

            await tx.stockMovement.create({
              data: {
                recipeId: bp.id,
                locationId: productionLocationId,
                movementType: 'INTRARE_PRODUCTIE',
                quantity: bpQty,
                unit: bp.unit,
                taskId,
                performedById: userId,
                referenceNote: `Rest din producția „${task.recipe.name}”`,
              },
            });

            await this.syncRecipeAggregate(tx, bp.id);
            creditedByproductIds.push(bp.id);
          }
        }
      },
      { timeout: 15000 },
    );

    // Byproduct stock updates — same event the reservation/fulfillment paths
    // emit, so clients refresh the byproduct's stock live.
    for (const bpId of creditedByproductIds) {
      const bpRecipe = await this.prisma.recipe.findUnique({ where: { id: bpId } });
      if (bpRecipe) {
        this.ws.emitStockUpdate({
          materialId: bpRecipe.id,
          materialTitle: bpRecipe.name,
          newStockCount: Number(bpRecipe.stockCount),
          movementType: MovementType.IN,
        });
      }
    }

    // Emit WebSocket events after successful transaction
    for (const reservation of reservations) {
      const materialId = reservation.rawMaterialId ?? reservation.consumableId;
      if (!materialId) continue;

      if (reservation.rawMaterialId) {
        const material = await this.prisma.rawMaterial.findUnique({
          where: { id: materialId },
        });
        if (material) {
          const stockUpdate: StockUpdateDto = {
            materialId: material.id,
            materialTitle: material.title,
            newStockCount: Number(material.stockCount),
            movementType: MovementType.OUT,
          };
          this.ws.emitStockUpdate(stockUpdate);

          if (Number(material.stockCount) <= Number(material.minimumStock)) {
            this.ws.emitLowStockAlert(stockUpdate);
          }
        }
      } else if (reservation.consumableId) {
        const consumable = await this.prisma.consumable.findUnique({
          where: { id: materialId },
        });
        if (consumable) {
          const stockUpdate: StockUpdateDto = {
            materialId: consumable.id,
            materialTitle: consumable.title,
            newStockCount: Number(consumable.stockCount),
            movementType: MovementType.OUT,
          };
          this.ws.emitStockUpdate(stockUpdate);

          if (Number(consumable.stockCount) <= Number(consumable.minimumStock)) {
            this.ws.emitLowStockAlert(stockUpdate);
          }
        }
      }
    }

    this.logger.log(`Fulfilled ${reservations.length} reservations for task "${taskId}"`);
  }

  /**
   * Validate finalize byproduct inputs against the byproducts actually
   * declared for the task's recipe (and its subtasks' recipes). Called by the
   * tasks transition BEFORE the status update so a bad payload fails the
   * request instead of leaving a FINALIZAT task with unfulfilled stock.
   * Same rule `fulfillForTask` re-checks defensively.
   */
  async validateByproductsForTask(taskId: string, inputs: ByproductInput[]): Promise<void> {
    if (inputs.length === 0) return;

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { recipeId: true, subtasks: { select: { recipeId: true } } },
    });
    if (!task) {
      throw new NotFoundException(`Task with ID "${taskId}" not found`);
    }

    const sourceIds = [task.recipeId, ...task.subtasks.map((s) => s.recipeId)];
    const declared = await this.prisma.recipe.findMany({
      where: {
        id: { in: inputs.map((i) => i.recipeId) },
        sourceRecipeId: { in: sourceIds },
        isByproduct: true,
        isArchived: false,
      },
      select: { id: true },
    });
    const declaredIds = new Set(declared.map((d) => d.id));
    const unknown = inputs.filter((i) => !declaredIds.has(i.recipeId));
    if (unknown.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: 'STOCK_004',
        message: `Rețetele [${unknown.map((u) => u.recipeId).join(', ')}] nu sunt byproducturi active ale rețetei produse`,
      });
    }
  }

  /**
   * Release reservations when task is cancelled.
   * Gives back reserved stock and marks reservations as released.
   *
   * Steps:
   * 1. Find all unfulfilled/unreleased reservations for this task
   * 2. Lock each material row
   * 3. Decrement reservedCount by reserved quantity (giving it back)
   * 4. Mark reservations as released
   * 5. Create StockMovement rows (type: ELIBERARE)
   */
  async releaseForTask(taskId: string, userId: string): Promise<void> {
    const reservations = await this.prisma.stockReservation.findMany({
      where: {
        taskId,
        isFulfilled: false,
        isReleased: false,
      },
    });

    if (reservations.length === 0) {
      this.logger.log(`No unreleased reservations found for task "${taskId}"`);
      return;
    }

    await this.prisma.$transaction(
      async (tx) => {
        const productionLocationId = await this.resolveLocationId(null);

        for (const reservation of reservations) {
          const quantity = Number(reservation.quantityReserved);
          const locId = reservation.locationId ?? productionLocationId;

          if (reservation.rawMaterialId) {
            if (locId) {
              const [stock] = await tx.$queryRaw<MaterialStockRow[]>`
                SELECT * FROM "MaterialStock"
                WHERE "locationId" = ${locId}::uuid AND "rawMaterialId" = ${reservation.rawMaterialId}::uuid
                FOR UPDATE
              `;
              if (stock) {
                await tx.materialStock.update({
                  where: {
                    locationId_rawMaterialId: {
                      locationId: locId,
                      rawMaterialId: reservation.rawMaterialId,
                    },
                  },
                  data: { reservedCount: Math.max(0, Number(stock.reservedCount) - quantity) },
                });
              }
              await this.syncRawMaterialAggregate(tx, reservation.rawMaterialId);
            }

            await tx.stockMovement.create({
              data: {
                rawMaterialId: reservation.rawMaterialId,
                locationId: locId,
                movementType: 'ELIBERARE',
                quantity,
                unit: reservation.unit,
                taskId,
                performedById: userId,
                referenceNote: `Released reservation for cancelled task`,
              },
            });
          } else if (reservation.consumableId) {
            const [consumable] = await tx.$queryRaw<ConsumableRow[]>`
              SELECT * FROM "Consumable" WHERE "id" = ${reservation.consumableId}::uuid FOR UPDATE
            `;

            if (consumable) {
              const newReservedCount = Number(consumable.reservedCount) - quantity;
              await tx.consumable.update({
                where: { id: reservation.consumableId },
                data: { reservedCount: Math.max(0, newReservedCount) },
              });
            }

            await tx.stockMovement.create({
              data: {
                consumableId: reservation.consumableId,
                locationId: locId,
                movementType: 'ELIBERARE',
                quantity,
                unit: reservation.unit,
                taskId,
                performedById: userId,
                referenceNote: `Released reservation for cancelled task`,
              },
            });
          } else if (reservation.recipeId) {
            // Stocked semipreparate — release from the location's RecipeStock
            if (locId) {
              const [stock] = await tx.$queryRaw<RecipeStockRow[]>`
                SELECT * FROM "RecipeStock"
                WHERE "locationId" = ${locId}::uuid AND "recipeId" = ${reservation.recipeId}::uuid
                FOR UPDATE
              `;
              if (stock) {
                await tx.recipeStock.update({
                  where: {
                    locationId_recipeId: { locationId: locId, recipeId: reservation.recipeId },
                  },
                  data: { reservedCount: Math.max(0, Number(stock.reservedCount) - quantity) },
                });
              }
              await this.syncRecipeAggregate(tx, reservation.recipeId);
            }

            await tx.stockMovement.create({
              data: {
                recipeId: reservation.recipeId,
                locationId: locId,
                movementType: 'ELIBERARE',
                quantity,
                unit: reservation.unit,
                taskId,
                performedById: userId,
                referenceNote: `Released reservation for cancelled task`,
              },
            });
          }

          // Mark reservation as released
          await tx.stockReservation.update({
            where: { id: reservation.id },
            data: { isReleased: true },
          });
        }
      },
      { timeout: 15000 },
    );

    // Emit WebSocket events after successful transaction
    for (const reservation of reservations) {
      const materialId = reservation.rawMaterialId ?? reservation.consumableId;
      if (!materialId) continue;

      if (reservation.rawMaterialId) {
        const material = await this.prisma.rawMaterial.findUnique({
          where: { id: materialId },
        });
        if (material) {
          const stockUpdate: StockUpdateDto = {
            materialId: material.id,
            materialTitle: material.title,
            newStockCount: Number(material.stockCount),
            movementType: MovementType.ADJUSTMENT,
          };
          this.ws.emitStockUpdate(stockUpdate);
        }
      } else if (reservation.consumableId) {
        const consumable = await this.prisma.consumable.findUnique({
          where: { id: materialId },
        });
        if (consumable) {
          const stockUpdate: StockUpdateDto = {
            materialId: consumable.id,
            materialTitle: consumable.title,
            newStockCount: Number(consumable.stockCount),
            movementType: MovementType.ADJUSTMENT,
          };
          this.ws.emitStockUpdate(stockUpdate);
        }
      }
    }

    this.logger.log(`Released ${reservations.length} reservations for task "${taskId}"`);
  }

  /**
   * Dry-run check: can we reserve all materials for this task?
   * Does NOT lock rows or modify data. Used for notification purposes.
   */
  async canReserveForTask(taskId: string): Promise<boolean> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { recipe: true },
    });

    if (!task) return false;

    const requirements = await this.previewRequirements(
      task.recipeId,
      Number(task.targetQuantity),
      task.targetUnit,
      await this.resolveLocationId(task.locationId),
    );

    return requirements.every((r) => r.sufficient);
  }

  /**
   * Read-only preview of the materials a task will consume, scaled to its
   * target quantity, against the task's production location. Mirrors the
   * resolution used by `reserveForTask` so the displayed `needed` matches what
   * actually gets deducted. Used by the client to show "Materiale necesare".
   */
  async previewForTask(taskId: string): Promise<MaterialRequirement[]> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { recipe: true },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID "${taskId}" not found`);
    }

    return this.previewRequirements(
      task.recipeId,
      Number(task.targetQuantity),
      task.targetUnit,
      await this.resolveLocationId(task.locationId),
    );
  }

  /**
   * Read-only preview of the materials a recipe will consume at a given target
   * quantity and location, before any task exists. Used by the task-create form
   * to recompute stock live as the user edits the quantity/location and to warn
   * on insufficient stock. Same resolution as `reserveForTask`, so `needed`
   * matches the future deduction. Stock is read from the given location (falls
   * back to the default location); 0 when no location/stock row exists.
   */
  async previewRequirements(
    recipeId: string,
    targetQuantity: number,
    targetUnit: UnitType,
    locationId?: string | null,
  ): Promise<MaterialRequirement[]> {
    const resolved = await this.recipeResolution.resolveTree(recipeId, targetQuantity, targetUnit);
    const locId = (await this.resolveLocationId(locationId ?? null)) ?? null;

    const requirements: MaterialRequirement[] = [];

    // Raw-material ingredients — stock from the location's MaterialStock
    for (const ingredient of resolved.resolvedIngredients) {
      const material = await this.prisma.rawMaterial.findUnique({
        where: { id: ingredient.rawMaterialId },
      });
      if (!material) continue;

      const stock = locId
        ? await this.prisma.materialStock.findUnique({
            where: {
              locationId_rawMaterialId: {
                locationId: locId,
                rawMaterialId: ingredient.rawMaterialId,
              },
            },
          })
        : null;

      const currentStock = stock ? Number(stock.quantity) : 0;
      const available = currentStock - (stock ? Number(stock.reservedCount) : 0);
      const needed = ingredient.quantity;

      requirements.push({
        rawMaterialId: material.id,
        title: material.title,
        unit: ingredient.unit,
        needed,
        currentStock,
        available,
        stockAfter: currentStock - needed,
        sufficient: available >= needed,
      });
    }

    // Stocked semipreparate — stock from the location's RecipeStock
    for (const semi of resolved.stockedSemipreparate) {
      const recipe = await this.prisma.recipe.findUnique({
        where: { id: semi.recipeId },
      });
      if (!recipe) continue;

      const stock = locId
        ? await this.prisma.recipeStock.findUnique({
            where: { locationId_recipeId: { locationId: locId, recipeId: semi.recipeId } },
          })
        : null;

      const currentStock = stock ? Number(stock.quantity) : 0;
      const available = currentStock - (stock ? Number(stock.reservedCount) : 0);
      const needed = semi.quantity;

      requirements.push({
        recipeId: recipe.id,
        title: recipe.name,
        unit: semi.unit,
        needed,
        currentStock,
        available,
        stockAfter: currentStock - needed,
        sufficient: available >= needed,
      });
    }

    return requirements;
  }

  /**
   * FIFO lot attribution for a production consumption: walk the material's
   * intake lots oldest-first (locked FOR UPDATE), decrement each lot's
   * remainingQuantity and record a LotConsumption row per lot touched, so the
   * traceability sheet can list the exact lots (multiple intakes on the same
   * day stay distinguishable). Quantities are in the material's stock unit on
   * both sides (reservations and lots are recorded in it).
   *
   * Old stock without lot records leaves a remainder — it simply stays
   * unattributed; traceability falls back to the material's legacy fields.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async consumeLotsFifo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    taskId: string,
    rawMaterialId: string,
    quantity: number,
    unit: UnitType,
  ): Promise<void> {
    const lots = await tx.$queryRaw<StockLotRow[]>`
      SELECT "id", "rawMaterialId", "remainingQuantity" FROM "StockLot"
      WHERE "rawMaterialId" = ${rawMaterialId}::uuid AND "remainingQuantity" > 0
      -- Held lots (onHold) are consumed LAST — kept for a specific purpose;
      -- they only serve as fallback when every other lot is exhausted.
      ORDER BY "onHold" ASC, "receivedAt" ASC, "createdAt" ASC
      FOR UPDATE
    `;

    let left = quantity;
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(Number(lot.remainingQuantity), left);
      if (take <= 0) continue;

      await tx.stockLot.update({
        where: { id: lot.id },
        data: { remainingQuantity: { decrement: take } },
      });
      await tx.lotConsumption.create({
        data: { taskId, stockLotId: lot.id, rawMaterialId, quantity: take, unit },
      });
      left -= take;
    }
  }

  /**
   * Compute the material status based on the new stock count.
   * Does not change status if material is DISCONTINUED.
   */
  private computeStatus(
    newStockCount: number,
    minimumStock: number,
    currentStatus: MaterialStatus,
  ): MaterialStatus {
    if (currentStatus === MaterialStatus.DISCONTINUED) {
      return MaterialStatus.DISCONTINUED;
    }
    if (newStockCount <= 0) {
      return MaterialStatus.OUT_OF_STOCK;
    }
    if (newStockCount <= minimumStock) {
      return MaterialStatus.LOW_STOCK;
    }
    return MaterialStatus.ACTIVE;
  }
}
