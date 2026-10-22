import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import {
  CreateEquipmentDto,
  UpdateEquipmentDto,
  EquipmentResponseDto,
  EquipmentQueryDto,
  CreateMaintenanceLogDto,
  MaintenanceLogResponseDto,
  EquipmentReservationResponseDto,
} from './dto';

@Injectable()
export class EquipmentService {
  private readonly logger = new Logger(EquipmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ========================================================================
  // Equipment CRUD
  // ========================================================================

  async findAll(query: EquipmentQueryDto): Promise<EquipmentResponseDto[]> {
    const where: Prisma.EquipmentWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.locationId) where.locationId = query.locationId;

    const equipment = await this.prisma.equipment.findMany({
      where,
      include: { location: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    return equipment.map((e) => this.toEquipmentDto(e));
  }

  async findById(id: string): Promise<EquipmentResponseDto> {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id },
      include: {
        location: { select: { name: true } },
        reservations: true,
        maintenanceLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!equipment) {
      throw new NotFoundException(`Equipment with ID "${id}" not found`);
    }

    return this.toEquipmentDto(equipment);
  }

  async create(dto: CreateEquipmentDto): Promise<EquipmentResponseDto> {
    const equipment = await this.prisma.equipment.create({
      data: {
        name: dto.name,
        type: dto.type,
        quantity: dto.quantity ?? 1,
        locationId: dto.locationId ?? null,
        status: dto.status ?? 'DISPONIBIL',
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
        warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : null,
        notes: dto.notes ?? null,
      },
      include: { location: { select: { name: true } } },
    });

    this.logger.log(`Created equipment "${equipment.name}" (${equipment.type})`);
    return this.toEquipmentDto(equipment);
  }

  async update(id: string, dto: UpdateEquipmentDto): Promise<EquipmentResponseDto> {
    await this.findById(id); // ensure exists

    const equipment = await this.prisma.equipment.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.purchaseDate !== undefined && {
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
        }),
        ...(dto.warrantyExpiry !== undefined && {
          warrantyExpiry: dto.warrantyExpiry ? new Date(dto.warrantyExpiry) : null,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { location: { select: { name: true } } },
    });

    this.logger.log(`Updated equipment "${equipment.name}" (${equipment.id})`);
    return this.toEquipmentDto(equipment);
  }

  async delete(id: string): Promise<void> {
    await this.findById(id); // ensure exists

    await this.prisma.equipment.delete({ where: { id } });
    this.logger.log(`Deleted equipment ${id}`);
  }

  // ========================================================================
  // Availability
  // ========================================================================

  async getAvailability(id: string): Promise<EquipmentResponseDto> {
    const now = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const equipment = await this.prisma.equipment.findUnique({
      where: { id },
      include: {
        location: { select: { name: true } },
        reservations: {
          where: {
            reservedFrom: { lte: thirtyDaysLater },
            reservedUntil: { gte: now },
          },
          orderBy: { reservedFrom: 'asc' },
        },
      },
    });

    if (!equipment) {
      throw new NotFoundException(`Equipment with ID "${id}" not found`);
    }

    return this.toEquipmentDto(equipment);
  }

  // ========================================================================
  // Maintenance Logs
  // ========================================================================

  async addMaintenanceLog(
    equipmentId: string,
    dto: CreateMaintenanceLogDto,
    userId: string,
  ): Promise<MaintenanceLogResponseDto> {
    await this.findById(equipmentId); // ensure exists

    const log = await this.prisma.maintenanceLog.create({
      data: {
        equipmentId,
        description: dto.description,
        performedById: userId,
        nextScheduled: dto.nextScheduled ? new Date(dto.nextScheduled) : null,
        cost: dto.cost !== undefined ? new Prisma.Decimal(dto.cost) : null,
      },
    });

    // Set equipment status to IN_MENTENANTA
    await this.prisma.equipment.update({
      where: { id: equipmentId },
      data: { status: 'IN_MENTENANTA' },
    });

    this.logger.log(`Added maintenance log for equipment ${equipmentId}`);
    return this.toMaintenanceLogDto(log);
  }

  async findMaintenanceLogs(equipmentId: string): Promise<MaintenanceLogResponseDto[]> {
    await this.findById(equipmentId); // ensure exists

    const logs = await this.prisma.maintenanceLog.findMany({
      where: { equipmentId },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((l) => this.toMaintenanceLogDto(l));
  }

  // ========================================================================
  // Mappers
  // ========================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toEquipmentDto(equipment: any): EquipmentResponseDto {
    const dto = new EquipmentResponseDto({
      id: equipment.id,
      name: equipment.name,
      type: equipment.type,
      quantity: equipment.quantity,
      locationId: equipment.locationId,
      locationName: equipment.location?.name ?? null,
      status: equipment.status,
      purchaseDate: equipment.purchaseDate,
      warrantyExpiry: equipment.warrantyExpiry,
      notes: equipment.notes,
      createdAt: equipment.createdAt,
      updatedAt: equipment.updatedAt,
    });

    // Attach reservations if included
    if (equipment.reservations) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dto as any).reservations = equipment.reservations.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => this.toReservationDto(r),
      );
    }

    // Attach maintenance logs if included
    if (equipment.maintenanceLogs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dto as any).maintenanceLogs = equipment.maintenanceLogs.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (l: any) => this.toMaintenanceLogDto(l),
      );
    }

    return dto;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toMaintenanceLogDto(log: any): MaintenanceLogResponseDto {
    return new MaintenanceLogResponseDto({
      id: log.id,
      equipmentId: log.equipmentId,
      description: log.description,
      performedById: log.performedById,
      nextScheduled: log.nextScheduled,
      cost: log.cost !== null ? Number(log.cost) : null,
      createdAt: log.createdAt,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toReservationDto(reservation: any): EquipmentReservationResponseDto {
    return new EquipmentReservationResponseDto({
      id: reservation.id,
      equipmentId: reservation.equipmentId,
      taskId: reservation.taskId,
      quantity: reservation.quantity,
      reservedFrom: reservation.reservedFrom,
      reservedUntil: reservation.reservedUntil,
      createdAt: reservation.createdAt,
    });
  }
}
