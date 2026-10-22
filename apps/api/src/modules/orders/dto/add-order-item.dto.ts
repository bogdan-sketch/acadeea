import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType } from '@prisma/client';

export class AddOrderItemDto {
  @ApiProperty({
    description: 'Recipe ID (must be FINAL type)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  recipeId: string;

  @ApiProperty({ description: 'Quantity', example: 2 })
  @IsNumber()
  @Type(() => Number)
  @Min(0.01)
  quantity: number;

  @ApiProperty({ description: 'Unit', enum: UnitType, example: 'BUCATI' })
  @IsEnum(UnitType)
  unit: UnitType;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
