import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { TaskStatus, TaskVisibility, UnitType } from '@prisma/client';

export class TaskUserDto {
  @Expose()
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @Expose()
  @ApiProperty({ example: 'Ion' })
  firstName: string;

  @Expose()
  @ApiProperty({ example: 'Popescu' })
  lastName: string;
}

export class TaskStatusHistoryDto {
  @Expose()
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @Expose()
  @ApiPropertyOptional({ enum: TaskStatus, nullable: true })
  fromStatus: TaskStatus | null;

  @Expose()
  @ApiProperty({ enum: TaskStatus })
  toStatus: TaskStatus;

  @Expose()
  @ApiProperty()
  changedBy: TaskUserDto;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  reason: string | null;

  @Expose()
  @ApiProperty()
  createdAt: Date;
}

export class SubtaskSummaryDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  recipeId: string;

  @Expose()
  @ApiProperty()
  recipeName: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Custom name, null = recipe name', nullable: true })
  title: string | null;

  @Expose()
  @ApiProperty({ description: 'title when set, else recipeName' })
  displayName: string;

  @Expose()
  @ApiProperty({ example: 5 })
  targetQuantity: number;

  @Expose()
  @ApiProperty({ enum: UnitType })
  targetUnit: UnitType;

  @Expose()
  @ApiProperty({ enum: TaskStatus })
  status: TaskStatus;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  assignedTo: TaskUserDto | null;

  constructor(partial: Partial<SubtaskSummaryDto>) {
    Object.assign(this, partial);
  }
}

export class TaskResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Unique identifier (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Recipe ID' })
  recipeId: string;

  @Expose()
  @ApiProperty({ description: 'Scale factor relative to recipe base yield', example: 2.5 })
  scaleFactor: number;

  @Expose()
  @ApiProperty({ description: 'Target quantity to produce', example: 5 })
  targetQuantity: number;

  @Expose()
  @ApiProperty({ description: 'Unit for the target quantity', enum: UnitType })
  targetUnit: UnitType;

  @Expose()
  @ApiProperty({ description: 'Current task status', enum: TaskStatus })
  status: TaskStatus;

  @Expose()
  @ApiProperty({ description: 'Priority (higher = more urgent)', example: 0 })
  priority: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Planned production start date', nullable: true })
  plannedDate: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Delivery deadline', nullable: true })
  dueDate: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Additional notes', nullable: true })
  notes: string | null;

  @Expose()
  @ApiProperty({ description: 'Creator user ID' })
  createdById: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Assigned user ID', nullable: true })
  assignedToId: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'When the task was started', nullable: true })
  startedAt: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'When the task was completed', nullable: true })
  completedAt: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'When the task was cancelled', nullable: true })
  cancelledAt: Date | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Cancellation reason', nullable: true })
  cancelReason: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Shortage details when task is BLOCAT', nullable: true })
  shortages: any[] | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Actual yield produced', nullable: true, example: 4.5 })
  actualYield: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Absolute variance (actualYield - targetQuantity)',
    nullable: true,
  })
  varianceAbsolute: number | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Percentage variance', nullable: true })
  variancePercent: number | null;

  @Expose()
  @ApiProperty({ description: 'Recipe name' })
  recipeName: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Custom task name; null = the recipe name', nullable: true })
  title: string | null;

  @Expose()
  @ApiProperty({ description: 'What to show as the task name: title when set, else recipeName' })
  displayName: string;

  @Expose()
  @ApiProperty({
    description: 'Who sees the task besides managers/admins',
    enum: TaskVisibility,
  })
  visibility: TaskVisibility;

  @Expose()
  @ApiProperty({ description: 'Extra viewers when visibility = SELECTED', type: [String] })
  visibleToIds: string[];

  @Expose()
  @ApiPropertyOptional({ description: 'Production location ID', nullable: true })
  locationId: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Production location name', nullable: true })
  locationName: string | null;

  @Expose()
  @ApiProperty({ description: 'Creator user info' })
  createdBy: TaskUserDto;

  @Expose()
  @ApiPropertyOptional({ description: 'Assigned user info', nullable: true })
  assignedTo: TaskUserDto | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Parent task ID (null for top-level tasks)', nullable: true })
  parentTaskId: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Shared ID of the task family created together via POST /tasks/multi',
    nullable: true,
  })
  groupId: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'User-facing name of the task family (e.g. "Sosuri înghețată")',
    nullable: true,
  })
  groupLabel: string | null;

  @Expose()
  @ApiProperty({
    description: 'Auto-generated subtasks for semipreparate ingredients',
    type: [SubtaskSummaryDto],
  })
  subtasks: SubtaskSummaryDto[];

  @Expose()
  @ApiProperty({ description: 'Status change history', type: [TaskStatusHistoryDto] })
  statusHistory: TaskStatusHistoryDto[];

  @Expose()
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  constructor(partial: Partial<TaskResponseDto>) {
    Object.assign(this, partial);
  }
}
