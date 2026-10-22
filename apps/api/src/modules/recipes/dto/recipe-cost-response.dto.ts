import { ApiProperty } from '@nestjs/swagger';

export class RecipeCostIngredientDto {
  @ApiProperty() rawMaterialId: string;
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unit: string;
  @ApiProperty() unitPrice: number | null;
  @ApiProperty() totalCost: number | null;
  /** True when this row is a semipreparat sub-recipe (its cost is the
   *  sub-recipe's calculated cost, scaled). */
  @ApiProperty() isSemipreparat: boolean;

  constructor(partial: Partial<RecipeCostIngredientDto>) {
    Object.assign(this, partial);
  }
}

export class RecipeCostResponseDto {
  @ApiProperty() recipeId: string;
  @ApiProperty() recipeName: string;
  /** Effective cost — manualCost when set, else the ingredients cost. */
  @ApiProperty() totalCost: number | null;
  /** Computed ingredients-only cost (recursive over semipreparate). */
  @ApiProperty() ingredientsCost: number | null;
  /** Manual override (labor & overheads); null = none. */
  @ApiProperty() manualCost: number | null;
  @ApiProperty() sellingPrice: number | null;
  @ApiProperty() margin: number | null;
  @ApiProperty() marginPercent: number | null;
  @ApiProperty({ type: [RecipeCostIngredientDto] })
  ingredients: RecipeCostIngredientDto[];

  constructor(partial: Partial<RecipeCostResponseDto>) {
    Object.assign(this, partial);
  }
}
