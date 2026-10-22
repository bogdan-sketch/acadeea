import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { UnitType } from '@prisma/client';

export class TestConsumptionItemDto {
  @ApiPropertyOptional({
    description:
      'Raw material ID (UUID). Exactly one of rawMaterialId or consumableId must be provided.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  rawMaterialId?: string;

  @ApiPropertyOptional({
    description:
      'Consumable ID (UUID). Exactly one of rawMaterialId or consumableId must be provided.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  consumableId?: string;

  @ApiProperty({ description: 'Quantity consumed (positive)', example: 0.5 })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ enum: UnitType, example: 'KILOGRAME' })
  @IsEnum(UnitType)
  unit: UnitType;
}

export class TestConsumptionDto {
  @ApiProperty({
    description: 'Location the stock is consumed from.',
    format: 'uuid',
  })
  @IsUUID()
  locationId: string;

  @ApiProperty({ type: [TestConsumptionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TestConsumptionItemDto)
  items: TestConsumptionItemDto[];

  @ApiPropertyOptional({
    description: 'Note recorded on every movement (defaults to "Consum teste").',
    example: 'Teste rețetă nouă de macarons',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
