import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType, OrderFulfillmentType } from '@prisma/client';

export class CreateOrderItemDto {
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

  @ApiPropertyOptional({ description: 'Notes for this item' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderDto {
  @ApiProperty({
    description: 'Delivery point name',
    example: 'Hotel Marriott',
  })
  @IsString()
  @MinLength(1)
  deliveryPoint: string;

  @ApiPropertyOptional({
    description: 'Fulfillment type: DELIVERY (driver) or PICKUP (customer collects)',
    enum: OrderFulfillmentType,
  })
  @IsOptional()
  @IsEnum(OrderFulfillmentType)
  fulfillmentType?: OrderFulfillmentType;

  @ApiPropertyOptional({ description: 'Pickup location ID (for PICKUP orders)' })
  @IsOptional()
  @IsUUID()
  pickupLocationId?: string;

  @ApiPropertyOptional({ description: 'Delivery address' })
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: 'Order notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Delivery person user ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Due date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ description: 'Order items', type: [CreateOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
