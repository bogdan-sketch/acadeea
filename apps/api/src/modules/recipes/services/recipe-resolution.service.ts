import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UnitType } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { UnitConversionsService } from '@/modules/unit-conversions';

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export interface ResolvedIngredient {
  rawMaterialId: string;
  rawMaterialTitle: string;
  quantity: number;
  unit: string;
  originalUnit: string;
  scaleFactor: number;
  sourcePath: string[];
}

export interface ResolvedRecipeTree {
  recipeId: string;
  recipeName: string;
  scaleFactor: number;
  targetQuantity: number;
  targetUnit: string;
  resolvedIngredients: ResolvedIngredient[];
  stockedSemipreparate: {
    recipeId: string;
    recipeName: string;
    quantity: number;
    unit: string;
  }[];
}

// ---------------------------------------------------------------------------
// Prisma include for loading a recipe with nested semipreparate
// ---------------------------------------------------------------------------

const RESOLUTION_INCLUDE = {
  components: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      ingredients: {
        orderBy: { sortOrder: 'asc' as const },
        include: {
          rawMaterial: true,
          semipreparatRecipe: {
            include: {
              components: {
                orderBy: { sortOrder: 'asc' as const },
                include: {
                  ingredients: {
                    orderBy: { sortOrder: 'asc' as const },
                    include: {
                      rawMaterial: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const MAX_RECURSION_DEPTH = 10;

@Injectable()
export class RecipeResolutionService {
  private readonly logger = new Logger(RecipeResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly unitConversions: UnitConversionsService,
  ) {}

  /**
   * Resolve a recipe tree into a flat list of raw-material ingredients,
   * recursively expanding inline semipreparate and collecting stocked ones.
   */
  /**
   * How many recipe batches a target is: target (converted into the recipe's
   * yield unit) / (yieldQuantity × quantityPerPiece). "2 KILOGRAME" of a
   * recipe yielding 1000 GRAME is ×2, not ×0.002. Count↔mass/volume bridges
   * through the recipe's piece equivalent. No conversion path → the target is
   * taken as-is in the yield unit (previous behaviour), with a warning.
   * The single source for every stored and resolved scale factor.
   */
  async scaleFactorFor(
    recipe: {
      name?: string;
      unit: UnitType;
      yieldQuantity: unknown;
      quantityPerPiece: unknown;
      pieceEquivalentQuantity?: unknown;
      pieceEquivalentUnit?: UnitType | null;
    },
    targetQuantity: number,
    targetUnit?: UnitType | null,
  ): Promise<number> {
    let quantity = targetQuantity;
    if (targetUnit && targetUnit !== recipe.unit) {
      const pieceEquivalent =
        recipe.pieceEquivalentQuantity != null && recipe.pieceEquivalentUnit != null
          ? { quantity: Number(recipe.pieceEquivalentQuantity), unit: recipe.pieceEquivalentUnit }
          : null;
      try {
        quantity = (
          await this.unitConversions.convertWithPieceBridge(
            targetQuantity,
            targetUnit,
            recipe.unit,
            recipe.unit,
            pieceEquivalent,
          )
        ).quantity;
      } catch {
        this.logger.warn(
          `No conversion ${targetUnit} → ${recipe.unit} for recipe "${recipe.name ?? '?'}"; ` +
            'scaling the target as-is',
        );
      }
    }
    return quantity / (Number(recipe.yieldQuantity) * Number(recipe.quantityPerPiece));
  }

  async resolveTree(
    recipeId: string,
    targetQuantity: number,
    targetUnit: UnitType,
  ): Promise<ResolvedRecipeTree> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: RESOLUTION_INCLUDE,
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${recipeId}" not found`);
    }

    const scaleFactor = await this.scaleFactorFor(recipe, targetQuantity, targetUnit);

    const resolvedIngredients: ResolvedIngredient[] = [];
    const stockedSemipreparate: ResolvedRecipeTree['stockedSemipreparate'] = [];
    const visited = new Set<string>([recipeId]);

    await this.resolveIngredients(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recipe as any,
      scaleFactor,
      [recipe.name],
      visited,
      0,
      resolvedIngredients,
      stockedSemipreparate,
    );

    // Merge duplicate raw materials (same rawMaterialId + same unit)
    const merged = this.mergeDuplicates(resolvedIngredients);

    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      scaleFactor,
      targetQuantity,
      targetUnit,
      resolvedIngredients: merged,
      stockedSemipreparate,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Recursively resolve all ingredients of a recipe, expanding inline
   * semipreparate and collecting stocked ones.
   */
  private async resolveIngredients(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recipe: any,
    scaleFactor: number,
    sourcePath: string[],
    visited: Set<string>,
    depth: number,
    resolvedIngredients: ResolvedIngredient[],
    stockedSemipreparate: ResolvedRecipeTree['stockedSemipreparate'],
  ): Promise<void> {
    if (depth > MAX_RECURSION_DEPTH) {
      throw new BadRequestException(
        `Recipe resolution exceeded maximum recursion depth of ${MAX_RECURSION_DEPTH}. ` +
          `Path: ${sourcePath.join(' > ')}`,
      );
    }

    for (const component of recipe.components ?? []) {
      for (const ingredient of component.ingredients ?? []) {
        const ingredientQuantity = Number(ingredient.quantity);
        const scaledQuantity = ingredientQuantity * scaleFactor;

        if (ingredient.rawMaterialId) {
          // Leaf node: raw material
          const rawMaterial = ingredient.rawMaterial;
          const rawMaterialTitle = rawMaterial?.title ?? ingredient.name;
          const originalUnit = ingredient.unit as string;

          // Try to convert to the raw material's native unit
          let finalQuantity = scaledQuantity;
          let finalUnit = originalUnit;

          if (rawMaterial && rawMaterial.unit !== ingredient.unit) {
            try {
              const converted = await this.unitConversions.convert(
                scaledQuantity,
                ingredient.unit as UnitType,
                rawMaterial.unit as UnitType,
                ingredient.rawMaterialId,
              );
              finalQuantity = converted.quantity;
              finalUnit = converted.unit;
            } catch {
              // Conversion failed — keep original unit
              this.logger.warn(
                `Unit conversion failed for "${rawMaterialTitle}" from ${ingredient.unit} to ${rawMaterial.unit}, keeping original unit`,
              );
            }
          }

          resolvedIngredients.push({
            rawMaterialId: ingredient.rawMaterialId,
            rawMaterialTitle,
            quantity: finalQuantity,
            unit: finalUnit,
            originalUnit,
            scaleFactor,
            sourcePath: [...sourcePath, component.name],
          });
        } else if (ingredient.semipreparatRecipeId) {
          // Semipreparate ingredient — load the referenced recipe
          const subRecipe =
            ingredient.semipreparatRecipe ??
            (await this.loadRecipeWithComponents(ingredient.semipreparatRecipeId));

          if (!subRecipe) {
            throw new NotFoundException(
              `Semipreparate recipe with ID "${ingredient.semipreparatRecipeId}" not found ` +
                `(referenced by ingredient "${ingredient.name}" in ${sourcePath.join(' > ')})`,
            );
          }

          // All semipreparates are treated as stocked: deduct from recipe stock.
          // The sub-recipe's stock is tracked in its YIELD unit, so convert the
          // ingredient quantity to that unit (bridging count↔mass/volume via the
          // sub-recipe's piece equivalent, e.g. 1 bucată = 2 kg, when set).
          let semiQuantity = scaledQuantity;
          let semiUnit = subRecipe.unit as string;
          if (ingredient.unit !== subRecipe.unit) {
            const pieceEquivalent =
              subRecipe.pieceEquivalentQuantity != null && subRecipe.pieceEquivalentUnit != null
                ? {
                    quantity: Number(subRecipe.pieceEquivalentQuantity),
                    unit: subRecipe.pieceEquivalentUnit as UnitType,
                  }
                : null;
            try {
              const converted = await this.unitConversions.convertWithPieceBridge(
                scaledQuantity,
                ingredient.unit as UnitType,
                subRecipe.unit as UnitType,
                subRecipe.unit as UnitType,
                pieceEquivalent,
              );
              semiQuantity = converted.quantity;
            } catch {
              // No conversion path — fall back to the raw quantity in the
              // ingredient's unit (matches pre-bridge behaviour).
              semiUnit = ingredient.unit as string;
            }
          }

          stockedSemipreparate.push({
            recipeId: subRecipe.id,
            recipeName: subRecipe.name,
            quantity: semiQuantity,
            unit: semiUnit,
          });
        }
      }
    }
  }

  /**
   * Load a recipe with its components and ingredients for recursive resolution.
   * Used when the semipreparatRecipe was not eagerly loaded in the initial query.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadRecipeWithComponents(recipeId: string): Promise<any> {
    return this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: RESOLUTION_INCLUDE,
    });
  }

  /**
   * Merge duplicate raw materials (same rawMaterialId + same unit) by summing
   * their quantities. The first occurrence's metadata (sourcePath, etc.) is kept
   * and the sourcePath arrays are concatenated would be complex, so we keep the
   * first sourcePath as representative.
   */
  private mergeDuplicates(ingredients: ResolvedIngredient[]): ResolvedIngredient[] {
    const map = new Map<string, ResolvedIngredient>();

    for (const ingredient of ingredients) {
      const key = `${ingredient.rawMaterialId}::${ingredient.unit}`;
      const existing = map.get(key);

      if (existing) {
        existing.quantity += ingredient.quantity;
      } else {
        map.set(key, { ...ingredient });
      }
    }

    return Array.from(map.values());
  }
}
