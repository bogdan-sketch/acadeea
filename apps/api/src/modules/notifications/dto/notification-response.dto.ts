import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class NotificationResponseDto {
  @Expose()
  @ApiProperty({ description: 'Unique identifier (UUID)' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Notification kind (e.g. TASK_ASSIGNED, STOCK_EXPIRING)' })
  type: string;

  @Expose()
  @ApiProperty({ description: 'Short title' })
  title: string;

  @Expose()
  @ApiProperty({ description: 'Body text' })
  body: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Arbitrary payload for client deep-links (taskId, lotId, …)',
    nullable: true,
  })
  data: unknown | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'When the notification was read (null = unread)',
    nullable: true,
  })
  readAt: Date | null;

  @Expose()
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  constructor(partial: Partial<NotificationResponseDto>) {
    Object.assign(this, partial);
  }
}
