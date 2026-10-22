import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { PaginatedDto } from '@/common/dto';
import { WebsocketService, MovementType } from '@/modules/websocket';
import { deriveMaterialStatus } from '@/modules/stock/material-status.util';
import {
  ConsumableQueryDto,
  ConsumableResponseDto,
  CreateConsumableDto,
  UpdateConsumableDto,
} from './dto';

@Injectable()
export class ConsumablesService {
  private readonly logger = new Logger(ConsumablesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: WebsocketService,
  ) {}

  /**
   * List consumables with pagination, search, and status filtering.
   */
  async findAll(query: ConsumableQueryDto): Promise<PaginatedDto<ConsumableResponseDto>> {
    const { page = 1, limit = 20, search, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ConsumableWhereInput = {};

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    // Statusul se derivă din stoc/minim la citire (coloana stocată poate fi
    // stale — vezi deriveMaterialStatus), deci filtrul de status nu poate fi
    // un WHERE pe coloană: aducem setul și filtrăm/paginăm în memorie.
    if (status) {
      const all = await this.prisma.consumable.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      const matching = all.filter(
        (c) =>
          deriveMaterialStatus(Number(c.stockCount), Number(c.minimumStock), c.status) === status,
      );
      const data = matching.slice(skip, skip + limit).map((item) => this.toDto(item));
      return new PaginatedDto(data, matching.length, page, limit);
    }

    const [consumables, total] = await Promise.all([
      this.prisma.consumable.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.consumable.count({ where }),
    ]);

    const data = consumables.map((item) => this.toDto(item));
    return new PaginatedDto(data, total, page, limit);
  }

  /**
   * Find a single consumable by ID.
   * @throws NotFoundException if the consumable does not exist.
   */
  async findById(id: string): Promise<ConsumableResponseDto> {
    const consumable = await this.prisma.consumable.findUnique({
      where: { id },
    });

    if (!consumable) {
      throw new NotFoundException(`Consumable with ID "${id}" not found`);
    }

    return this.toDto(consumable);
  }

  /**
   * Create a new consumable.
   */
  async create(dto: CreateConsumableDto): Promise<ConsumableResponseDto> {
    const consumable = await this.prisma.consumable.create({
      data: {
        title: dto.title,
        category: dto.category,
        minimumStock: dto.minimumStock ?? 0,
      },
    });

    this.logger.log(`Created consumable "${consumable.title}" (${consumable.id})`);
    const result = this.toDto(consumable);
    this.emitStockEvents(result, MovementType.ADJUSTMENT);
    return result;
  }

  /**
   * Update an existing consumable.
   * @throws NotFoundException if the consumable does not exist.
   */
  async update(id: string, dto: UpdateConsumableDto): Promise<ConsumableResponseDto> {
    const existing = await this.prisma.consumable.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Consumable with ID "${id}" not found`);
    }

    const updateData: Record<string, unknown> = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.minimumStock !== undefined) updateData.minimumStock = dto.minimumStock;
    if (dto.status !== undefined) updateData.status = dto.status;

    const consumable = await this.prisma.consumable.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Updated consumable "${consumable.title}" (${consumable.id})`);
    const result = this.toDto(consumable);
    this.emitStockEvents(result, MovementType.ADJUSTMENT);
    return result;
  }

  /**
   * Soft-delete a consumable by setting its status to DISCONTINUED.
   * @throws NotFoundException if the consumable does not exist.
   */
  async remove(id: string): Promise<ConsumableResponseDto> {
    const existing = await this.prisma.consumable.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Consumable with ID "${id}" not found`);
    }

    const consumable = await this.prisma.consumable.update({
      where: { id },
      data: { status: 'DISCONTINUED' },
    });

    this.logger.log(`Discontinued consumable "${consumable.title}" (${consumable.id})`);
    const result = this.toDto(consumable);
    this.emitStockEvents(result, MovementType.ADJUSTMENT);
    return result;
  }

  private emitStockEvents(dto: ConsumableResponseDto, movementType: MovementType): void {
    this.ws.emitStockUpdate({
      materialId: dto.id,
      materialTitle: dto.title,
      newStockCount: dto.stockCount,
      movementType,
    });

    if (dto.stockCount <= dto.minimumStock) {
      this.ws.emitLowStockAlert({
        materialId: dto.id,
        materialTitle: dto.title,
        newStockCount: dto.stockCount,
        movementType,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(item: any): ConsumableResponseDto {
    return new ConsumableResponseDto({
      ...item,
      // Badge-ul de pe rand foloseste statusul derivat, ca sa fie mereu in
      // acord cu /stock/stats si cu filtrul de lista.
      status: deriveMaterialStatus(Number(item.stockCount), Number(item.minimumStock), item.status),
      stockCount: Number(item.stockCount),
      orderedCount: Number(item.orderedCount),
      reservedCount: Number(item.reservedCount),
      minimumStock: Number(item.minimumStock),
    });
  }
}
