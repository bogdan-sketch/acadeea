import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { OrderStatus, Prisma, RecipeType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { PrismaService } from '@/prisma/prisma.service';
import { bucharestDayStartUtc } from '@/modules/stock/services/lot-naming.util';
import {
  autoDeliveryKind,
  defaultDeliveryLabel,
  deliveryMethodWhere,
  OrderView,
  sortForDeliveries,
  splitDeliveryMethods,
} from './order-views';
import { tenantOrgFilter } from '@/prisma/tenant-context';
import { PaginatedDto } from '@/common/dto';
import { WebsocketService } from '@/modules/websocket';
import { CaslAbilityFactory } from '@/modules/auth/casl/casl-ability.factory';
import { JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import {
  CreateOrderDto,
  UpdateOrderDto,
  AddOrderItemDto,
  UpdateOrderItemDto,
  OrderQueryDto,
  OrderResponseDto,
  SignDeliveryNoteDto,
  OrderStatsQueryDto,
  OrderStatsResponseDto,
  DeliveryMethodSummaryDto,
  SetDeliveryMethodAliasDto,
} from './dto';

/** Valid status transitions for orders. */
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NOUA: [OrderStatus.IN_PREGATIRE, OrderStatus.ANULATA],
  IN_PREGATIRE: [OrderStatus.PREGATITA, OrderStatus.ANULATA],
  PREGATITA: [OrderStatus.IN_TRANZIT, OrderStatus.ANULATA],
  IN_TRANZIT: [OrderStatus.LIVRATA],
  LIVRATA: [],
  ANULATA: [],
};

/** Prisma include for order queries with relations. */
const ORDER_INCLUDE = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  items: {
    include: { recipe: { select: { name: true } } },
    orderBy: { id: 'asc' as const },
  },
  deliveryNote: true,
} satisfies Prisma.OrderInclude;

