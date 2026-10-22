import { ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType, PieceType, StorageType, MaterialStatus } from '@prisma/client';
import { Allergen } from '@horae/shared-types';
import { NutritionValuesDto } from './nutrition.dto';

export class UpdateRawMaterialDto {
  @ApiPropertyOptional({
    description: 'Name of the raw material',
    example: 'Faina alba 000',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({ description: 'Admin-managed product category (null = Misc)' })
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

  @ApiPropertyOptional({ description: 'Supplier ID (UUID, null to unlink)', nullable: true })
  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @ApiPropertyOptional({ description: 'Assign the material to a location (creates a stock entry)' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({
    description: 'Unit of measurement',
    enum: UnitType,
    example: 'KG',
  })
  @IsOptional()
  @IsEnum(UnitType)
  unit?: UnitType;

  @ApiPropertyOptional({
    description: 'Quantity per piece (e.g. 1.5 kg per bag)',
    example: 1.5,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  quantityPerPiece?: number;

  @ApiPropertyOptional({
    description: 'Type of piece / packaging',
    enum: PieceType,
    example: 'BAG',
  })
  @IsOptional()
  @IsEnum(PieceType)
  pieceType?: PieceType;

  @ApiPropertyOptional({
    description: 'Storage type for the material',
    enum: StorageType,
    example: 'DRY',
  })
  @IsOptional()
  @IsEnum(StorageType)
  storageType?: StorageType;

  @ApiPropertyOptional({
    description: 'Material status',
    enum: MaterialStatus,
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(MaterialStatus)
  status?: MaterialStatus;

  @ApiPropertyOptional({
    description: 'Minimum stock threshold for alerts (fractional allowed, e.g. 2.5 kg)',
    example: 5,
  })
  @IsOptional()
  // Coloana e Decimal — un minim fracționar (2,5 kg) e legitim. @IsInt aici
  // respingea cu 400 ORICE editare (inclusiv schimbarea unității de măsură)
  // pentru materialele cu stoc minim fracționar.
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minimumStock?: number;

  @ApiPropertyOptional({ description: 'Estimated waste/loss percentage (0-100)', example: 5 })
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

  @ApiPropertyOptional({ description: 'Lot number' })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiPropertyOptional({ description: 'Expiry date' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({
    description: 'Nutrition per 100g/100ml (null clears)',
    type: NutritionValuesDto,
    nullable: true,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NutritionValuesDto)
  nutrition?: NutritionValuesDto | null;

  @ApiPropertyOptional({
    description: 'EU-14 allergen keys (shared-types Allergen); replaces the whole list',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Allergen, { each: true })
  allergens?: Allergen[];
}
