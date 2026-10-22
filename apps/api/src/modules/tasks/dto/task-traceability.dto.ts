import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One intake lot actually consumed (FIFO) by the ingredient. */
export class TraceabilityLotDto {
  @ApiPropertyOptional({ nullable: true }) lotNumber: string | null;
  @ApiPropertyOptional({ nullable: true }) invoiceNumber: string | null;
  @ApiPropertyOptional({ nullable: true }) supplier: string | null;
  @ApiProperty({ description: 'Quantity consumed from this lot' }) quantity: number;
  @ApiPropertyOptional({ nullable: true }) expiryDate: Date | null;

  constructor(p: Partial<TraceabilityLotDto>) {
    Object.assign(this, p);
  }
}

export class TraceabilityIngredientDto {
  @ApiProperty() title: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unit: string;
  @ApiProperty({ description: '"raw_material" | "consumable"' }) kind: string;
  /** Legacy single-lot fields = the first consumed lot (kept for old clients). */
  @ApiPropertyOptional({ nullable: true }) lotNumber: string | null;
  @ApiPropertyOptional({ nullable: true }) expiryDate: Date | null;
  @ApiPropertyOptional({ nullable: true }) supplier: string | null;
  @ApiPropertyOptional({ nullable: true }) invoiceNumber: string | null;
  @ApiProperty({ type: [TraceabilityLotDto], description: 'Exact lots consumed, FIFO order' })
  lots: TraceabilityLotDto[];

  constructor(p: Partial<TraceabilityIngredientDto>) {
    Object.assign(this, p);
  }
}

export class TraceabilityHistoryDto {
  @ApiPropertyOptional({ nullable: true }) fromStatus: string | null;
  @ApiProperty() toStatus: string;
  @ApiProperty() byName: string;
  @ApiPropertyOptional({ nullable: true }) reason: string | null;
  @ApiProperty() at: Date;

  constructor(p: Partial<TraceabilityHistoryDto>) {
    Object.assign(this, p);
  }
}

export class TraceabilitySubtaskDto {
  @ApiProperty() taskId: string;
  @ApiProperty() recipeName: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unit: string;
  @ApiPropertyOptional({ nullable: true }) completedAt: Date | null;
  @ApiProperty({ type: [TraceabilityIngredientDto] }) ingredients: TraceabilityIngredientDto[];

  constructor(p: Partial<TraceabilitySubtaskDto>) {
    Object.assign(this, p);
  }
}

export class TaskTraceabilityDto {
  @ApiProperty() taskId: string;
  @ApiProperty() recipeName: string;
  @ApiProperty() recipeType: string;
  @ApiProperty() status: string;
  @ApiProperty() targetQuantity: number;
  @ApiProperty() targetUnit: string;
  @ApiPropertyOptional({ nullable: true }) actualYield: number | null;
  @ApiPropertyOptional({ nullable: true }) startedAt: Date | null;
  @ApiPropertyOptional({ nullable: true }) completedAt: Date | null;
  @ApiProperty() createdByName: string;
  @ApiPropertyOptional({ nullable: true }) assignedToName: string | null;
  @ApiPropertyOptional({ nullable: true }) notes: string | null;
  @ApiProperty({ type: [TraceabilityIngredientDto] }) ingredients: TraceabilityIngredientDto[];
  @ApiProperty({ type: [TraceabilitySubtaskDto] }) subtasks: TraceabilitySubtaskDto[];
  @ApiProperty({ type: [TraceabilityHistoryDto] }) history: TraceabilityHistoryDto[];

  constructor(p: Partial<TaskTraceabilityDto>) {
    Object.assign(this, p);
  }
}
