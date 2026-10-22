import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { UnitType, PieceType, StorageType, MaterialStatus } from '@prisma/client';

export class RawMaterialResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Unique identifier (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @Expose()
  @ApiProperty({
    description: 'Name of the raw material',
    example: 'Faina alba 000',
  })
  title: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Admin-managed product category (null = Misc)',
    nullable: true,
  })
  category: string | null;

  @Expose()
  @ApiProperty({
    description: 'Producer / brand name',
    example: 'Baneasa',
    nullable: true,
  })
  producer: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Supplier ID', nullable: true })
  supplierId: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Supplier name', nullable: true })
  supplierName: string | null;

  @Expose()
  @ApiProperty({
    description: 'Unit of measurement',
    enum: UnitType,
    example: 'KG',
  })
  unit: UnitType;

  @Expose()
  @ApiProperty({
    description: 'Quantity per piece',
    example: 1.5,
  })
  quantityPerPiece: number;

  @Expose()
  @ApiProperty({
    description: 'Type of piece / packaging',
    enum: PieceType,
    example: 'BAG',
  })
  pieceType: PieceType | null;

  @Expose()
  @ApiProperty({
    description: 'Number of pieces in stock',
    example: 10,
  })
  stockCount: number;

  @Expose()
  @ApiProperty({
    description: 'Number of opened pieces',
    example: 2,
  })
  openedCount: number;

  @Expose()
  @ApiProperty({
    description: 'Number of pieces on order',
    example: 5,
  })
  orderedCount: number;

  @Expose()
  @ApiProperty({
    description: 'Number of pieces reserved for recipes',
    example: 3,
  })
  reservedCount: number;

  @Expose()
  @ApiProperty({
    description: 'Storage type',
    enum: StorageType,
    example: 'DRY',
  })
  storageType: StorageType;

  @Expose()
  @ApiProperty({
    description: 'Material status',
    enum: MaterialStatus,
    example: 'ACTIVE',
  })
  status: MaterialStatus;

  @Expose()
  @ApiProperty({
    description: 'Minimum stock threshold',
    example: 5,
  })
  minimumStock: number;

  @Expose()
  @ApiProperty({ description: 'Estimated waste/loss percentage', example: 5 })
  estimatedLossPercent: number;

  @Expose()
  @ApiProperty({
    description: 'Purchase price per unit',
    example: 12.5,
    nullable: true,
  })
  purchasePrice: number | null;

  @Expose()
  @ApiProperty({
    description: 'Invoice number',
    example: 'FAC-2024-001',
    nullable: true,
  })
  invoiceNumber: string | null;

  @Expose()
  @ApiProperty({
    description: 'Invoice date',
    example: '2024-01-15',
    nullable: true,
  })
  invoiceDate: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Lot number', nullable: true })
  lotNumber: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Expiry date', nullable: true })
  expiryDate: Date | null;

  @Expose()
  @ApiPropertyOptional({
    description:
      'Nutrition per 100g/100ml: {calories, protein, carbs, sugars, fat, saturatedFat, fiber, salt}',
    nullable: true,
  })
  nutrition: Record<string, number> | null;

  @Expose()
  @ApiProperty({
    description: 'EU-14 allergen keys this material declares (e.g. SOIA, LAPTE)',
    type: [String],
  })
  allergens: string[];

  @Expose()
  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @Expose()
  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt: Date;

  constructor(partial: Partial<RawMaterialResponseDto>) {
    Object.assign(this, partial);
  }
}
