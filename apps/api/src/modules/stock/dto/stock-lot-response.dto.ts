import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class StockLotResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  rawMaterialId: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  consumableId: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  materialTitle: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  unit: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  lotNumber: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  barcode: string | null;

  @Expose()
  @ApiProperty()
  quantity: number;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  expiryDate: Date | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  purchasePrice: number | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  supplier: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  supplierInvoice: string | null;

  @Expose()
  @ApiProperty()
  receivedAt: Date;

  @Expose()
  @ApiProperty({ description: "What's left of this intake (FIFO)" })
  remainingQuantity: number;

  @Expose()
  @ApiProperty({
    description: 'Held back from FIFO — production consumes every other lot first.',
  })
  onHold: boolean;

  constructor(partial: Partial<StockLotResponseDto>) {
    Object.assign(this, partial);
  }
}

export class SetLotHoldDto {
  @ApiProperty({ description: 'true = hold the lot back from FIFO; false = release' })
  @IsBoolean()
  onHold: boolean;
}

export class LowStockItemDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  title: string;

  @Expose()
  @ApiProperty()
  type: 'raw_material' | 'consumable';

  @Expose()
  @ApiProperty()
  currentStock: number;

  @Expose()
  @ApiProperty()
  minimumStock: number;

  @Expose()
  @ApiProperty()
  unit: string;

  constructor(partial: Partial<LowStockItemDto>) {
    Object.assign(this, partial);
  }
}

export class ExpiringItemDto {
  @Expose()
  @ApiProperty()
  lotId: string;

  @Expose()
  @ApiProperty()
  materialTitle: string;

  @Expose()
  @ApiProperty()
  quantity: number;

  @Expose()
  @ApiProperty()
  expiryDate: Date;

  @Expose()
  @ApiProperty()
  daysUntilExpiry: number;

  @Expose()
  @ApiProperty({ description: 'Unit of the quantity' })
  unit: string;

  @Expose()
  @ApiProperty({
    description: "Item kind: 'MATERIE' (raw/consumable lot) or 'PRODUS' (produced recipe stock)",
  })
  itemType: string;

  @Expose()
  @ApiProperty({ description: 'Location holding the stock (produced goods only)', nullable: true })
  locationName: string | null;

  constructor(partial: Partial<ExpiringItemDto>) {
    Object.assign(this, partial);
  }
}
