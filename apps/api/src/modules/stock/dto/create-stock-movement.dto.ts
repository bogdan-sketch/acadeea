import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  IsDateString,
} from 'class-validator';
import { StockMovementType, UnitType } from '@prisma/client';

export class CreateStockMovementDto {
  @ApiPropertyOptional({
    description:
      'Raw material ID (UUID). Exactly one of rawMaterialId or consumableId must be provided.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  rawMaterialId?: string;

  @ApiPropertyOptional({
    description:
      'Consumable ID (UUID). Exactly one of rawMaterialId or consumableId must be provided.',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  consumableId?: string;

  @ApiProperty({
    description: 'Type of stock movement. Only INTRARE and AJUSTARE are allowed for manual entry.',
    enum: [StockMovementType.INTRARE, StockMovementType.AJUSTARE],
    example: 'INTRARE',
  })
  @IsEnum(StockMovementType)
  movementType: StockMovementType;

  @ApiProperty({
    description: 'Quantity (positive; AJUSTARE accepts 0 = zero the stock)',
    example: 10,
  })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({
    description: 'Unit of measurement',
    enum: UnitType,
    example: 'KILOGRAME',
  })
  @IsEnum(UnitType)
  unit: UnitType;

  @ApiPropertyOptional({
    description: 'Reference note for this movement (e.g. invoice number, adjustment reason)',
    example: 'Factura #1234',
  })
  @IsOptional()
  @IsString()
  referenceNote?: string;

  @ApiPropertyOptional({
    description: 'Location the stock arrives at. Defaults to the user primary / default location.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  // --- Intake (INTRARE) details — recorded as a StockLot for the intake history ---

  @ApiPropertyOptional({ description: 'Lot number for this intake' })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiPropertyOptional({ description: 'Expiry date for this intake (ISO)' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Purchase price for this intake' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional({
    description:
      'Whether the entered purchasePrice includes VAT — normalized server-side to the org cost basis (net for VAT payers, gross for non-payers). Omitted = already in that basis.',
  })
  @IsOptional()
  @IsBoolean()
  priceIncludesVat?: boolean;

  @ApiPropertyOptional({ description: 'Supplier / distributor for this intake' })
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional({ description: 'Barcode for this intake lot' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ description: 'Supplier invoice number for this intake' })
  @IsOptional()
  @IsString()
  supplierInvoice?: string;
}
