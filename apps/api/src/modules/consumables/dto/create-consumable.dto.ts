import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateConsumableDto {
  @ApiProperty({
    description: 'Name of the consumable item',
    example: 'Cutie tort 30cm',
  })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional({
    description: 'Admin-managed product category (null/omitted = Misc)',
    example: 'Ambalaje',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Minimum stock threshold before LOW_STOCK warning',
    example: 10,
    default: 0,
  })
  @IsOptional()
  // Coloana e Decimal — permite minim fracționar (aliniat cu materiile prime).
  @IsNumber()
  @Min(0)
  minimumStock?: number;
}
