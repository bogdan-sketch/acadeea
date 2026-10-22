import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class OrderStatsQueryDto {
  @ApiPropertyOptional({ description: 'Filter from date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

class DeliveryPointCountDto {
  @ApiProperty()
  deliveryPoint: string;

  @ApiProperty()
  count: number;
}

export class OrderStatsResponseDto {
  @ApiProperty({ description: 'Total number of orders' })
  totalOrders: number;

  @ApiProperty({ description: 'Completed (LIVRATA) orders' })
  completedOrders: number;

  @ApiProperty({ description: 'Order counts by status', example: { NOUA: 3 } })
  statusCounts: Record<string, number>;

  @ApiProperty({ description: 'Order counts by delivery point', type: [DeliveryPointCountDto] })
  deliveryPointCounts: DeliveryPointCountDto[];
}
