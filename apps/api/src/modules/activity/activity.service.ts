import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import { tenantOrgFilter } from '@/prisma/tenant-context';
import { PaginatedDto } from '@/common/dto';
import { ActivityQueryDto, ActivityResponseDto, ActivityType } from './dto';

interface RawActivity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: Date;
  metadata: Record<string, string | undefined>;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregate recent activity from TaskStatusHistory, StockMovement, and Orders.
   * Returns a unified, time-sorted feed.
   */
  async getRecentActivity(query: ActivityQueryDto): Promise<PaginatedDto<ActivityResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // Fetch from all three sources in parallel
    const [taskEvents, stockEvents, orderEvents] = await Promise.all([
      this.getTaskEvents(limit * 2),
      this.getStockEvents(limit),
      this.getOrderEvents(limit),
    ]);

    // Merge and sort by timestamp descending
    const allEvents = [...taskEvents, ...stockEvents, ...orderEvents].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );

    // Paginate
    const total = allEvents.length;
    const skip = (page - 1) * limit;
    const data = allEvents.slice(skip, skip + limit).map(
      (e) =>
        new ActivityResponseDto({
          id: e.id,
          type: e.type,
          title: e.title,
          description: e.description,
          timestamp: e.timestamp,
          metadata: e.metadata,
        }),
    );

    return new PaginatedDto(data, total, page, limit);
  }

  private async getTaskEvents(limit: number): Promise<RawActivity[]> {
    // TaskStatusHistory has no organizationId — scope through the task.
    const history = await this.prisma.taskStatusHistory.findMany({
      where: { task: tenantOrgFilter() },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        task: { select: { id: true, targetQuantity: true, recipe: { select: { name: true } } } },
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return history.map((h) => {
      const userName = `${h.changedBy.firstName} ${h.changedBy.lastName}`;
      const statusLabel = this.taskStatusLabel(h.toStatus);

      return {
        id: h.id,
        type: 'TASK_TRANSITION' as ActivityType,
        title: `${Number(h.task.targetQuantity)} ${h.task.recipe?.name ?? ''} — ${statusLabel}`,
        description: `${userName} a trecut taskul in ${statusLabel}`,
        timestamp: h.createdAt,
        metadata: {
          taskId: h.taskId,
          userId: h.changedBy.id,
          userName,
        },
      };
    });
  }

  private async getStockEvents(limit: number): Promise<RawActivity[]> {
    const movements = await this.prisma.stockMovement.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      where: {
        movementType: { in: ['INTRARE', 'AJUSTARE'] },
      },
      include: {
        rawMaterial: { select: { id: true, title: true } },
        consumable: { select: { id: true, title: true } },
        performedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return movements.map((m) => {
      const materialTitle = m.rawMaterial?.title ?? m.consumable?.title ?? 'Material';
      const materialId = m.rawMaterialId ?? m.consumableId ?? '';
      const userName = `${m.performedBy.firstName} ${m.performedBy.lastName}`;
      const typeLabel = m.movementType === 'INTRARE' ? 'intrare' : 'ajustare';

      return {
        id: m.id,
        type: 'STOCK_MOVEMENT' as ActivityType,
        title: `${materialTitle} — ${typeLabel}`,
        description: `${userName}: ${Number(m.quantity)} ${m.unit}`,
        timestamp: m.createdAt,
        metadata: {
          materialId,
          userId: m.performedBy.id,
          userName,
        },
      };
    });
  }

  private async getOrderEvents(limit: number): Promise<RawActivity[]> {
    const orders = await this.prisma.order.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return orders.map((o) => {
      const userName = `${o.createdBy.firstName} ${o.createdBy.lastName}`;

      return {
        id: o.id,
        type: 'ORDER_CREATED' as ActivityType,
        title: `Comanda ${o.orderNumber} creata`,
        description: `${userName} — ${o.deliveryPoint}`,
        timestamp: o.createdAt,
        metadata: {
          orderId: o.id,
          userId: o.createdBy.id,
          userName,
        },
      };
    });
  }

  private taskStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      DE_FACUT: 'de facut',
      BLOCAT: 'blocat',
      IN_LUCRU: 'in lucru',
      FINALIZAT: 'finalizat',
      ANULAT: 'anulat',
    };
    return labels[status] ?? status;
  }
}
