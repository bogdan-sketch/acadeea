import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType, PieceType, StorageType } from '@prisma/client';
import { Allergen } from '@horae/shared-types';

export class CreateRawMaterialDto {
  @ApiProperty({
    description: 'Name of the raw material',
    example: 'Faina alba 000',
  })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional({
    description: 'Admin-managed product category (null/omitted = Misc)',
    example: 'Torturi',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Producer / brand name',
    example: 'Baneasa',
  })
  @IsOptional()
  @IsString()
  producer?: string;

  @ApiPropertyOptional({ description: 'Supplier ID (UUID)' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({
    description: 'Location to assign the material to (creates a stock entry)',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  // Only `title` is required — everything else is optional (sensible defaults
  // are applied server-side: unit=BUCATI, storageType=WARM).
  @ApiPropertyOptional({ description: 'Unit of measurement', enum: UnitType })
  @IsOptional()
  @IsEnum(UnitType)
  unit?: UnitType;

  @ApiPropertyOptional({ description: 'Quantity per piece (e.g. 1.5 kg per bag)', example: 1.5 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  quantityPerPiece?: number;

  @ApiPropertyOptional({ description: 'Type of piece / packaging', enum: PieceType })
  @IsOptional()
  @IsEnum(PieceType)
  pieceType?: PieceType;

  @ApiPropertyOptional({ description: 'Storage type', enum: StorageType })
  @IsOptional()
  @IsEnum(StorageType)
  storageType?: StorageType;

  @ApiPropertyOptional({
    description: 'Minimum stock threshold for alerts (fractional allowed, e.g. 2.5 kg)',
    example: 5,
  })
  @IsOptional()
  // Coloana e Decimal — un minim fracționar (2,5 kg) e legitim; @IsInt
  // respingea crearea materialelor cu stoc minim fracționar.
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minimumStock?: number;

  @ApiPropertyOptional({
    description: 'Estimated waste/loss percentage (0-100)',
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  estimatedLossPercent?: number;

  @ApiPropertyOptional({
    description: 'Purchase price per unit',
    example: 12.5,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional({
    description:
      'Whether the entered purchasePrice includes VAT. The API normalizes to the org cost basis (net for VAT payers, gross for non-payers). Omitted = already in that basis.',
  })
  @IsOptional()
  @IsBoolean()
  priceIncludesVat?: boolean;

  @ApiPropertyOptional({
    description: 'EU-14 allergen keys (shared-types Allergen)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Allergen, { each: true })
  allergens?: Allergen[];

  @ApiPropertyOptional({
    description: 'Invoice number',
    example: 'FAC-2024-001',
  })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional({
    description: 'Invoice date',
    example: '2024-01-15',
  })
  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @ApiPropertyOptional({ description: 'Lot number', example: 'L-2024-77' })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiPropertyOptional({ description: 'Expiry date', example: '2025-06-30' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
