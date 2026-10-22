import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, SystemLogLevel } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { BackupsService } from '@/modules/backups/backups.service';
import { SystemLogsService } from '@/modules/system-logs';
import {
  RESET_CATEGORIES,
  RESET_CONFIRMATION,
  ResetCategoryKey,
  ResetTable,
  categoryByKey,
  resolveCategories,
} from './data-reset.categories';
import { DataResetPreviewDto, DataResetResultDto } from './dto';

interface ResetDelegate {
  count(args?: unknown): Promise<number>;
  deleteMany(args?: unknown): Promise<{ count: number }>;
}

/**
 * "Resetare date" (Setări → Resetare date, admin only): selectively empties
 * operational tables of the CURRENT organization. Safety net: a manual
 * snapshot ("Înainte de resetare") is taken first, so the org can be
 * restored from Backup & Restaurare if the reset was a mistake.
 */
@Injectable()
export class DataResetService {
  private readonly logger = new Logger(DataResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly backups: BackupsService,
    private readonly systemLogs: SystemLogsService,
  ) {}

  // ------------------------------------------------------------------
  // Preview — what each category would delete
  // ------------------------------------------------------------------

  async preview(organizationId: string): Promise<DataResetPreviewDto> {
    const categories = await Promise.all(
      RESET_CATEGORIES.map(async (cat) => {
        const counts: Record<string, number> = {};
        for (const t of cat.tables) {
          const n = await this.delegate(this.prisma, t).count({ where: t.where(organizationId) });
          counts[t.model] = (counts[t.model] ?? 0) + n;
        }
        return {
          key: cat.key,
          label: cat.label,
          description: cat.description,
          requires: [...cat.requires],
          danger: cat.danger,
          counts,
          total: Object.values(counts).reduce((s, n) => s + n, 0),
        };
      }),
    );
    return { categories };
  }

  // ------------------------------------------------------------------
  // Run
  // ------------------------------------------------------------------

  async run(
    organizationId: string,
    actor: { userId: string; email?: string | null },
    selected: ResetCategoryKey[],
    confirm: string,
  ): Promise<DataResetResultDto> {
    if (confirm !== RESET_CONFIRMATION) {
      throw new BadRequestException(
        `Confirmare invalidă — trimite confirm: '${RESET_CONFIRMATION}' pentru a reseta`,
      );
    }
    const categories = resolveCategories(selected);
    if (categories.length === 0) {
      throw new BadRequestException('Alege cel puțin o categorie de date');
    }

    // 1. Safety snapshot (own org lock inside) — never skip it.
    const snapshot = await this.backups.createSnapshot(organizationId, {
      label: `Înainte de resetare (${categories.map((k) => categoryByKey(k).label).join(', ')})`,
      auto: false,
      createdById: actor.userId,
    });

    // 2. Delete, one transaction, children first inside every category.
    const deleted = await this.backups.withOrgLock(organizationId, () =>
      this.prisma.$transaction(
        async (tx) => {
          const out: Record<string, number> = {};
          for (const key of categories) {
            for (const t of categoryByKey(key).tables) {
              const { count } = await this.delegate(tx, t).deleteMany({
                where: t.where(organizationId),
              });
              out[t.model] = (out[t.model] ?? 0) + count;
            }
          }
          await this.resetCounters(tx as PrismaService, organizationId, categories);
          return out;
        },
        { timeout: 10 * 60_000, maxWait: 30_000 },
      ),
    );

    const total = Object.values(deleted).reduce((s, n) => s + n, 0);
    this.logger.warn(
      `Org ${organizationId} data reset by ${actor.userId}: ${categories.join(',')} → ${total} rows`,
    );
    this.systemLogs.log({
      category: 'SYSTEM',
      action: 'data.reset',
      level: SystemLogLevel.WARN,
      message: `Resetare date: ${categories.map((k) => categoryByKey(k).label).join(', ')} (${total} înregistrări șterse)`,
      organizationId,
      userId: actor.userId,
      userEmail: actor.email ?? null,
      metadata: { categories, deleted, snapshotId: snapshot.id },
    });

    return { categories, snapshotId: snapshot.id, deleted, total };
  }

  /**
   * Denormalized stock counters live on the item rows (kept by STOCK/TASKS
   * resets), so zero them to match the now-empty movement/lot/reservation tables.
   */
  private async resetCounters(
    tx: PrismaService,
    organizationId: string,
    categories: readonly ResetCategoryKey[],
  ): Promise<void> {
    const zero = new Prisma.Decimal(0);
    if (categories.includes('STOCK')) {
      await tx.rawMaterial.updateMany({
        where: { organizationId },
        data: { stockCount: zero, openedCount: zero, orderedCount: zero, reservedCount: zero },
      });
      await tx.consumable.updateMany({
        where: { organizationId },
        data: { stockCount: zero, orderedCount: zero, reservedCount: zero },
      });
      await tx.recipe.updateMany({
        where: { organizationId },
        data: { stockCount: 0, reservedCount: 0 },
      });
    } else if (categories.includes('TASKS')) {
      // Reservations are gone with the tasks → nothing is reserved anymore.
      await tx.rawMaterial.updateMany({ where: { organizationId }, data: { reservedCount: zero } });
      await tx.consumable.updateMany({ where: { organizationId }, data: { reservedCount: zero } });
      await tx.recipe.updateMany({ where: { organizationId }, data: { reservedCount: 0 } });
      await tx.materialStock.updateMany({
        where: { organizationId },
        data: { reservedCount: zero },
      });
      await tx.recipeStock.updateMany({
        where: { location: { organizationId } },
        data: { reservedCount: zero },
      });
    }
  }

  private delegate(client: unknown, t: ResetTable): ResetDelegate {
    const found = (client as Record<string, ResetDelegate | undefined>)[t.delegate];
    if (!found)
      throw new Error(`Unknown Prisma delegate "${t.delegate}" — reset registry out of sync`);
    return found;
  }
}
