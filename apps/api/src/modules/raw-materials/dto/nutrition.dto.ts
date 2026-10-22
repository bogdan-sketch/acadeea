import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Nutrition values per 100g (solids) / 100ml (liquids) of a raw material.
 * All fields optional — fill what the label provides. Stored as JSON on
 * RawMaterial.nutrition. Feature-gated in clients by
 * Organization.nutritionEnabled.
 */
export class NutritionValuesDto {
  @ApiPropertyOptional({ description: 'kcal per 100g/ml' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  calories?: number;

  @ApiPropertyOptional({ description: 'Protein (g) per 100g/ml' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  protein?: number;

  @ApiPropertyOptional({ description: 'Carbohydrates (g) per 100g/ml' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  carbs?: number;

  @ApiPropertyOptional({ description: 'of which sugars (g) per 100g/ml' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sugars?: number;

  @ApiPropertyOptional({ description: 'Fat (g) per 100g/ml' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  fat?: number;

  @ApiPropertyOptional({ description: 'of which saturated fat (g) per 100g/ml' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  saturatedFat?: number;

  @ApiPropertyOptional({ description: 'Fiber (g) per 100g/ml' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  fiber?: number;

  @ApiPropertyOptional({ description: 'Salt (g) per 100g/ml' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  salt?: number;
}
