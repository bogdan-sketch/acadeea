import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { UnitType, RecipeType } from '@prisma/client';

export class RecipeIngredientResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Unique identifier (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @Expose()
  @ApiProperty({
    description: 'Parent component ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  componentId: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'UUID of the raw material',
    example: '550e8400-e29b-41d4-a716-446655440002',
    nullable: true,
  })
  rawMaterialId: string | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'UUID of the semipreparat recipe',
    example: '550e8400-e29b-41d4-a716-446655440003',
    nullable: true,
  })
  semipreparatRecipeId: string | null;

  @Expose()
  @ApiProperty({
    description: 'Display name of the ingredient',
    example: 'Faina alba 000',
  })
  name: string;

  @Expose()
  @ApiProperty({
    description: 'Quantity of the ingredient',
    example: 500,
  })
  quantity: number;

  @Expose()
  @ApiProperty({
    description: 'Unit of measurement',
    enum: UnitType,
    example: 'GRAME',
  })
  unit: UnitType;

  @Expose()
  @ApiPropertyOptional({
    description: 'Preparation method',
    example: 'cernut',
    nullable: true,
  })
  prepMethod: string | null;

  @Expose()
  @ApiProperty({
    description: 'Sort order within the component',
    example: 1,
  })
  sortOrder: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Raw material stock count (only for raw material ingredients)',
    example: 100,
    nullable: true,
  })
  rawMaterialStockCount: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Raw material reserved count (only for raw material ingredients)',
    example: 20,
    nullable: true,
  })
  rawMaterialReservedCount: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: "Raw material's stock unit (the stock count is in this unit)",
    nullable: true,
  })
  rawMaterialUnit: string | null;

  constructor(partial: Partial<RecipeIngredientResponseDto>) {
    Object.assign(this, partial);
  }
}

export class RecipeComponentResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Unique identifier (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @Expose()
  @ApiProperty({
    description: 'Parent recipe ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  recipeId: string;

  @Expose()
  @ApiProperty({
    description: 'Name of the component group',
    example: 'Blat',
  })
  name: string;

  @Expose()
  @ApiProperty({
    description: 'Sort order within the recipe',
    example: 1,
  })
  sortOrder: number;

  @Expose()
  @ApiProperty({
    description: 'Ingredients within this component',
    type: [RecipeIngredientResponseDto],
  })
  @Type(() => RecipeIngredientResponseDto)
  ingredients: RecipeIngredientResponseDto[];

  constructor(partial: Partial<RecipeComponentResponseDto>) {
    Object.assign(this, partial);
  }
}

/** Lightweight byproduct reference carried on the source recipe. */
export class RecipeByproductSummaryDto {
  @Expose()
  @ApiProperty({
    description: 'UUID of the byproduct semipreparat',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @Expose()
  @ApiProperty({
    description: 'Name of the byproduct semipreparat',
    example: 'Resturi de blat',
  })
  name: string;

  constructor(partial: Partial<RecipeByproductSummaryDto>) {
    Object.assign(this, partial);
  }
}

export class RecipeResponseDto {
  @Expose()
  @ApiProperty({
    description: 'Unique identifier (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @Expose()
  @ApiProperty({
    description: 'Name of the recipe',
    example: 'Tort de ciocolata',
  })
  name: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Photo URL',
    example: 'https://storage.example.com/recipes/tort.jpg',
    nullable: true,
  })
  photoUrl: string | null;

  @Expose()
  @ApiProperty({
    description: 'Unit of measurement for the recipe yield',
    enum: UnitType,
    example: 'BUCATI',
  })
  unit: UnitType;

  @Expose()
  @ApiProperty({
    description: 'Quantity per piece',
    example: 1,
  })
  quantityPerPiece: number;

  @Expose()
  @ApiProperty({
    description: 'Total yield quantity',
    example: 12,
  })
  yieldQuantity: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Finished-batch weight in grams after preparation (nutrition per-100g basis)',
    example: 1400,
    nullable: true,
  })
  finishedWeightGrams: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'What one yield unit (bucată) equals, when yield is in BUCATI (e.g. 2 kg/bucată)',
    example: 2,
    nullable: true,
  })
  pieceEquivalentQuantity: number | null;

  @Expose()
  @ApiPropertyOptional({
    description: 'Unit of the piece equivalent',
    enum: UnitType,
    nullable: true,
  })
  pieceEquivalentUnit: UnitType | null;

  @Expose()
  @ApiProperty({
    description: 'Type of recipe',
    enum: RecipeType,
    example: 'FINAL',
  })
  type: RecipeType;

  @Expose()
  @ApiProperty({ description: 'Units in stock (stocked semis + final products)', example: 0 })
  stockCount: number;

  @Expose()
  @ApiProperty({ description: 'Units reserved for pending tasks', example: 0 })
  reservedCount: number;

  @Expose()
  @ApiPropertyOptional({ description: 'Recipe category', nullable: true })
  category: string | null;

  @Expose()
  @ApiProperty({ description: 'Estimated production waste/loss percentage' })
  estimatedLossPercent: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Shelf life in months (null = no expiry tracking)',
    nullable: true,
  })
  shelfLifeMonths: number | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Selling price', nullable: true })
  sellingPrice: number | null;

  @Expose()
  @ApiProperty({ description: 'Flavor labels', type: [String], example: ['ciocolata', 'vanilie'] })
  flavors: string[];

  @Expose()
  @ApiProperty({
    description: 'Version number of the recipe',
    example: 1,
  })
  version: number;

  @Expose()
  @ApiProperty({
    description:
      'Archived recipes are hidden from default listings and pickers; ' +
      'they remain readable for history (tasks, orders).',
    example: false,
  })
  isArchived: boolean;

  @Expose()
  @ApiProperty({
    description: 'When the recipe was archived (null while active)',
    example: null,
    nullable: true,
  })
  archivedAt: Date | null;

  @Expose()
  @ApiProperty({
    description:
      'Draft recipes are works-in-progress: hidden from default listings/pickers ' +
      'and blocked from production, orders and stock until published.',
    example: false,
  })
  isDraft: boolean;

  @Expose()
  @ApiProperty({
    description: 'When the recipe was marked as a draft (null once published)',
    example: null,
    nullable: true,
  })
  draftedAt: Date | null;

  @Expose()
  @ApiProperty({
    description:
      'True for a byproduct: a SEMIPREPARAT left over after producing another ' +
      'recipe. Listed as its own category in ingredient pickers.',
    example: false,
  })
  isByproduct: boolean;

  @Expose()
  @ApiProperty({
    description: 'UUID of the recipe this byproduct is left over from (byproducts only)',
    example: null,
    nullable: true,
  })
  sourceRecipeId: string | null;

  @Expose()
  @ApiProperty({
    description:
      'Active byproducts left over by this recipe (id + name). Empty for recipes ' +
      'without byproducts.',
    type: [RecipeByproductSummaryDto],
  })
  @Type(() => RecipeByproductSummaryDto)
  byproducts: RecipeByproductSummaryDto[];

  @Expose()
  @ApiProperty({
    description: 'UUID of the user who created the recipe',
    example: '550e8400-e29b-41d4-a716-446655440099',
  })
  createdById: string;

  @Expose()
  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @Expose()
  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt: Date;

  @Expose()
  @ApiProperty({
    description: 'Ingredient components (with nested ingredients)',
    type: [RecipeComponentResponseDto],
  })
  @Type(() => RecipeComponentResponseDto)
  components: RecipeComponentResponseDto[];

  constructor(partial: Partial<RecipeResponseDto>) {
    Object.assign(this, partial);
  }
}
