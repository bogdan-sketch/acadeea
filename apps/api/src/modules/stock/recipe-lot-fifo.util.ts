import { Prisma } from '@prisma/client';

interface RecipeLotRow {
  id: string;
  remainingQuantity: Prisma.Decimal;
}

/**
 * FIFO consumption of produced-goods lots (RecipeStockLot) for a recipe at a
 * location. Called AFTER the aggregate RecipeStock.quantity decrement, from
 * every place that decrements it (production consumption of semipreparate,
 * transfers, manual adjustments). Lots are walked earliest-expiry first (null
 * expiry last), then oldest production first; each lot's remainingQuantity is
 * decremented until the consumed quantity is covered. Emptied lots are kept
 * (remaining 0) for traceability.
 *
 * Pre-existing stock without lot rows leaves a remainder — it simply stays
 * unattributed, no error.
 *
 * `tx` is a Prisma client or transaction client (typed loosely, same pattern
 * as the raw-material FIFO in stock-reservation.service.ts).
 */
export async function consumeRecipeLotsFifo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  recipeId: string,
  locationId: string,
  quantity: number,
): Promise<void> {
  if (!(quantity > 0)) return;

  const lots = await tx.$queryRaw<RecipeLotRow[]>`
    SELECT "id", "remainingQuantity" FROM "RecipeStockLot"
    WHERE "recipeId" = ${recipeId}::uuid
      AND "locationId" = ${locationId}::uuid
      AND "remainingQuantity" > 0
    ORDER BY "expiryDate" ASC NULLS LAST, "producedAt" ASC
    FOR UPDATE
  `;

  let left = quantity;
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(Number(lot.remainingQuantity), left);
    if (take <= 0) continue;

    await tx.recipeStockLot.update({
      where: { id: lot.id },
      data: { remainingQuantity: { decrement: take } },
    });
    left -= take;
  }
}
