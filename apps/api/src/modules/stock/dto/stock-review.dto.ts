import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One difference found between the uploaded review sheet and the database. */
export class StockReviewChangeDto {
  @ApiProperty({ description: 'Sheet the row came from' })
  sheet: string;

  @ApiProperty({
    description: 'Row id from the sheet: a lot id (LOT rows) or a stock row id (STOC rows)',
  })
  id: string;

  @ApiProperty({ enum: ['LOT', 'STOC'] })
  kind: 'LOT' | 'STOC';

  @ApiProperty({ description: 'Product / material name' })
  name: string;

  @ApiPropertyOptional({ nullable: true })
  lotNumber: string | null;

  @ApiPropertyOptional({ nullable: true })
  location: string | null;

  @ApiProperty({ enum: ['quantity', 'purchasePrice', 'expiryDate', 'supplier'] })
  field: 'quantity' | 'purchasePrice' | 'expiryDate' | 'supplier';

  @ApiPropertyOptional({
    nullable: true,
    description: 'Database value before (number or ISO date / text)',
  })
  from: number | string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Sheet value (applied)' })
  to: number | string | null;

  constructor(partial: Partial<StockReviewChangeDto>) {
    Object.assign(this, partial);
  }
}

export class StockReviewResultDto {
  @ApiProperty({ type: [StockReviewChangeDto] })
  changes: StockReviewChangeDto[];

  @ApiProperty({ type: [String], description: 'Row ids in the sheet that no longer exist' })
  unknownIds: string[];

  @ApiProperty({ description: 'Rows found in the sheet that matched the database exactly' })
  unchanged: number;

  @ApiProperty({ description: 'Rows read from the sheets' })
  rowsRead: number;

  @ApiProperty({ description: 'false = dry run (nothing written)' })
  applied: boolean;

  constructor(partial: Partial<StockReviewResultDto>) {
    Object.assign(this, partial);
  }
}
