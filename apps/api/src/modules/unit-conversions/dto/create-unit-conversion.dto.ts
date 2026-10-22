import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';
import { UnitType } from '@prisma/client';

export class CreateUnitConversionDto {
  @ApiProperty({
    description: 'Source unit of measure',
    enum: UnitType,
    example: UnitType.GRAME,
  })
  @IsEnum(UnitType)
  fromUnit: UnitType;

  @ApiProperty({
    description: 'Target unit of measure',
    enum: UnitType,
    example: UnitType.KILOGRAME,
  })
  @IsEnum(UnitType)
  toUnit: UnitType;

  @ApiProperty({
    description: 'Conversion factor (fromUnit * factor = toUnit quantity)',
    example: 0.001,
  })
  @IsNumber()
  @IsPositive()
  factor: number;

  @ApiPropertyOptional({
    description:
      'Raw material ID for material-specific conversions (e.g. density-based). ' +
      'Omit for universal conversions.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  rawMaterialId?: string;
}
