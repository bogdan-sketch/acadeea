import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
  MinLength,
  ValidateNested,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType, RecipeType } from '@prisma/client';

export class UpdateRecipeIngredientDto {
  @ApiPropertyOptional({
    description: 'UUID of the raw material (XOR with semipreparatRecipeId)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('all')
  rawMaterialId?: string;

  @ApiPropertyOptional({
    description: 'UUID of the semipreparat recipe (XOR with rawMaterialId)',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID('all')
  semipreparatRecipeId?: string;

  @ApiPropertyOptional({
    description: 'Display name of the ingredient',
    example: 'Faina alba 000',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    description: 'Quantity of the ingredient',
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Unit of measurement for the ingredient',
    enum: UnitType,
    example: 'GRAME',
  })
  @IsOptional()
  @IsEnum(UnitType)
  unit?: UnitType;

  @ApiPropertyOptional({
    description: 'Preparation method (e.g. "topit", "cernut")',
    example: 'cernut',
  })
  @IsOptional()
  @IsString()
  prepMethod?: string;

  @ApiPropertyOptional({
    description: 'Sort order within the component',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  sortOrder?: number;
}

export class UpdateRecipeComponentDto {
  @ApiPropertyOptional({
    description: 'Name of the component group (e.g. "Blat", "Crema")',
    example: 'Blat',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    description: 'Sort order within the recipe',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Ingredients within this component',
    type: [UpdateRecipeIngredientDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecipeIngredientDto)
  ingredients?: UpdateRecipeIngredientDto[];
}

export class UpdateRecipeDto {
  @ApiPropertyOptional({
    description: 'Name of the recipe',
    example: 'Tort de ciocolata',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    description: 'Unit of measurement for the recipe yield',
    enum: UnitType,
    example: 'BUCATI',
  })
  @IsOptional()
  @IsEnum(UnitType)
  unit?: UnitType;

  @ApiPropertyOptional({
    description: 'Quantity per piece (e.g. weight of one cake)',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  quantityPerPiece?: number;

  @ApiPropertyOptional({
    description: 'Total yield quantity of the recipe',
    example: 12,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  yieldQuantity?: number;

  @ApiPropertyOptional({
    description:
      'Finished-batch weight in grams AFTER preparation (baking water loss). Nutrition per-100g ' +
      'denominator when set. Send null/0 to clear and fall back to raw ingredient weight.',
    example: 1400,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  finishedWeightGrams?: number | null;

  @ApiPropertyOptional({
    description:
      'What one yield unit (bucată) is equivalent to, when yield is counted in BUCATI ' +
      '(e.g. 2 kg per bucată). Send null/0 to clear the bridge.',
    example: 2,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  pieceEquivalentQuantity?: number | null;

  @ApiPropertyOptional({
    description: 'Unit of the piece equivalent (see pieceEquivalentQuantity).',
    enum: UnitType,
    example: 'KILOGRAME',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(UnitType)
  pieceEquivalentUnit?: UnitType | null;

  @ApiPropertyOptional({
    description: 'Type of recipe',
    enum: RecipeType,
    example: 'FINAL',
  })
  @IsOptional()
  @IsEnum(RecipeType)
  type?: RecipeType;

  @ApiPropertyOptional({
    description: 'Recipe category (free-text, admin-managed)',
    example: 'TORTURI',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Estimated production waste/loss percentage (0-100)',
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  estimatedLossPercent?: number;

  @ApiPropertyOptional({
    description: 'Shelf life of the produced good, in months (1/2/3/6/12 or custom)',
    example: 3,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(1)
  @Max(120)
  shelfLifeMonths?: number;

  @ApiPropertyOptional({
    description: 'Selling price (pret de vanzare)',
    example: 150.0,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({
    description: 'Flavor labels',
    example: ['ciocolata', 'vanilie'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  flavors?: string[];

  @ApiPropertyOptional({
    description: 'Ingredient components (full replacement)',
    type: [UpdateRecipeComponentDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateRecipeComponentDto)
  components?: UpdateRecipeComponentDto[];
}
