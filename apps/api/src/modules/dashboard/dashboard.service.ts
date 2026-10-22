import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, TaskStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { PrismaService } from '@/prisma/prisma.service';
import { currentOrgWhere } from '@/prisma/tenant-context';
import { DashboardStatsResponseDto } from './dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(locationId?: string): Promise<DashboardStatsResponseDto> {
    // Not awaited up front: the org lookup inside would serialize a round-trip
    // before the Promise.all batch.
    const orderFilterP = this.orderLocationFilter(locationId);

    const [
      taskCounts,
      orderCounts,
      lowStock,
      recentTasks,
      todayTasksDue,
      todayOrdersDue,
      todaySalesAmount,
      todayDeliveries,
      todayPickups,
    ] = await Promise.all([
      this.getTaskCounts(locationId),
      orderFilterP.then((f) => this.getOrderCounts(locationId, f)),
      this.getLowStock(locationId),
      this.getRecentTasks(locationId),
      this.getTodayTasksDue(locationId),
      orderFilterP.then((f) => this.getTodayOrdersDue(f)),
      orderFilterP.then((f) => this.getTodaySalesAmount(f)),
      orderFilterP.then((f) => this.getTodayDeliveries(f)),
      orderFilterP.then((f) => this.getTodayPickups(f)),
    ]);

    return {
      taskCounts,
      orderCounts,
      lowStockMaterials: lowStock.materials,
      recentTasks,
      todayTasksDue,
      todayOrdersDue,
      todaySalesAmount,
      todayDeliveries,
      todayPickups,
      lowStockCount: lowStock.lowStockCount,
      outOfStockCount: lowStock.outOfStockCount,
    };
  }

  /** Prisma where clause: user belongs to location via UserLocation */
  private userAtLocation(locationId: string): Prisma.UserWhereInput {
    return { userLocations: { some: { locationId } } };
  }

  /**
   * Task where clause scoped to the task's production location. Tasks without
   * a location (legacy rows, or created without picking one) fall back to the
   * old heuristic — assignee/creator membership — so they don't vanish from
   * every per-location view.
   */
  private taskLocationFilter(locationId?: string): Prisma.TaskWhereInput {
    if (!locationId) return {};
    const userFilter = this.userAtLocation(locationId);
    return {
      OR: [
        { locationId },
        { locationId: null, OR: [{ assignedTo: userFilter }, { createdBy: userFilter }] },
      ],
    };
  }

  /**
   * Order where clause scoped to location. Orders don't carry a generic
   * location: PICKUP orders match their `pickupLocationId`, DELIVERY orders
   * all leave from the organization's `defaultDeliveryLocationId` and count
   * toward that location. Orders that can't be located that way (pickup
   * without a pickup location, deliveries while no default is configured)
   * fall back to the old creator/assignee membership heuristic instead of
   * disappearing from every per-location view.
   */
  private async orderLocationFilter(locationId?: string): Promise<Prisma.OrderWhereInput> {
    if (!locationId) return {};
    const userFilter = this.userAtLocation(locationId);
    const byMembership: Prisma.OrderWhereInput[] = [
      { createdBy: userFilter },
      { assignedTo: userFilter },
    ];
    const or: Prisma.OrderWhereInput[] = [
      { fulfillmentType: 'PICKUP', pickupLocationId: locationId },
      { fulfillmentType: 'PICKUP', pickupLocationId: null, OR: byMembership },
    ];
    const org = await this.prisma.organization.findFirst({
      where: currentOrgWhere(),
      orderBy: { createdAt: 'asc' },
      select: { defaultDeliveryLocationId: true },
    });
    if (org?.defaultDeliveryLocationId === locationId) {
      or.push({ fulfillmentType: 'DELIVERY' });
    } else if (!org?.defaultDeliveryLocationId) {
      or.push({ fulfillmentType: 'DELIVERY', OR: byMembership });
    }
    return { OR: or };
  }

  private async getTaskCounts(locationId?: string): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const status of Object.values(TaskStatus)) {
      result[status] = 0;
    }

    if (locationId) {
      // groupBy doesn't support nested relation filters, use separate counts
      const counts = await Promise.all(
        Object.values(TaskStatus).map(async (status) => ({
          status,
          count: await this.prisma.task.count({
            where: { status, ...this.taskLocationFilter(locationId) },
          }),
        })),
      );
      for (const { status, count } of counts) {
        result[status] = count;
      }
    } else {
      const counts = await this.prisma.task.groupBy({
        by: ['status'],
        _count: { id: true },
      });
      for (const row of counts) {
        result[row.status] = row._count.id;
      }
    }

    return result;
  }

  private async getOrderCounts(
    locationId: string | undefined,
    orderFilter: Prisma.OrderWhereInput,
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const status of Object.values(OrderStatus)) {
      result[status] = 0;
    }

    if (locationId) {
      const counts = await Promise.all(
        Object.values(OrderStatus).map(async (status) => ({
          status,
          count: await this.prisma.order.count({
            where: { status, ...orderFilter },
          }),
        })),
      );
      for (const { status, count } of counts) {
        result[status] = count;
      }
    } else {
      const counts = await this.prisma.order.groupBy({
        by: ['status'],
        _count: { id: true },
      });
      for (const row of counts) {
        result[row.status] = row._count.id;
      }
    }

    return result;
  }

  private toNum(v: Decimal | number): number {
    return v instanceof Decimal ? v.toNumber() : Number(v);
  }

  /**
   * Low/out-of-stock alerts. Per-location: MaterialStock at that location vs
   * the material's minimum. Global ("Toate"): the union of materials low
   * overall (RawMaterial.status) and materials low at ANY location — so the
   * aggregate view never shows fewer alerts than a single location does.
   * Counts are uncapped; the materials list is truncated to 10 for display.
   */
  private async getLowStock(locationId?: string): Promise<{
    materials: {
      id: string;
      name: string;
      title: string;
      status: string;
      currentStock: number;
      minimumStock: number;
      unit: string;
    }[];
    lowStockCount: number;
    outOfStockCount: number;
  }> {
    type Alert = {
      id: string;
      name: string;
      title: string;
      status: string;
      currentStock: number;
      minimumStock: number;
      unit: string;
    };
    let alerts: Alert[];

    // A minimum of 0 means "no minimum configured": rows left at 0/0 by
    // transfers or production would otherwise alert forever. DISCONTINUED
    // materials keep their leftover stock rows but must not alert.
    const alertableMaterial: Prisma.RawMaterialWhereInput = {
      status: { not: 'DISCONTINUED' },
      minimumStock: { gt: 0 },
    };

    if (locationId) {
      const stocks = await this.prisma.materialStock.findMany({
        where: { locationId, rawMaterial: alertableMaterial },
        include: {
          rawMaterial: {
            select: { id: true, title: true, minimumStock: true, status: true, unit: true },
          },
        },
      });

      alerts = stocks
        .filter((s) => this.toNum(s.quantity) <= this.toNum(s.rawMaterial.minimumStock))
        .map((s) => {
          const qty = this.toNum(s.quantity);
          return {
            id: s.rawMaterial.id,
            name: s.rawMaterial.title,
            title: s.rawMaterial.title,
            status: qty <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
            currentStock: qty,
            minimumStock: this.toNum(s.rawMaterial.minimumStock),
            unit: s.rawMaterial.unit,
          };
        });
    } else {
      // "Toate" = CEA MAI PROASTA locatie per material — aceeasi clasificare
      // ca vederile per-locatie, doar agregata. (Vechea varianta pornea de la
      // coloana status stocata — stale — si sarea peste reclasificare, asa ca
      // un material cu 0 la o locatie dar cu stoc in alta aparea global
      // "stoc scazut" in timp ce locatia il arata "lipsa".)
      const [materials, stocks] = await Promise.all([
        this.prisma.rawMaterial.findMany({
          where: alertableMaterial,
          select: {
            id: true,
            title: true,
            stockCount: true,
            minimumStock: true,
            unit: true,
          },
        }),
        // Prisma can't compare quantity <= minimumStock column-to-column, so
        // rows of alertable materials are fetched and compared in memory —
        // bounded by the alertableMaterial filter, minimal selected fields.
        this.prisma.materialStock.findMany({
          where: { rawMaterial: alertableMaterial },
          select: { quantity: true, rawMaterialId: true },
        }),
      ]);

      const worstByMaterial = new Map<string, number>();
      for (const s of stocks) {
        const qty = this.toNum(s.quantity);
        const prev = worstByMaterial.get(s.rawMaterialId);
        if (prev === undefined || qty < prev) worstByMaterial.set(s.rawMaterialId, qty);
      }

      alerts = [];
      for (const m of materials) {
        // Fara randuri de locatie (stoc neasignat) → cade pe totalul global.
        const worst = worstByMaterial.get(m.id) ?? this.toNum(m.stockCount);
        const min = this.toNum(m.minimumStock);
        if (worst > min) continue;
        alerts.push({
          id: m.id,
          name: m.title,
          title: m.title,
          status: worst <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
          currentStock: worst,
          minimumStock: min,
          unit: m.unit,
        });
      }
    }

    // OUT_OF_STOCK first — the truncation below must never cut the most
    // severe alerts while keeping milder LOW_STOCK rows.
    alerts.sort((a, b) => b.status.localeCompare(a.status) || a.name.localeCompare(b.name));
    return {
      materials: alerts.slice(0, 10),
      lowStockCount: alerts.filter((a) => a.status === 'LOW_STOCK').length,
      outOfStockCount: alerts.filter((a) => a.status === 'OUT_OF_STOCK').length,
    };
  }

  private async getRecentTasks(locationId?: string) {
    const tasks = await this.prisma.task.findMany({
      where: this.taskLocationFilter(locationId),
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        recipe: { select: { name: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });

    return tasks.map((t) => ({
      id: t.id,
      recipeName: t.recipe.name,
      displayName: t.title?.trim() || t.recipe.name,
      status: t.status,
      targetQuantity:
        t.targetQuantity instanceof Decimal
          ? t.targetQuantity.toNumber()
          : Number(t.targetQuantity),
      targetUnit: t.targetUnit,
      assignedToName: t.assignedTo
        ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}`
        : undefined,
      createdAt: t.createdAt,
    }));
  }

  /**
   * „Task-uri azi” = tot ce e de lucrat azi: task-urile deschise cu termen azi
   * sau depășit, plus cele FĂRĂ termen care nu sunt planificate în viitor.
   * (Vechiul filtru cerea dueDate fix azi — dar dueDate e opțional, așa că
   * task-urile asignate fără termen nu apăreau niciodată și dashboard-ul arăta
   * 0 deși utilizatorul avea task-uri de făcut.)
   */
  private async getTodayTasksDue(locationId?: string): Promise<number> {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    return this.prisma.task.count({
      where: {
        status: { notIn: [TaskStatus.FINALIZAT, TaskStatus.ANULAT] },
        // AND explicit: taskLocationFilter folosește el însuși OR — un spread
        // la același nivel i-ar suprascrie cheia.
        AND: [
          {
            OR: [
              { dueDate: { lte: todayEnd } },
              { dueDate: null, plannedDate: { lte: todayEnd } },
              { dueDate: null, plannedDate: null },
            ],
          },
          this.taskLocationFilter(locationId),
        ],
      },
    });
  }

  private async getTodayOrdersDue(orderFilter: Prisma.OrderWhereInput): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    return this.prisma.order.count({
      where: {
        dueDate: { gte: todayStart, lte: todayEnd },
        status: { notIn: [OrderStatus.LIVRATA, OrderStatus.ANULATA] },
        ...orderFilter,
      },
    });
  }

  private async getTodaySalesAmount(orderFilter: Prisma.OrderWhereInput): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const orders = await this.prisma.order.findMany({
      where: {
        dueDate: { gte: todayStart, lte: todayEnd },
        status: { notIn: [OrderStatus.ANULATA] },
        ...orderFilter,
      },
      include: {
        items: {
          include: {
            recipe: { select: { sellingPrice: true } },
          },
        },
      },
    });

    let total = 0;
    for (const order of orders) {
      for (const item of order.items) {
        const price = item.recipe?.sellingPrice;
        const qty = item.quantity;
        if (price) {
          total +=
            (price instanceof Decimal ? price.toNumber() : Number(price)) *
            (qty instanceof Decimal ? qty.toNumber() : Number(qty));
        }
      }
    }
    return Math.round(total * 100) / 100;
  }

  private async getTodayDeliveries(orderFilter: Prisma.OrderWhereInput): Promise<number> {
    return this.countTodayOrdersByFulfillment('DELIVERY', orderFilter);
  }

  private async getTodayPickups(orderFilter: Prisma.OrderWhereInput): Promise<number> {
    return this.countTodayOrdersByFulfillment('PICKUP', orderFilter);
  }

  private async countTodayOrdersByFulfillment(
    fulfillmentType: 'DELIVERY' | 'PICKUP',
    orderFilter: Prisma.OrderWhereInput,
  ): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    return this.prisma.order.count({
      where: {
        dueDate: { gte: todayStart, lte: todayEnd },
        status: { notIn: [OrderStatus.ANULATA] },
        fulfillmentType,
        ...orderFilter,
      },
    });
  }
}
