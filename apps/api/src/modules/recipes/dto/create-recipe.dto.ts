import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
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

export class CreateRecipeIngredientDto {
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

  @ApiProperty({
    description: 'Display name of the ingredient',
    example: 'Faina alba 000',
  })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    description: 'Quantity of the ingredient',
    example: 500,
  })
  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  quantity: number;

  @ApiProperty({
    description: 'Unit of measurement for the ingredient',
    enum: UnitType,
    example: 'GRAME',
  })
  @IsEnum(UnitType)
  unit: UnitType;

  @ApiPropertyOptional({
    description: 'Preparation method (e.g. "topit", "cernut")',
    example: 'cernut',
  })
  @IsOptional()
  @IsString()
  prepMethod?: string;

  @ApiProperty({
    description: 'Sort order within the component',
    example: 1,
  })
  @IsInt()
  @Type(() => Number)
  @Min(0)
  sortOrder: number;
}

export class CreateRecipeComponentDto {
  @ApiProperty({
    description: 'Name of the component group (e.g. "Blat", "Crema")',
    example: 'Blat',
  })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    description: 'Sort order within the recipe',
    example: 1,
  })
  @IsInt()
  @Type(() => Number)
  @Min(0)
  sortOrder: number;

  @ApiProperty({
    description: 'Ingredients within this component',
    type: [CreateRecipeIngredientDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeIngredientDto)
  ingredients: CreateRecipeIngredientDto[];
}

export class CreateRecipeDto {
  @ApiProperty({
    description: 'Name of the recipe',
    example: 'Tort de ciocolata',
  })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    description: 'Unit of measurement for the recipe yield',
    enum: UnitType,
    example: 'BUCATI',
  })
  @IsEnum(UnitType)
  unit: UnitType;

  @ApiPropertyOptional({
    description: 'Quantity per piece (e.g. weight of one cake)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  quantityPerPiece?: number;

  @ApiProperty({
    description: 'Total yield quantity of the recipe',
    example: 12,
  })
  @IsNumber()
  @Type(() => Number)
  @IsPositive()
  yieldQuantity: number;

  @ApiPropertyOptional({
    description:
      'Finished-batch weight in grams AFTER preparation (e.g. baking water loss). Used as the ' +
      'nutrition per-100g denominator when set; otherwise the summed raw ingredient weight is used.',
    example: 1400,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  finishedWeightGrams?: number;

  @ApiPropertyOptional({
    description:
      'What one yield unit (bucată) is equivalent to, when the yield is counted in BUCATI ' +
      '(e.g. 2 with pieceEquivalentUnit=KILOGRAME means 1 bucată = 2 kg). Lets this semipreparat ' +
      'be used as an ingredient in another unit/family.',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  pieceEquivalentQuantity?: number;

  @ApiPropertyOptional({
    description: 'Unit of the piece equivalent (see pieceEquivalentQuantity).',
    enum: UnitType,
    example: 'KILOGRAME',
  })
  @IsOptional()
  @IsEnum(UnitType)
  pieceEquivalentUnit?: UnitType;

  @ApiPropertyOptional({
    description: 'Type of recipe',
    enum: RecipeType,
    example: 'FINAL',
    default: 'FINAL',
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
    description: 'Flavor labels',
    example: ['ciocolata', 'vanilie'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  flavors?: string[];

  @ApiPropertyOptional({
    description:
      'Create the recipe as a draft (work-in-progress): hidden from default ' +
      'listings/pickers and blocked from production/orders/stock until published.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;

  @ApiPropertyOptional({
    description:
      'Mark this recipe as a byproduct: a SEMIPREPARAT left over after producing ' +
      'another recipe (e.g. trimmings). Forces type=SEMIPREPARAT.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isByproduct?: boolean;

  @ApiPropertyOptional({
    description:
      'UUID of the recipe this byproduct is left over from. Only valid together ' +
      'with isByproduct=true.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('all')
  sourceRecipeId?: string;

  @ApiPropertyOptional({
    description: 'Ingredient components (groups of ingredients)',
    type: [CreateRecipeComponentDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeComponentDto)
  components?: CreateRecipeComponentDto[];
}
