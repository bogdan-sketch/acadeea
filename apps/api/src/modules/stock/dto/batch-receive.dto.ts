import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { UnitType } from '@prisma/client';

export class BatchReceiveItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  rawMaterialId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  consumableId?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @ApiProperty({ enum: UnitType })
  @IsEnum(UnitType)
  unit: UnitType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Prețul de achiziție nu poate fi negativ' })
  purchasePrice?: number;

  @ApiPropertyOptional({
    description:
      'Whether the entered purchasePrice includes VAT — normalized server-side to the org cost basis (net for VAT payers, gross for non-payers). Omitted = already in that basis.',
  })
  @IsOptional()
  @IsBoolean()
  priceIncludesVat?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierInvoice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceNote?: string;
}

export class BatchReceiveDto {
  @ApiProperty({ type: [BatchReceiveItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchReceiveItemDto)
  items: BatchReceiveItemDto[];

  @ApiPropertyOptional({
    description: 'Location the stock arrives at (applies to all items).',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
