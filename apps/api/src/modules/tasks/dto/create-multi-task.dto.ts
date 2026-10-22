import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskVisibility, UnitType } from '@prisma/client';

export class MultiTaskItemDto {
  @ApiProperty({
    description: 'Recipe ID to produce',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  recipeId: string;

  @ApiProperty({ description: 'Target quantity to produce', example: 5 })
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  targetQuantity: number;

  @ApiProperty({ description: 'Unit for the target quantity', enum: UnitType, example: 'BUC' })
  @IsEnum(UnitType)
  targetUnit: UnitType;
}

export class CreateMultiTaskDto {
  @ApiProperty({
    description: 'Recipes to produce — one task is created per item',
    type: [MultiTaskItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MultiTaskItemDto)
  items: MultiTaskItemDto[];

  @ApiPropertyOptional({
    description: 'User-facing name of the batch (family), e.g. "Sosuri înghețată"',
    example: 'Sosuri înghețată',
  })
  @IsOptional()
  @IsString()
  groupLabel?: string;

  @ApiPropertyOptional({
    description:
      'When true, also creates one task per SEMIPREPARAT component of each final recipe ' +
      '(quantity scaled to the requested amount), linked via parentTaskId and sharing the groupId.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeSemipreparate?: boolean;

  @ApiPropertyOptional({
    description: 'Visibility applied to every task of the batch',
    enum: TaskVisibility,
  })
  @IsOptional()
  @IsEnum(TaskVisibility)
  visibility?: TaskVisibility;

  @ApiPropertyOptional({ description: 'Extra viewers when visibility = SELECTED', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  visibleToIds?: string[];

  @ApiPropertyOptional({
    description: 'Delivery deadline (ISO 8601) — applied to every created task',
    example: '2026-03-15T14:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({
    description: 'Planned production start date (ISO 8601) — applied to every created task',
    example: '2026-03-11T08:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @ApiPropertyOptional({
    description: 'Production location — applied to every created task',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({
    description: 'User ID to assign every created task to',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Priority (higher = more urgent)', example: 1, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({ description: 'Additional notes — applied to every created task' })
  @IsOptional()
  @IsString()
  notes?: string;
}
