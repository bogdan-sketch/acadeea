import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { RecipeType, UnitType } from '@prisma/client';

/// Per-location stock of a produced recipe (FINAL produs finit / SEMIPREPARAT).
export class LocationRecipeStockResponseDto {
  @Expose()
  @ApiProperty({ description: 'RecipeStock record ID' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Location ID' })
  locationId: string;

  @Expose()
  @ApiProperty({ description: 'Recipe ID' })
  recipeId: string;

  @Expose()
  @ApiProperty({ description: 'Recipe name' })
  recipeName: string;

  @Expose()
  @ApiProperty({ description: 'FINAL (produs finit) or SEMIPREPARAT', enum: RecipeType })
  recipeType: RecipeType;

  @Expose()
  @ApiPropertyOptional({ description: 'Recipe category (null = Misc)', nullable: true })
  category: string | null;

  @Expose()
  @ApiProperty({ description: 'Recipe yield unit', enum: UnitType })
  unit: UnitType;

  @Expose()
  @ApiProperty({ description: 'Quantity at this location' })
  quantity: number;

  @Expose()
  @ApiProperty({ description: 'Reserved quantity at this location' })
  reservedCount: number;

  @Expose()
  @ApiProperty({
    description: 'Earliest expiry of the batches in stock (null = untracked)',
    nullable: true,
  })
  expiryDate: Date | null;

  @Expose()
  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;

  constructor(partial: Partial<LocationRecipeStockResponseDto>) {
    Object.assign(this, partial);
  }
}
