import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

/** Exactly one item id; optional [from, to] window on the row date. */
export class StockTraceabilityQueryDto {
  @ApiPropertyOptional({ description: 'Raw material ID (XOR with the other two)' })
  @IsOptional()
  @IsUUID()
  rawMaterialId?: string;

  @ApiPropertyOptional({ description: 'Consumable ID (XOR with the other two)' })
  @IsOptional()
  @IsUUID()
  consumableId?: string;

  @ApiPropertyOptional({ description: 'Recipe ID — semipreparat / produs finit (XOR)' })
  @IsOptional()
  @IsUUID()
  recipeId?: string;

  @ApiPropertyOptional({ description: 'Inclusive lower bound (ISO instant)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive upper bound (ISO instant)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class TraceabilityLotDto {
  @ApiProperty({ nullable: true, type: String }) lotNumber: string | null;
  @ApiProperty() quantity: number;
  @ApiProperty({ nullable: true, type: String }) supplierInvoice: string | null;
}

export class TraceabilityRowDto {
  @ApiProperty({
    enum: ['CONSUMED', 'RESERVED', 'PRODUCED'],
    description:
      'CONSUMED = used by a finalized task (IESIRE_PRODUCTIE); RESERVED = held by a task not ' +
      'finalized yet; PRODUCED = the task made this recipe (INTRARE_PRODUCTIE)',
  })
  kind: 'CONSUMED' | 'RESERVED' | 'PRODUCED';

  @ApiProperty({ description: 'Consumption / production time; planned date for RESERVED' })
  date: string;

  @ApiProperty() taskId: string;
  @ApiProperty({ description: 'Custom task title, else the recipe name' }) taskName: string;
  @ApiProperty() recipeName: string;
  @ApiProperty() taskStatus: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unit: string;
  @ApiProperty({ nullable: true, type: String }) locationName: string | null;
  @ApiProperty({ nullable: true, type: String }) assignedToName: string | null;
  @ApiProperty({ type: [TraceabilityLotDto], description: 'Raw-material intake lots (FIFO)' })
  lots: TraceabilityLotDto[];
}

export class TraceabilityTotalsDto {
  @ApiProperty() consumed: number;
  @ApiProperty() reserved: number;
  @ApiProperty() produced: number;
  @ApiProperty() taskCount: number;
}

export class TraceabilityItemDto {
  @ApiProperty({ enum: ['RAW_MATERIAL', 'CONSUMABLE', 'RECIPE'] })
  kind: 'RAW_MATERIAL' | 'CONSUMABLE' | 'RECIPE';
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() unit: string;
}

/** "Trasabilitate produs": every task that used (or produced) one stock item. */
export class StockTraceabilityDto {
  @ApiProperty({ type: TraceabilityItemDto }) item: TraceabilityItemDto;
  @ApiProperty({ type: TraceabilityTotalsDto }) totals: TraceabilityTotalsDto;
  @ApiProperty({ type: [TraceabilityRowDto], description: 'Newest first' })
  rows: TraceabilityRowDto[];
}
