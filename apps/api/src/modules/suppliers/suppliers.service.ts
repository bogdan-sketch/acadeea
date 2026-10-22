import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierResponseDto,
  SupplierMaterialDto,
} from './dto';

const MATERIAL_SELECT = {
  id: true,
  title: true,
  unit: true,
  stockCount: true,
  minimumStock: true,
  status: true,
} as const;

@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<SupplierResponseDto[]> {
    const suppliers = await this.prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: { rawMaterials: { select: MATERIAL_SELECT, orderBy: { title: 'asc' } } },
    });
    return suppliers.map((s) => this.toDto(s));
  }

  async findById(id: string): Promise<SupplierResponseDto> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { rawMaterials: { select: MATERIAL_SELECT, orderBy: { title: 'asc' } } },
    });
    if (!supplier) throw new NotFoundException(`Supplier with ID "${id}" not found`);
    return this.toDto(supplier);
  }

  async create(dto: CreateSupplierDto): Promise<SupplierResponseDto> {
    const supplier = await this.prisma.supplier.create({
      data: {
        name: dto.name.trim(),
        contactPerson: dto.contactPerson ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        notes: dto.notes ?? null,
      },
      include: { rawMaterials: { select: MATERIAL_SELECT } },
    });
    this.logger.log(`Created supplier "${supplier.name}"`);
    return this.toDto(supplier);
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<SupplierResponseDto> {
    await this.findById(id);
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.contactPerson !== undefined && { contactPerson: dto.contactPerson }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { rawMaterials: { select: MATERIAL_SELECT, orderBy: { title: 'asc' } } },
    });
    return this.toDto(supplier);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    // Unlink materials, then delete (keeps the materials, drops the association).
    await this.prisma.rawMaterial.updateMany({
      where: { supplierId: id },
      data: { supplierId: null },
    });
    await this.prisma.supplier.delete({ where: { id } });
    this.logger.log(`Deleted supplier ${id}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(s: any): SupplierResponseDto {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const materials = (s.rawMaterials ?? []).map((m: any) => {
      const stockCount = Number(m.stockCount);
      const minimumStock = Number(m.minimumStock);
      return new SupplierMaterialDto({
        id: m.id,
        title: m.title,
        unit: m.unit,
        stockCount,
        minimumStock,
        status: m.status,
        isLow: minimumStock > 0 && stockCount <= minimumStock,
      });
    });
    return new SupplierResponseDto({
      id: s.id,
      name: s.name,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
      notes: s.notes,
      materialCount: materials.length,
      lowStockCount: materials.filter((m: SupplierMaterialDto) => m.isLow).length,
      materials,
      createdAt: s.createdAt,
    });
  }
}
