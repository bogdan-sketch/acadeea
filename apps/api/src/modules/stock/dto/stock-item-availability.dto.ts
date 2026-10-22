import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsOptional, IsUUID } from 'class-validator';
import { TransferStatus, UnitType } from '@prisma/client';

export class ItemAvailabilityQueryDto {
  @ApiPropertyOptional({ description: 'Raw material ID (XOR with the other two)' })
  @IsOptional()
  @IsUUID()
  rawMaterialId?: string;

  @ApiPropertyOptional({ description: 'Consumable ID (XOR with the other two)' })
  @IsOptional()
  @IsUUID()
  consumableId?: string;

  @ApiPropertyOptional({ description: 'Recipe ID (XOR with the other two)' })
  @IsOptional()
  @IsUUID()
  recipeId?: string;
}

export class ItemLocationStockDto {
  @Expose()
  @ApiProperty()
  locationId: string;

  @Expose()
  @ApiProperty()
  locationName: string;

  @Expose()
  @ApiProperty({ description: 'Quantity currently at this location' })
  quantity: number;

  @Expose()
  @ApiProperty({ description: 'Quantity reserved by in-progress tasks at this location' })
  reservedCount: number;

  constructor(partial: Partial<ItemLocationStockDto>) {
    Object.assign(this, partial);
  }
}

export class ItemPendingTransferDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty({ enum: TransferStatus })
  status: TransferStatus;

  @Expose()
  @ApiProperty()
  fromLocationId: string;

  @Expose()
  @ApiProperty()
  fromLocationName: string;

  @Expose()
  @ApiProperty()
  toLocationId: string;

  @Expose()
  @ApiProperty()
  toLocationName: string;

  @Expose()
  @ApiProperty({ description: 'Quantity of this item on the transfer' })
  quantity: number;

  @Expose()
  @ApiProperty({ enum: UnitType })
  unit: UnitType;

  constructor(partial: Partial<ItemPendingTransferDto>) {
    Object.assign(this, partial);
  }
}

/**
 * Availability snapshot for a single stock item (raw material / consumable /
 * produced recipe): per-location quantities, active task reservations, and
 * pending transfers. Powers item quick actions (transfer preselection and the
 * "item is reserved" warning before a zeroing adjustment).
 */
export class StockItemAvailabilityDto {
  @Expose()
  @ApiProperty({ description: 'Total quantity across all locations (global for consumables)' })
  totalQuantity: number;

  @Expose()
  @ApiProperty({ description: 'Total quantity reserved by in-progress tasks' })
  reservedForTasks: number;

  @Expose()
  @ApiProperty({ description: 'Number of distinct in-progress tasks holding reservations' })
  activeTaskCount: number;

  @Expose()
  @Type(() => ItemLocationStockDto)
  @ApiProperty({
    type: [ItemLocationStockDto],
    description: 'Per-location stock rows (empty for consumables — they are global)',
  })
  locations: ItemLocationStockDto[];

  @Expose()
  @Type(() => ItemPendingTransferDto)
  @ApiProperty({
    type: [ItemPendingTransferDto],
    description: 'Transfers in IN_ASTEPTARE / IN_TRANZIT containing this item',
  })
  pendingTransfers: ItemPendingTransferDto[];

  constructor(partial: Partial<StockItemAvailabilityDto>) {
    Object.assign(this, partial);
  }
}
