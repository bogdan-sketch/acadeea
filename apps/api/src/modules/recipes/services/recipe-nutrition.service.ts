import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UnitType } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { RecipeResolutionService } from './recipe-resolution.service';

/** Nutrition fields tracked per material (per 100g/100ml). */
const FIELDS = [
  'calories',
  'protein',
  'carbs',
  'sugars',
  'fat',
  'saturatedFat',
  'fiber',
  'salt',
] as const;
type NutritionField = (typeof FIELDS)[number];
export type NutritionTotals = Record<NutritionField, number>;

export interface RecipeNutritionResult {
  recipeId: string;
  recipeName: string;
  yieldQuantity: number;
  yieldUnit: string;
  /** Totals for one whole batch (base yield). */
  total: NutritionTotals;
  /** total / yieldQuantity — meaningful when the yield unit is BUCATI. */
  perPiece: NutritionTotals;
  /** Per 100g (total scaled to 100g over the per100Basis weight). */
  per100g: NutritionTotals | null;
  /**
   * Denominator basis for `per100g`: 'finished' = the recipe's declared
   * finished-batch weight (EU yield factor, accounts for baking water loss);
   * 'ingredients' = summed raw ingredient weight (fallback when no finished
   * weight is set).
   */
  per100Basis: 'finished' | 'ingredients';
  /** Finished-batch weight in grams the recipe declared (null if not set). */
  finishedWeightGrams: number | null;
  /** Grams (+ml counted as g) of ingredients that had nutrition data. */
  coveredWeightGrams: number;
  /** Ingredients without nutrition data (or non-convertible units). */
  missing: { rawMaterialId: string; title: string }[];
  coveredCount: number;
  ingredientCount: number;
  /**
   * EU-14 allergens propagated from the resolved tree: the product contains
   * every allergen any of its raw materials declares. `sources` lists the
   * contributing material titles (e.g. SOIA ← Ciocolată).
   */
  allergens: { allergen: string; sources: string[] }[];
}

const MAX_EXPANSION_ROUNDS = 10;

/** Convert a quantity in a stock unit to grams/ml where possible. */
function toGrams(quantity: number, unit: string): number | null {
  switch (unit) {
    case UnitType.MILIGRAME:
      return quantity / 1000;
    case UnitType.GRAME:
    case UnitType.MILILITRI:
      return quantity;
    case UnitType.KILOGRAME:
    case UnitType.LITRI:
      return quantity * 1000;
    default:
      return null; // BUCATI etc. — no mass basis
  }
}

/**
 * Aggregated nutrition for a recipe: resolve the tree (semipreparate expanded
 * recursively down to raw materials, same approach as the requirements plan),
 * convert every ingredient quantity to grams/ml, and sum each material's
 * per-100 nutrition. Ingredients without data are reported in `missing` so the
 * result is explicit about partial coverage. Feature-gated client-side by
 * Organization.nutritionEnabled — the endpoint itself is always available.
 */
@Injectable()
export class RecipeNutritionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipeResolution: RecipeResolutionService,
  ) {}

  async forRecipe(recipeId: string): Promise<RecipeNutritionResult> {
    const recipe = await this.prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${recipeId}" not found`);
    }

    const yieldQuantity = Number(recipe.yieldQuantity) * Number(recipe.quantityPerPiece);

    // key = rawMaterialId, value = grams consumed in one base batch
    const grams = new Map<string, number>();
    const nonConvertible = new Set<string>();

    let queue: { recipeId: string; quantity: number; unit: UnitType }[] = [
      { recipeId: recipe.id, quantity: yieldQuantity, unit: recipe.unit },
    ];
    let rounds = 0;
    while (queue.length > 0) {
      if (++rounds > MAX_EXPANSION_ROUNDS) {
        throw new BadRequestException(
          `Semipreparate nesting exceeded ${MAX_EXPANSION_ROUNDS} levels — check for a recipe cycle.`,
        );
      }
      const next: typeof queue = [];
      for (const entry of queue) {
        const resolved = await this.recipeResolution.resolveTree(
          entry.recipeId,
          entry.quantity,
          entry.unit,
        );
        for (const ing of resolved.resolvedIngredients) {
          const g = toGrams(ing.quantity, ing.unit);
          if (g == null) {
            nonConvertible.add(ing.rawMaterialId);
          } else {
            grams.set(ing.rawMaterialId, (grams.get(ing.rawMaterialId) ?? 0) + g);
          }
        }
        for (const semi of resolved.stockedSemipreparate) {
          next.push({
            recipeId: semi.recipeId,
            quantity: semi.quantity,
            unit: semi.unit as UnitType,
          });
        }
      }
      queue = next;
    }

    const materialIds = [...new Set([...grams.keys(), ...nonConvertible])];
    const materials = await this.prisma.rawMaterial.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, title: true, nutrition: true, allergens: true },
    });
    const byId = new Map(materials.map((m) => [m.id, m]));

    const total = Object.fromEntries(FIELDS.map((f) => [f, 0])) as NutritionTotals;
    const missing: { rawMaterialId: string; title: string }[] = [];
    let coveredWeightGrams = 0;
    let coveredCount = 0;

    // Allergen propagation is independent of nutrition coverage: every
    // material in the tree contributes its declared allergens.
    const allergenSources = new Map<string, Set<string>>();
    for (const material of materials) {
      for (const allergen of material.allergens ?? []) {
        const sources = allergenSources.get(allergen) ?? new Set<string>();
        sources.add(material.title);
        allergenSources.set(allergen, sources);
      }
    }
    const allergens = [...allergenSources.entries()]
      .map(([allergen, sources]) => ({ allergen, sources: [...sources].sort() }))
      .sort((a, b) => a.allergen.localeCompare(b.allergen));

    for (const id of materialIds) {
      const material = byId.get(id);
      if (!material) continue;
      const g = grams.get(id);
      const nutrition = material.nutrition as Record<string, number> | null;

      if (g == null || nutrition == null || Object.keys(nutrition).length === 0) {
        missing.push({ rawMaterialId: id, title: material.title });
        continue;
      }

      coveredCount++;
      coveredWeightGrams += g;
      for (const f of FIELDS) {
        const per100 = Number(nutrition[f]);
        if (Number.isFinite(per100)) total[f] += (g / 100) * per100;
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const scale = (t: NutritionTotals, factor: number): NutritionTotals =>
      Object.fromEntries(FIELDS.map((f) => [f, round(t[f] * factor)])) as NutritionTotals;

    // Per-100g denominator: the declared finished-batch weight (EU yield
    // factor — accounts for baking water loss) when set, else the summed raw
    // ingredient weight. Using the finished weight makes per-100g correct for
    // products that lose/gain water during preparation.
    const finishedWeightGrams =
      recipe.finishedWeightGrams != null ? Number(recipe.finishedWeightGrams) : null;
    const useFinished = finishedWeightGrams != null && finishedWeightGrams > 0;
    const per100Denominator = useFinished ? finishedWeightGrams : coveredWeightGrams;

    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      yieldQuantity,
      yieldUnit: recipe.unit,
      total: scale(total, 1),
      perPiece: scale(total, yieldQuantity > 0 ? 1 / yieldQuantity : 0),
      per100g: per100Denominator > 0 ? scale(total, 100 / per100Denominator) : null,
      per100Basis: useFinished ? 'finished' : 'ingredients',
      finishedWeightGrams,
      coveredWeightGrams: round(coveredWeightGrams),
      missing,
      coveredCount,
      ingredientCount: coveredCount + missing.length,
      allergens,
    };
  }
}
