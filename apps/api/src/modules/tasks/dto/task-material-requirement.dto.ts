import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A single material a task will consume, scaled to its target quantity.
 * `needed` is the scaled amount actually deducted from stock (not the base
 * recipe amount); `currentStock` is the physical stock now and `stockAfter`
 * is what remains once the task is produced.
 */
export class TaskMaterialRequirementDto {
  @ApiPropertyOptional({ nullable: true, description: 'Set for raw materials' })
  rawMaterialId: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Set for stocked semipreparate' })
  recipeId: string | null;

  @ApiProperty() title: string;
  @ApiProperty() unit: string;
  @ApiProperty({ description: 'Scaled quantity needed for this task' }) needed: number;
  @ApiProperty({ description: 'Physical stock right now' }) currentStock: number;
  @ApiProperty({ description: 'Unreserved stock available now' }) available: number;
  @ApiProperty({ description: 'Stock remaining after producing this task' }) stockAfter: number;
  @ApiProperty({ description: 'Whether available stock covers the need' }) sufficient: boolean;

  constructor(p: Partial<TaskMaterialRequirementDto>) {
    Object.assign(this, p);
  }
}
