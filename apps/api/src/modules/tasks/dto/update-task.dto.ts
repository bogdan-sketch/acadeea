import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskVisibility, UnitType } from '@prisma/client';

export class UpdateTaskDto {
  @ApiPropertyOptional({
    description: 'Recipe ID to produce',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  recipeId?: string;

  @ApiPropertyOptional({
    description: 'Target quantity to produce',
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  targetQuantity?: number;

  @ApiPropertyOptional({
    description: 'Unit for the target quantity',
    enum: UnitType,
    example: 'BUC',
  })
  @IsOptional()
  @IsEnum(UnitType)
  targetUnit?: UnitType;

  @ApiPropertyOptional({
    description: 'Priority (higher = more urgent)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priority?: number;

  @ApiPropertyOptional({
    description: 'Planned production start date (ISO 8601)',
    example: '2024-03-11T08:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @ApiPropertyOptional({
    description: 'Delivery deadline (ISO 8601)',
    example: '2024-03-15T14:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'Decoratiuni speciale solicitate de client',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Custom task name shown instead of the recipe name (null/empty = recipe name)',
    example: 'Tort nunta Popescu',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @ApiPropertyOptional({
    description:
      'Who sees the task besides managers/admins: ASSIGNED (assignee only, default), ' +
      'EVERYONE, or SELECTED (assignee + visibleToIds)',
    enum: TaskVisibility,
    default: TaskVisibility.ASSIGNED,
  })
  @IsOptional()
  @IsEnum(TaskVisibility)
  visibility?: TaskVisibility;

  @ApiPropertyOptional({
    description: 'Extra users who see the task when visibility = SELECTED',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  visibleToIds?: string[];

  @ApiPropertyOptional({
    description: 'User ID to assign the task to',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({
    description: 'Production location — stock is reserved/consumed here.',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
