import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class RecipeMarginResponseDto {
  @ApiProperty() recipeId: string;
  @ApiProperty() recipeName: string;
  @ApiPropertyOptional() sellingPrice: number | null;
  /** Effective cost — manualCost when set, else the ingredients cost. */
  @ApiPropertyOptional() recipeCost: number | null;
  /** Computed ingredients-only cost. */
  @ApiPropertyOptional() ingredientsCost: number | null;
  /** Manual override (labor & overheads); null = none. */
  @ApiPropertyOptional() manualCost: number | null;
  @ApiPropertyOptional() margin: number | null;
  @ApiPropertyOptional() marginPercent: number | null;

  constructor(partial: Partial<RecipeMarginResponseDto>) {
    Object.assign(this, partial);
  }
}

export class PriceHistoryResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional() rawMaterialId: string | null;
  @ApiPropertyOptional() consumableId: string | null;
  @ApiPropertyOptional() recipeId: string | null;
  @ApiProperty() priceType: string;
  @ApiPropertyOptional() oldPrice: number | null;
  @ApiProperty() newPrice: number;
  @ApiProperty() changedById: string;
  /** Full name of the user who made the change. */
  @ApiPropertyOptional() changedByName: string | null;
  /** Name of the priced item (material / consumable / recipe). */
  @ApiPropertyOptional() itemName: string | null;
  /** Disambiguating subtitle — the raw material's producer. */
  @ApiPropertyOptional() itemSubtitle: string | null;
  @ApiProperty() createdAt: Date;

  constructor(partial: Partial<PriceHistoryResponseDto>) {
    Object.assign(this, partial);
  }
}

export class SetSellingPriceDto {
  @ApiProperty()
  // Without a class-validator decorator the global whitelist +
  // forbidNonWhitelisted pipe rejects the field ("should not exist").
  @IsNumber()
  @Min(0)
  sellingPrice: number;
}

export class SetManualCostDto {
  @ApiPropertyOptional({
    description:
      'Manual cost override in RON (labor & overheads). Send null to clear ' +
      'and fall back to the computed ingredients cost.',
    nullable: true,
  })
  // Global ValidationPipe = whitelist + forbidNonWhitelisted: fara un
  // decorator class-validator campul e respins cu 400. IsOptional lasa
  // null (= sterge override-ul) sa treaca de IsNumber.
  @IsOptional()
  @IsNumber()
  @Min(0)
  manualCost: number | null;
}
