import { Injectable } from '@nestjs/common';
import { OrderStatus, TaskStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { PrismaService } from '@/prisma/prisma.service';
import { tenantOrgFilter } from '@/prisma/tenant-context';
import {
  ProductionAnalyticsDto,
  StockAnalyticsDto,
  OrderAnalyticsDto,
  UserProductivityDto,
  AnalyticsSummaryDto,
  ConsumedMaterialDto,
  PopularProductDto,
} from './dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // Production Analytics
  // ==========================================================================

  async getProductionAnalytics(from?: string, to?: string): Promise<ProductionAnalyticsDto> {
    const dateFrom = from
      ? new Date(from)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const dateTo = to ? new Date(to) : new Date();

    const dateFilter = { gte: dateFrom, lte: dateTo };

    const [completedCount, cancelledCount, completedTasks, yieldRecords] = await Promise.all([
      this.prisma.task.count({
        where: { status: TaskStatus.FINALIZAT, completedAt: dateFilter },
      }),
      this.prisma.task.count({
        where: { status: TaskStatus.ANULAT, cancelledAt: dateFilter },
      }),
      this.prisma.task.findMany({
        where: {
          status: TaskStatus.FINALIZAT,
          completedAt: dateFilter,
          startedAt: { not: null },
        },
        select: { startedAt: true, completedAt: true },
      }),
      this.prisma.recipeYieldHistory.findMany({
        // RecipeYieldHistory has no organizationId — scope through the recipe.
        where: { recordedAt: dateFilter, recipe: tenantOrgFilter() },
        select: { variancePercent: true },
      }),
    ]);

    // Average completion time in hours
    let averageCompletionHours: number | null = null;
    if (completedTasks.length > 0) {
      const totalHours = completedTasks.reduce((sum, t) => {
        if (t.startedAt && t.completedAt) {
          const diffMs = t.completedAt.getTime() - t.startedAt.getTime();
          return sum + diffMs / (1000 * 60 * 60);
        }
        return sum;
      }, 0);
      averageCompletionHours = Math.round((totalHours / completedTasks.length) * 100) / 100;
    }

    // Average yield variance
    let yieldVarianceAvg: number | null = null;
    if (yieldRecords.length > 0) {
      const totalVariance = yieldRecords.reduce((sum, r) => {
        const val =
          r.variancePercent instanceof Decimal
            ? r.variancePercent.toNumber()
            : Number(r.variancePercent);
        return sum + val;
      }, 0);
      yieldVarianceAvg = Math.round((totalVariance / yieldRecords.length) * 100) / 100;
    }

    return new ProductionAnalyticsDto({
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      totalTasksCompleted: completedCount,
      totalTasksCancelled: cancelledCount,
      averageCompletionHours,
      yieldVarianceAvg,
    });
  }

  // ==========================================================================
  // Stock Analytics
  // ==========================================================================

  async getStockAnalytics(): Promise<StockAnalyticsDto> {
    const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30));

    const [recentMovements, lowStockCount, totalMovements] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          movementType: 'IESIRE_PRODUCTIE',
          rawMaterialId: { not: null },
        },
        include: {
          rawMaterial: { select: { title: true, unit: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.rawMaterial.count({
        where: {
          OR: [{ status: 'LOW_STOCK' }, { status: 'OUT_OF_STOCK' }],
        },
      }),
      this.prisma.stockMovement.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    // Aggregate consumption per raw material
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const consumptionMap = new Map<string, { name: string; totalConsumed: number; unit: string }>();
    for (const mv of recentMovements) {
      if (!mv.rawMaterialId || !mv.rawMaterial) continue;
      const key = mv.rawMaterialId;
      const qty = mv.quantity instanceof Decimal ? mv.quantity.toNumber() : Number(mv.quantity);
      const existing = consumptionMap.get(key);
      if (existing) {
        existing.totalConsumed += qty;
      } else {
        consumptionMap.set(key, {
          name: mv.rawMaterial.title,
          totalConsumed: qty,
          unit: mv.rawMaterial.unit,
        });
      }
    }

    const topConsumedMaterials: ConsumedMaterialDto[] = Array.from(consumptionMap.values())
      .sort((a, b) => b.totalConsumed - a.totalConsumed)
      .slice(0, 10)
      .map(
        (m) =>
          new ConsumedMaterialDto({
            name: m.name,
            totalConsumed: Math.round(m.totalConsumed * 100) / 100,
            unit: m.unit,
          }),
      );

    return new StockAnalyticsDto({
      topConsumedMaterials,
      lowStockCount,
      totalMovements,
    });
  }

  // ==========================================================================
  // Order Analytics
  // ==========================================================================

  async getOrderAnalytics(from?: string, to?: string): Promise<OrderAnalyticsDto> {
    const dateFrom = from
      ? new Date(from)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const dateTo = to ? new Date(to) : new Date();

    const dateFilter = { gte: dateFrom, lte: dateTo };

    const [totalOrders, statusCounts, deliveredOrders, orderItems] = await Promise.all([
      this.prisma.order.count({
        where: { createdAt: dateFilter },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: dateFilter },
        _count: { id: true },
      }),
      this.prisma.order.findMany({
        where: {
          createdAt: dateFilter,
          status: OrderStatus.LIVRATA,
        },
        select: { dueDate: true, completedAt: true },
      }),
      this.prisma.orderItem.findMany({
        // OrderItem has no organizationId — scope through the order.
        where: { order: { createdAt: dateFilter, ...tenantOrgFilter() } },
        include: { recipe: { select: { name: true } } },
      }),
    ]);

    // Orders by status
    const ordersByStatus: Record<string, number> = {};
    for (const status of Object.values(OrderStatus)) {
      ordersByStatus[status] = 0;
    }
    for (const row of statusCounts) {
      ordersByStatus[row.status] = row._count.id;
    }

    // On-time delivery rate
    let onTimeRate: number | null = null;
    if (deliveredOrders.length > 0) {
      const onTimeCount = deliveredOrders.filter((o) => {
        if (!o.dueDate || !o.completedAt) return true; // no due date = considered on-time
        return o.completedAt <= o.dueDate;
      }).length;
      onTimeRate = Math.round((onTimeCount / deliveredOrders.length) * 10000) / 100;
    }

    // Popular products
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productMap = new Map<string, { name: string; quantity: number }>();
    for (const item of orderItems) {
      // Label-only items (unmapped external products) have no recipe to rank.
      if (!item.recipeId || !item.recipe) continue;
      const key = item.recipeId;
      const qty =
        item.quantity instanceof Decimal ? item.quantity.toNumber() : Number(item.quantity);
      const existing = productMap.get(key);
      if (existing) {
        existing.quantity += qty;
      } else {
        productMap.set(key, { name: item.recipe.name, quantity: qty });
      }
    }

    const popularProducts: PopularProductDto[] = Array.from(productMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)
      .map(
        (p) =>
          new PopularProductDto({
            name: p.name,
            quantity: Math.round(p.quantity * 100) / 100,
          }),
      );

    return new OrderAnalyticsDto({
      totalOrders,
      ordersByStatus,
      onTimeRate,
      popularProducts,
    });
  }

  // ==========================================================================
  // User Productivity
  // ==========================================================================

  async getUserProductivity(): Promise<UserProductivityDto[]> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        assignedTasks: {
          where: { status: TaskStatus.FINALIZAT },
          select: { startedAt: true, completedAt: true },
        },
      },
    });

    return users
      .map((u) => {
        const completed = u.assignedTasks;
        let avgCompletionHours: number | null = null;

        if (completed.length > 0) {
          const tasksWithTime = completed.filter((t) => t.startedAt && t.completedAt);
          if (tasksWithTime.length > 0) {
            const totalHours = tasksWithTime.reduce((sum, t) => {
              const diffMs = (t.completedAt as Date).getTime() - (t.startedAt as Date).getTime();
              return sum + diffMs / (1000 * 60 * 60);
            }, 0);
            avgCompletionHours = Math.round((totalHours / tasksWithTime.length) * 100) / 100;
          }
        }

        return new UserProductivityDto({
          userId: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          tasksCompleted: completed.length,
          avgCompletionHours,
        });
      })
      .sort((a, b) => b.tasksCompleted - a.tasksCompleted);
  }

  // ==========================================================================
  // Summary (high-level KPIs for today)
  // ==========================================================================

  async getSummary(): Promise<AnalyticsSummaryDto> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [tasksCompletedToday, ordersToday, lowStockItems, activeUsers] = await Promise.all([
      this.prisma.task.count({
        where: {
          status: TaskStatus.FINALIZAT,
          completedAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
      }),
      this.prisma.rawMaterial.count({
        where: {
          OR: [{ status: 'LOW_STOCK' }, { status: 'OUT_OF_STOCK' }],
        },
      }),
      this.prisma.user.count({
        where: { isActive: true },
      }),
    ]);

    return new AnalyticsSummaryDto({
      tasksCompletedToday,
      ordersToday,
      lowStockItems,
      activeUsers,
    });
  }
}
