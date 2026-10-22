import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export type ActivityType =
  | 'TASK_TRANSITION'
  | 'STOCK_MOVEMENT'
  | 'ORDER_CREATED'
  | 'ORDER_STATUS'
  | 'LOW_STOCK';

export class ActivityResponseDto {
  @Expose()
  @ApiProperty({ description: 'Unique identifier' })
  id: string;

  @Expose()
  @ApiProperty({
    description: 'Activity type',
    enum: ['TASK_TRANSITION', 'STOCK_MOVEMENT', 'ORDER_CREATED', 'ORDER_STATUS', 'LOW_STOCK'],
  })
  type: ActivityType;

  @Expose()
  @ApiProperty({ description: 'Activity title', example: 'Tort Ciocolata — inceput' })
  title: string;

  @Expose()
  @ApiProperty({ description: 'Activity description', example: 'Ion a trecut taskul in lucru' })
  description: string;

  @Expose()
  @ApiProperty({ description: 'When the activity occurred' })
  timestamp: Date;

  @Expose()
  @ApiPropertyOptional({ description: 'Additional metadata' })
  metadata: {
    taskId?: string;
    orderId?: string;
    materialId?: string;
    userId?: string;
    userName?: string;
  };

  constructor(partial: Partial<ActivityResponseDto>) {
    Object.assign(this, partial);
  }
}
