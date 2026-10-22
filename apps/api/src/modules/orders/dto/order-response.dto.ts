import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { OrderStatus, OrderItemStatus, UnitType, OrderFulfillmentType } from '@prisma/client';

export class OrderUserDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  firstName: string;

  @Expose()
  @ApiProperty()
  lastName: string;
}

export class OrderItemResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    description: 'Null for unmapped external products (free-text label items)',
  })
  recipeId: string | null;

  @Expose()
  @ApiProperty({
    description: 'Recipe name, or the free-text label for unmapped external products',
  })
  recipeName: string;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    description: 'Free-text product name for unmapped external products',
  })
  label: string | null;

  @Expose()
  @ApiProperty()
  quantity: number;

  @Expose()
  @ApiProperty({ enum: UnitType })
  unit: UnitType;

  @Expose()
  @ApiProperty({ enum: OrderItemStatus })
  status: OrderItemStatus;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  notes: string | null;
}

export class DeliveryNoteResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  deliveryAddress: string;

  @Expose()
  @ApiProperty()
  deliveryPoint: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true, description: 'Serial number e.g. FD-20260609-001' })
  serialNumber: string | null;

  @Expose()
  @ApiProperty()
  hasSignature: boolean;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  signedByName: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  signedAt: Date | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @Expose()
  @ApiProperty()
  generatedAt: Date;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  signatureImageBase64: string | null;
}

export class OrderResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  orderNumber: string;

  @Expose()
  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @Expose()
  @ApiProperty({ enum: OrderFulfillmentType })
  fulfillmentType: OrderFulfillmentType;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  pickupLocationId: string | null;

  @Expose()
  @ApiProperty()
  deliveryPoint: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  deliveryAddress: string | null;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    description: 'Customer name (e.g. WooCommerce billing name for imported orders)',
  })
  customerName: string | null;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    description: 'Status in the external system for imported orders (e.g. "processing")',
  })
  externalStatus: string | null;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Delivery method chosen in the shop for imported orders (e.g. "Ridicare Napoca 15")',
  })
  deliveryMethod: string | null;

  @Expose()
  @ApiProperty({
    description: 'Archived orders are hidden from default lists, stats and calendar',
  })
  isArchived: boolean;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  archivedAt: Date | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  notes: string | null;

  @Expose()
  @ApiProperty()
  createdById: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  assignedToId: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  dueDate: Date | null;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  completedAt: Date | null;

  @Expose()
  @ApiProperty()
  createdBy: OrderUserDto;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  assignedTo: OrderUserDto | null;

  @Expose()
  @ApiProperty({ type: [OrderItemResponseDto] })
  items: OrderItemResponseDto[];

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  deliveryNote: DeliveryNoteResponseDto | null;

  @Expose()
  @ApiProperty()
  itemCount: number;

  @Expose()
  @ApiProperty()
  hasInvoice: boolean;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  invoiceFileName: string | null;

  constructor(partial: Partial<OrderResponseDto>) {
    Object.assign(this, partial);
  }
}
