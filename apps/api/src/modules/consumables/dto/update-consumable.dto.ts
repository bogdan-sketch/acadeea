import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { MaterialStatus } from '@prisma/client';

export class UpdateConsumableDto {
  @ApiPropertyOptional({
    description: 'Name of the consumable item',
    example: 'Cutie tort 30cm',
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
    description: 'Minimum stock threshold before LOW_STOCK warning',
    example: 10,
  })
  @IsOptional()
  // Coloana e Decimal — permite minim fracționar (aliniat cu materiile prime).
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @ApiPropertyOptional({
    description: 'Current status of the consumable',
    enum: MaterialStatus,
    example: MaterialStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(MaterialStatus)
  status?: MaterialStatus;
}
