import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemStatus, UnitType } from '@prisma/client';

export class UpdateOrderItemDto {
  @ApiPropertyOptional({ description: 'New quantity' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.01)
  quantity?: number;

  @ApiPropertyOptional({ description: 'New unit', enum: UnitType })
  @IsOptional()
  @IsEnum(UnitType)
  unit?: UnitType;

  @ApiPropertyOptional({ description: 'New item status', enum: OrderItemStatus })
  @IsOptional()
  @IsEnum(OrderItemStatus)
  status?: OrderItemStatus;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