/** Order entity with all included relations. */
type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** Single order item with its included recipe relation. */
type OrderItemWithRecipe = OrderWithRelations['items'][number];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: WebsocketService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------

  async create(dto: CreateOrderDto, user: JwtPayload): Promise<OrderResponseDto> {
    // Validate all items reference FINAL recipes
    const recipeIds = dto.items.map((i) => i.recipeId);
    const recipes = await this.prisma.recipe.findMany({
      where: { id: { in: recipeIds } },
      select: { id: true, type: true, isArchived: true, isDraft: true },
    });

    const recipeMap = new Map(recipes.map((r) => [r.id, r]));
    for (const item of dto.items) {
      const recipe = recipeMap.get(item.recipeId);
      if (!recipe) {
        throw new BadRequestException(`Recipe ${item.recipeId} not found`);
      }
      if (recipe.type !== RecipeType.FINAL) {
        throw new BadRequestException(`Recipe ${item.recipeId} is not a FINAL product`);
      }
      if (recipe.isArchived) {
        throw new BadRequestException('Reteta este arhivata si nu poate fi adaugata in comenzi.');
      }
      if (recipe.isDraft) {
        throw new BadRequestException('Rețeta este schiță și nu poate fi adăugată în comenzi.');
      }
    }

    // Generate order number: CMD-YYYYMMDD-NNN
    const orderNumber = await this.generateOrderNumber();

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        deliveryPoint: dto.deliveryPoint,
        fulfillmentType: dto.fulfillmentType ?? 'DELIVERY',
        pickupLocationId: dto.pickupLocationId ?? null,
        deliveryAddress: dto.deliveryAddress,
        notes: dto.notes,
        createdById: user.userId,
        assignedToId: dto.assignedToId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        items: {
          create: dto.items.map((item) => ({
            recipeId: item.recipeId,
            quantity: item.quantity,
            unit: item.unit,
            notes: item.notes,
          })),
        },
      },
      include: ORDER_INCLUDE,
    });

    this.ws.emitActivity({
      type: 'ORDER_CREATED',
      title: `Comanda ${order.orderNumber} creata`,
      description: `${order.createdBy.firstName} ${order.createdBy.lastName} — ${order.deliveryPoint}`,
      metadata: { orderId: order.id, userId: user.userId },
    });

    return this.toDto(order);
  }

  // ---------------------------------------------------------------------------
  // LIST
  // ---------------------------------------------------------------------------

  async findAll(query: OrderQueryDto): Promise<PaginatedDto<OrderResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      // Default listing shows only active orders; ?archived=true flips to the archive.
      isArchived: query.archived === true,
    };
    const statuses = [...(query.status ? [query.status] : []), ...(query.statuses ?? [])];
    if (statuses.length === 1) where.status = statuses[0];
    else if (statuses.length > 1) where.status = { in: statuses };
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.deliveryPoint)
      where.deliveryPoint = { contains: query.deliveryPoint, mode: 'insensitive' };
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { deliveryPoint: { contains: query.search, mode: 'insensitive' } },
        { customerName: { contains: query.search, mode: 'insensitive' } },
        { deliveryMethod: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const and: Prisma.OrderWhereInput[] = [];
    if (query.deliveryMethod) and.push(deliveryMethodWhere(query.deliveryMethod));
    if (query.deliveryKind) and.push(await this.deliveryKindWhere(query.deliveryKind));
    if (and.length > 0) where.AND = and;

    if (query.view === 'livrari') {
      // Delivery order needs "no date = today", which SQL ordering can't
      // express cheaply: sort the light rows here, then load the page.
      const light = await this.prisma.order.findMany({
        where,
        select: { id: true, dueDate: true, createdAt: true },
      });
      const pageIds = sortForDeliveries(light)
        .slice(skip, skip + limit)
        .map((o) => o.id);
      const rows = await this.prisma.order.findMany({
        where: { id: { in: pageIds } },
        include: ORDER_INCLUDE,
      });
      const byId = new Map(rows.map((o) => [o.id, o]));
      const ordered = pageIds.map((id) => byId.get(id)).filter((o) => o !== undefined);
      return new PaginatedDto(
        ordered.map((o) => this.toDto(o)),
        light.length,
        page,
        limit,
      );
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        // Newest first. Woo orders carry the shop's own placed-at time as
        // createdAt (set on import), so WOO-11643 sits above WOO-11642 even
        // when a sync stored them in another order; orderNumber breaks ties.
        orderBy: [{ createdAt: 'desc' }, { orderNumber: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return new PaginatedDto(
      orders.map((o) => this.toDto(o)),
      total,
      page,
      limit,
    );
  }

  // ---------------------------------------------------------------------------
  // FIND ONE
  // ---------------------------------------------------------------------------

  async findById(id: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });

    if (!order) throw new NotFoundException('Order not found');
    return this.toDto(order);
  }

  // ---------------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------------

  async update(id: string, dto: UpdateOrderDto, user?: JwtPayload): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');

    // Validate status transition if status is being changed
    if (dto.status && dto.status !== order.status) {
      const allowed = VALID_TRANSITIONS[order.status];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(`Cannot transition from ${order.status} to ${dto.status}`);
      }
    }

    const data: Prisma.OrderUpdateInput = {};
    if (dto.status) data.status = dto.status;
    if (dto.deliveryPoint !== undefined) data.deliveryPoint = dto.deliveryPoint;
    if (dto.deliveryAddress !== undefined) data.deliveryAddress = dto.deliveryAddress;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    // Mark completion timestamp
    if (dto.status === OrderStatus.LIVRATA) {
      data.completedAt = new Date();
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data,
      include: ORDER_INCLUDE,
    });

    // Record status history
    if (dto.status && dto.status !== order.status && user) {
      await this.prisma.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: dto.status,
          changedById: user.userId,
        },
      });
    }

    return this.toDto(updated);
  }

  // ---------------------------------------------------------------------------
  // ARCHIVE
  // ---------------------------------------------------------------------------

  /**
   * Archive / unarchive a single order. Archived orders keep their full history
   * (items, documents, status history) but disappear from default lists, stats
   * and the calendar. Only closed orders (LIVRATA / ANULATA) can be archived so
   * an in-flight order can't vanish from the board.
   */
  async setArchived(id: string, archived: boolean): Promise<OrderResponseDto> {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Order not found');

    if (
      archived &&
      existing.status !== OrderStatus.LIVRATA &&
      existing.status !== OrderStatus.ANULATA
    ) {
      throw new BadRequestException('Doar comenzile livrate sau anulate pot fi arhivate');
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        isArchived: archived,
        // Keep the original archive timestamp on a repeated/retried archive.
        archivedAt: archived ? (existing.isArchived ? existing.archivedAt : new Date()) : null,
      },
      include: ORDER_INCLUDE,
    });

    return this.toDto(updated);
  }

  /**
   * Bulk-archive every closed order (LIVRATA / ANULATA) older than `olderThanDays`
   * (by completion date, falling back to last update). Used by the manual
   * "Arhivează finalizate" action and the nightly auto-archive job.
   */
  async archiveCompleted(olderThanDays = 0): Promise<{ archived: number }> {
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
    const result = await this.prisma.order.updateMany({
      where: {
        isArchived: false,
        status: { in: [OrderStatus.LIVRATA, OrderStatus.ANULATA] },
        OR: [{ completedAt: { lte: cutoff } }, { completedAt: null, updatedAt: { lte: cutoff } }],
      },
      data: { isArchived: true, archivedAt: new Date() },
    });
    return { archived: result.count };
  }

  // ---------------------------------------------------------------------------
  // ORDER ITEMS
  // ---------------------------------------------------------------------------

  async addItem(orderId: string, dto: AddOrderItemDto): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== OrderStatus.NOUA && order.status !== OrderStatus.IN_PREGATIRE) {
      throw new BadRequestException('Can only add items to NOUA or IN_PREGATIRE orders');
    }

    // Validate FINAL recipe
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: dto.recipeId },
      select: { type: true, isArchived: true, isDraft: true },
    });
    if (!recipe) throw new NotFoundException('Recipe not found');
    if (recipe.type !== RecipeType.FINAL) {
      throw new BadRequestException('Only FINAL recipes can be added to orders');
    }
    if (recipe.isArchived) {
      throw new BadRequestException('Reteta este arhivata si nu poate fi adaugata in comenzi.');
    }
    if (recipe.isDraft) {
      throw new BadRequestException('Rețeta este schiță și nu poate fi adăugată în comenzi.');
    }

    await this.prisma.orderItem.create({
      data: {
        orderId,
        recipeId: dto.recipeId,
        quantity: dto.quantity,
        unit: dto.unit,
        notes: dto.notes,
      },
    });

    return this.findById(orderId);
  }

  async updateItem(
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemDto,
  ): Promise<OrderResponseDto> {
    // OrderItem has no organizationId — scope through the (tenant-scoped) order.
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId, order: tenantOrgFilter() },
    });
    if (!item) throw new NotFoundException('Order item not found');

    const data: Prisma.OrderItemUpdateInput = {};
    if (dto.quantity !== undefined) data.quantity = dto.quantity;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes;

    await this.prisma.orderItem.update({ where: { id: itemId }, data });

    return this.findById(orderId);
  }

  async removeItem(orderId: string, itemId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== OrderStatus.NOUA && order.status !== OrderStatus.IN_PREGATIRE) {
      throw new BadRequestException('Can only remove items from NOUA or IN_PREGATIRE orders');
    }

    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException('Order item not found');

    await this.prisma.orderItem.delete({ where: { id: itemId } });

    return this.findById(orderId);
  }

  // ---------------------------------------------------------------------------
  // DELIVERY NOTE
  // ---------------------------------------------------------------------------

  async createDeliveryNote(orderId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { deliveryNote: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.deliveryNote) {
      throw new BadRequestException('Delivery note already exists for this order');
    }

    const serialNumber = await this.generateDeliveryNoteSerial();

    await this.prisma.deliveryNote.create({
      data: {
        orderId,
        deliveryAddress: order.deliveryAddress ?? order.deliveryPoint,
        deliveryPoint: order.deliveryPoint,
        serialNumber,
      },
    });

    return this.findById(orderId);
  }

  async getDeliveryNote(orderId: string) {
    const note = await this.prisma.deliveryNote.findUnique({
      where: { orderId },
    });
    if (!note) throw new NotFoundException('Delivery note not found');
    return {
      id: note.id,
      deliveryAddress: note.deliveryAddress,
      deliveryPoint: note.deliveryPoint,
      serialNumber: note.serialNumber,
      hasSignature: !!note.signatureImage,
      signedByName: note.signedByName,
      signedAt: note.signedAt,
      notes: note.notes,
      generatedAt: note.generatedAt,
    };
  }

  async getSignatureImage(orderId: string): Promise<Buffer> {
    const note = await this.prisma.deliveryNote.findUnique({
      where: { orderId },
      select: { signatureImage: true },
    });
    if (!note?.signatureImage) throw new NotFoundException('Signature not found');
    return Buffer.from(note.signatureImage);
  }

  async signDeliveryNote(
    orderId: string,
    dto: SignDeliveryNoteDto,
    signatureImage: Uint8Array,
    user: JwtPayload,
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { deliveryNote: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliveryNote) {
      throw new NotFoundException('Delivery note not found');
    }

    // Only assignedTo user or admin can sign
    const ability = await this.caslAbilityFactory.createForUser({
      id: user.userId,
      role: user.role,
      organizationId: user.organizationId,
    });
    const isAdmin = ability.can('manage', 'all');
    const isAssigned = order.assignedToId === user.userId;
    if (!isAdmin && !isAssigned) {
      throw new ForbiddenException('Only the assigned delivery person or admin can sign');
    }

    await this.prisma.deliveryNote.update({
      where: { id: order.deliveryNote.id },
      data: {
        signatureImage: Buffer.from(signatureImage) as unknown as Uint8Array<ArrayBuffer>,
        signedByName: dto.signedByName,
        signedAt: new Date(),
        notes: dto.notes,
      },
    });

    return this.findById(orderId);
  }

  // ---------------------------------------------------------------------------
  // STATS
  // ---------------------------------------------------------------------------

  async getStats(query: OrderStatsQueryDto): Promise<OrderStatsResponseDto> {
    const where: Prisma.OrderWhereInput = { isArchived: false };
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    const [totalOrders, completedOrders, statusGroups, deliveryPointGroups] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.LIVRATA } }),
      this.prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.order.groupBy({
        by: ['deliveryPoint'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const status of Object.values(OrderStatus)) {
      statusCounts[status] = 0;
    }
    for (const row of statusGroups) {
      statusCounts[row.status] = row._count.id;
    }

    const deliveryPointCounts = deliveryPointGroups.map((row) => ({
      deliveryPoint: row.deliveryPoint,
      count: row._count.id,
    }));

    return { totalOrders, completedOrders, statusCounts, deliveryPointCounts };
  }

  // ---------------------------------------------------------------------------
  // CALENDAR
  // ---------------------------------------------------------------------------

  /**
   * Get orders grouped by dueDate for calendar view.
   * Filters by date range and optionally by status.
   */
  async getCalendar(
    from?: string,
    to?: string,
    status?: OrderStatus[],
    view: OrderView = 'livrari',
    deliveryMethod?: string,
    deliveryKind?: 'PICKUP' | 'DELIVERY',
  ): Promise<Record<string, OrderResponseDto[]>> {
    // livrari (default, the historical behaviour) groups by due day — undated
    // orders land on today; intrari groups by the day the order was placed.
    const field = view === 'intrari' ? 'createdAt' : 'dueDate';
    const range: Prisma.DateTimeNullableFilter = {};

    // Calendar days are Romania days: a date-only bound (yyyy-MM-dd) covers
    // that whole Europe/Bucharest day, not the UTC one.
    const dateOnly = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (from) {
      range.gte = dateOnly(from)
        ? bucharestDayStartUtc(new Date(`${from}T12:00:00Z`))
        : new Date(from);
    }
    if (to) {
      if (dateOnly(to)) {
        range.lt = new Date(
          bucharestDayStartUtc(new Date(`${to}T12:00:00Z`)).getTime() + 86_400_000,
        );
      } else {
        range.lte = new Date(to);
      }
    }

    // Undated orders count as due today: include them when today is in range.
    const now = new Date();
    const todayInRange =
      (!range.gte || range.gte <= now) &&
      (!range.lt || now < range.lt) &&
      (!range.lte || now <= range.lte);
    const dated: Prisma.OrderWhereInput =
      field === 'createdAt'
        ? { createdAt: range as Prisma.DateTimeFilter }
        : { dueDate: { not: null, ...range } };
    const where: Prisma.OrderWhereInput = {
      isArchived: false,
      ...(field === 'dueDate' && todayInRange ? { OR: [dated, { dueDate: null }] } : dated),
      ...(status && status.length > 0 ? { status: { in: status } } : {}),
      AND: [
        ...(deliveryMethod ? [deliveryMethodWhere(deliveryMethod)] : []),
        ...(deliveryKind ? [await this.deliveryKindWhere(deliveryKind)] : []),
      ],
    };

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: field === 'createdAt' ? { createdAt: 'desc' } : { dueDate: 'asc' },
      include: ORDER_INCLUDE,
    });

    // Days are counted in Romanian time, not UTC: an order due at local
    // midnight (21:00/22:00Z the day before) belongs to its local day.
    const dayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Bucharest',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const grouped: Record<string, OrderResponseDto[]> = {};
    const today = dayKey.format(now);
    for (const order of orders) {
      const at = field === 'createdAt' ? order.createdAt : order.dueDate;
      const dateKey = at ? dayKey.format(at) : today;
      if (!grouped[dateKey]) grouped[dateKey] = [];
      (grouped[dateKey] as OrderResponseDto[]).push(this.toDto(order));
    }
    return grouped;
  }

  // ---------------------------------------------------------------------------
  // DELIVERY METHODS (shop methods seen on imported orders + short names)
  // ---------------------------------------------------------------------------

  /** Every method seen on an order (or configured), most used first. */
  async getDeliveryMethods(): Promise<DeliveryMethodSummaryDto[]> {
    const [groups, aliases] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['deliveryMethod', 'isArchived', 'fulfillmentType'],
        where: { deliveryMethod: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.deliveryMethodAlias.findMany({
        select: { name: true, shortName: true, kind: true },
      }),
    ]);
    const stats = new Map<string, { count: number; pickup: number; delivery: number }>();
    const statsOf = (name: string) => {
      let st = stats.get(name);
      if (!st) stats.set(name, (st = { count: 0, pickup: 0, delivery: 0 }));
      return st;
    };
    for (const g of groups) {
      for (const name of splitDeliveryMethods(g.deliveryMethod)) {
        const st = statsOf(name);
        if (!g.isArchived) st.count += g._count._all;
        if (g.fulfillmentType === 'PICKUP') st.pickup += g._count._all;
        else st.delivery += g._count._all;
      }
    }
    const aliasByName = new Map(aliases.map((a) => [a.name, a]));
    for (const a of aliases) statsOf(a.name);

    return [...stats.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], 'ro'))
      .map(([name, st]) => {
        const alias = aliasByName.get(name);
        const shortName = alias?.shortName ?? null;
        return new DeliveryMethodSummaryDto({
          name,
          shortName,
          label: shortName ?? defaultDeliveryLabel(name),
          kind: alias?.kind ?? autoDeliveryKind(name, st.pickup, st.delivery),
          kindSet: !!alias?.kind,
          count: st.count,
        });
      });
  }

  /** Method names of one kind — backs the Ridicare / Livrare filter. */
  private async deliveryMethodNamesOfKind(kind: 'PICKUP' | 'DELIVERY'): Promise<string[]> {
    return (await this.getDeliveryMethods()).filter((m) => m.kind === kind).map((m) => m.name);
  }

  /** Where-clause for `deliveryKind`: any order carrying a method of that kind. */
  async deliveryKindWhere(kind: 'PICKUP' | 'DELIVERY'): Promise<Prisma.OrderWhereInput> {
    const names = await this.deliveryMethodNamesOfKind(kind);
    return names.length > 0 ? { OR: names.map((n) => deliveryMethodWhere(n)) } : { id: { in: [] } };
  }

  /**
   * Update a method's short name and/or Ridicare/Livrare assignment (omitted
   * fields stay; empty/null clears). The row goes once nothing is set.
   */
  async setDeliveryMethodAlias(
    dto: SetDeliveryMethodAliasDto,
  ): Promise<DeliveryMethodSummaryDto[]> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Numele metodei de livrare lipsește');
    // Tenant-scoped lookup (the extension adds the org), then update/create.
    const existing = await this.prisma.deliveryMethodAlias.findFirst({ where: { name } });
    const shortName =
      dto.shortName !== undefined ? dto.shortName?.trim() || null : (existing?.shortName ?? null);
    const kind = dto.kind !== undefined ? dto.kind : (existing?.kind ?? null);

    if (!shortName && !kind) {
      if (existing) await this.prisma.deliveryMethodAlias.delete({ where: { id: existing.id } });
    } else if (existing) {
      await this.prisma.deliveryMethodAlias.update({
        where: { id: existing.id },
        data: { shortName, kind },
      });
    } else {
      await this.prisma.deliveryMethodAlias.create({ data: { name, shortName, kind } });
    }
    return this.getDeliveryMethods();
  }

  // ---------------------------------------------------------------------------
  // STATUS HISTORY
  // ---------------------------------------------------------------------------

  async getStatusHistory(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      include: {
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Generate sequential daily order number: CMD-YYYYMMDD-NNN
   * Uses a transaction to ensure uniqueness.
   */
  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');
    const prefix = `CMD-${dateStr}-`;

    // Find highest existing number for today
    const lastOrder = await this.prisma.order.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    let seq = 1;
    if (lastOrder) {
      const lastSeq = parseInt(lastOrder.orderNumber.slice(prefix.length), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(3, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // CONFORMITY CERTIFICATE
  // ---------------------------------------------------------------------------

  async createConformityCertificate(
    orderId: string,
    userId: string,
    notes?: string,
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { deliveryNote: { include: { conformityCertificate: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliveryNote) {
      throw new BadRequestException(
        'Delivery note must exist before generating conformity certificate',
      );
    }
    if (order.deliveryNote.conformityCertificate) {
      throw new BadRequestException('Conformity certificate already exists for this delivery note');
    }

    const serialNumber = await this.generateCertificateSerial();

    await this.prisma.conformityCertificate.create({
      data: {
        deliveryNoteId: order.deliveryNote.id,
        serialNumber,
        issuedByUserId: userId,
        notes,
      },
    });

    return this.findById(orderId);
  }

  async getConformityCertificate(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        deliveryNote: {
          include: {
            conformityCertificate: {
              include: { issuedBy: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.deliveryNote?.conformityCertificate) {
      throw new NotFoundException('Conformity certificate not found');
    }

    const cert = order.deliveryNote.conformityCertificate;
    return {
      id: cert.id,
      serialNumber: cert.serialNumber,
      issuedBy: cert.issuedBy,
      notes: cert.notes,
      createdAt: cert.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Generate sequential delivery note serial: FD-YYYYMMDD-NNN
   */
  private async generateDeliveryNoteSerial(): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');
    const prefix = `FD-${dateStr}-`;

    const lastNote = await this.prisma.deliveryNote.findFirst({
      where: { serialNumber: { startsWith: prefix } },
      orderBy: { serialNumber: 'desc' },
      select: { serialNumber: true },
    });

    let seq = 1;
    if (lastNote?.serialNumber) {
      const lastSeq = parseInt(lastNote.serialNumber.slice(prefix.length), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(3, '0')}`;
  }

  /**
   * Generate sequential certificate serial: CC-YYYYMMDD-NNN
   */
  private async generateCertificateSerial(): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');
    const prefix = `CC-${dateStr}-`;

    const lastCert = await this.prisma.conformityCertificate.findFirst({
      where: { serialNumber: { startsWith: prefix } },
      orderBy: { serialNumber: 'desc' },
      select: { serialNumber: true },
    });

    let seq = 1;
    if (lastCert?.serialNumber) {
      const lastSeq = parseInt(lastCert.serialNumber.slice(prefix.length), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(3, '0')}`;
  }

  /** Convert Prisma order entity to response DTO. */
  private toDto(order: OrderWithRelations): OrderResponseDto {
    return new OrderResponseDto({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      fulfillmentType: order.fulfillmentType,
      pickupLocationId: order.pickupLocationId,
      deliveryPoint: order.deliveryPoint,
      deliveryAddress: order.deliveryAddress,
      customerName: order.customerName,
      externalStatus: order.externalStatus,
      deliveryMethod: order.deliveryMethod,
      isArchived: order.isArchived,
      archivedAt: order.archivedAt,
      notes: order.notes,
      createdById: order.createdById,
      assignedToId: order.assignedToId,
      dueDate: order.dueDate,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      completedAt: order.completedAt,
      createdBy: order.createdBy,
      assignedTo: order.assignedTo,
      items: order.items.map((item: OrderItemWithRecipe) => ({
        id: item.id,
        recipeId: item.recipeId,
        // Unmapped external products have no recipe — show their free-text label.
        recipeName: item.recipe?.name ?? item.label ?? '',
        label: item.label,
        quantity: item.quantity instanceof Decimal ? item.quantity.toNumber() : item.quantity,
        unit: item.unit,
        status: item.status,
        notes: item.notes,
      })),
      deliveryNote: order.deliveryNote
        ? {
            id: order.deliveryNote.id,
            deliveryAddress: order.deliveryNote.deliveryAddress,
            deliveryPoint: order.deliveryNote.deliveryPoint,
            serialNumber: order.deliveryNote.serialNumber,
            hasSignature: !!order.deliveryNote.signatureImage,
            signedByName: order.deliveryNote.signedByName,
            signedAt: order.deliveryNote.signedAt,
            notes: order.deliveryNote.notes,
            generatedAt: order.deliveryNote.generatedAt,
            signatureImageBase64: order.deliveryNote.signatureImage
              ? Buffer.from(order.deliveryNote.signatureImage).toString('base64')
              : null,
          }
        : null,
      itemCount: order.items.length,
      hasInvoice: !!order.invoiceData,
      invoiceFileName: order.invoiceFileName,
    });
  }

  // ---------------------------------------------------------------------------
  // INVOICE
  // ---------------------------------------------------------------------------

  async uploadInvoice(
    orderId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        invoiceFileName: file.originalname,
        invoiceData: new Uint8Array(file.buffer) as unknown as Uint8Array<ArrayBuffer>,
        invoiceMimeType: file.mimetype,
      },
    });

    return this.findById(orderId);
  }

  async getInvoice(orderId: string): Promise<{ data: Buffer; fileName: string; mimeType: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { invoiceData: true, invoiceFileName: true, invoiceMimeType: true },
    });
    if (!order?.invoiceData) throw new NotFoundException('Invoice not found');
    return {
      data: Buffer.from(order.invoiceData),
      fileName: order.invoiceFileName ?? 'factura',
      mimeType: order.invoiceMimeType ?? 'application/octet-stream',
    };
  }

  async deleteInvoice(orderId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    await this.prisma.order.update({
      where: { id: orderId },
      data: { invoiceFileName: null, invoiceData: null, invoiceMimeType: null },
    });

    return this.findById(orderId);
  }
}
