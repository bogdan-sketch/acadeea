import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '@prisma/client';
import { QueryBoolean } from '@/common/transforms/query-boolean';

export class TaskQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by task status',
    enum: TaskStatus,
    example: 'DE_FACUT',
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    description: 'Filter by assigned user ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({
    description: 'Filter by recipe ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  recipeId?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks due before this date (ISO 8601)',
    example: '2024-03-15T23:59:59.000Z',
  })
  @IsOptional()
  @IsString()
  dueBefore?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks due after this date (ISO 8601)',
    example: '2024-03-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  dueAfter?: string;

  @ApiPropertyOptional({
    description: 'Search term — filters by title (case-insensitive)',
    example: 'tort',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      '"Ziua mea" board filter: only open tasks assigned to the caller (or with a subtask assigned to them) that are relevant today — due today or overdue, or with no due date and not planned for a future day.',
    example: true,
  })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  myDay?: boolean;

  @ApiPropertyOptional({
    description:
      'Order: "due" = due date ascending (undated last), "completed" = most recently finished first. Default: newest created first.',
    enum: ['due', 'completed'],
  })
  @IsOptional()
  @IsIn(['due', 'completed'])
  sort?: 'due' | 'completed';

  @ApiPropertyOptional({
    description: 'Only tasks with nobody assigned ("Nealocate" chip).',
    example: true,
  })
  @IsOptional()
  @QueryBoolean()
  @IsBoolean()
  unassigned?: boolean;
}
