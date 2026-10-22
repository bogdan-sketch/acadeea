import { ApiProperty } from '@nestjs/swagger';

/** One editable-field difference between the uploaded sheet and the DB. */
export class StockImportChangeDto {
  @ApiProperty({ description: 'Raw material / consumable ID', format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Item name (from the DB, not the sheet)' })
  name: string;

  @ApiProperty({
    description: 'Editable field that differs',
    enum: ['stockCount', 'purchasePrice', 'minimumStock'],
  })
  field: 'stockCount' | 'purchasePrice' | 'minimumStock';

  @ApiProperty({ description: 'Current DB value', nullable: true, type: Number })
  from: number | null;

  @ApiProperty({ description: 'Value from the uploaded sheet', type: Number })
  to: number;

  constructor(partial: Partial<StockImportChangeDto>) {
    Object.assign(this, partial);
  }
}

export class StockImportResultDto {
  @ApiProperty({ type: [StockImportChangeDto] })
  changes: StockImportChangeDto[];

  @ApiProperty({
    description: 'IDs present in the sheet but not found in this organization',
    type: [String],
  })
  unknownIds: string[];

  @ApiProperty({ description: 'Number of matched rows with no differences' })
  unchanged: number;

  @ApiProperty({ description: 'False for a dry run; true when the changes were written' })
  applied: boolean;

  constructor(partial: Partial<StockImportResultDto>) {
    Object.assign(this, partial);
  }
}
