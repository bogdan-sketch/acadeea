import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';
import { QueryBoolean } from '@/common/transforms/query-boolean';
import { ORDER_VIEWS, OrderView } from '../order-views';

export class OrderQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by status', enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Filter by assigned delivery person' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Search by order number or delivery point' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by delivery point' })
  @IsOptional()
  @IsString()
  deliveryPoint?: string;

  @ApiPropertyOptional({ description: 'Filter from date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description:
      'Archive filter: omitted/false → only active orders (the default everywhere), ' +
      'true → only archived orders.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  // Map only the two valid string literals; anything else stays as-is so
  // @IsBoolean can 400 it (a bare `=== 'true'` would silently coerce
  // `?archived=yes` to false).
  @QueryBoolean()
  archived?: boolean;

  @ApiPropertyOptional({
    description:
      'Shop delivery method (exact name as imported — one of the " + "-joined parts of Order.deliveryMethod)',
    example: 'Livrare în Cluj-Napoca',
  })
  @IsOptional()
  @IsString()
  deliveryMethod?: string;

  @ApiPropertyOptional({
    description:
      'intrari (default) = newest placed first; livrari = by delivery day, furthest in the future first (no due date = today)',
    enum: ORDER_VIEWS,
    default: 'intrari',
  })
  @IsOptional()
  @IsIn(ORDER_VIEWS)
  view?: OrderView;

  @ApiPropertyOptional({
    description:
      'Ridicare (PICKUP) / Livrare (DELIVERY): orders whose shop delivery method has that kind (see GET /orders/delivery-methods)',
    enum: ['PICKUP', 'DELIVERY'],
  })
  @IsOptional()
  @IsIn(['PICKUP', 'DELIVERY'])
  deliveryKind?: 'PICKUP' | 'DELIVERY';

  @ApiPropertyOptional({
    description:
      'Several statuses, comma-separated (e.g. "NOUA,IN_PREGATIRE"); combined with `status` when both are sent',
    example: 'NOUA,IN_PREGATIRE',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : value,
  )
  @IsEnum(OrderStatus, { each: true })
  statuses?: OrderStatus[];
}
