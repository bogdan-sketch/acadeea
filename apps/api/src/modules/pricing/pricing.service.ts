import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RecipesService } from '@/modules/recipes/recipes.service';
import { RecipeMarginResponseDto, PriceHistoryResponseDto } from './dto';

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipesService: RecipesService,
  ) {}

  async getRecipeMargin(recipeId: string): Promise<RecipeMarginResponseDto> {
    // Single cost implementation lives in RecipesService.getRecipeCost —
    // unit-aware (RON/kg × grams), lot-price with material fallback, and
    // recursive over semipreparate.
    const cost = await this.recipesService.getRecipeCost(recipeId);

    return new RecipeMarginResponseDto({
      recipeId: cost.recipeId,
      recipeName: cost.recipeName,
      sellingPrice: cost.sellingPrice,
      recipeCost: cost.totalCost,
      ingredientsCost: cost.ingredientsCost,
      manualCost: cost.manualCost,
      margin: cost.margin,
      marginPercent: cost.marginPercent,
    });
  }

  /**
   * Set (or clear, with null) the manual cost override — labor & overheads
   * on top of the ingredients cost. Logged in PriceHistory as type COST.
   */
  async setManualCost(
    recipeId: string,
    manualCost: number | null,
    userId: string,
  ): Promise<RecipeMarginResponseDto> {
    const recipe = await this.prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException(`Recipe "${recipeId}" not found`);
    }

    const oldCost = recipe.manualCost != null ? Number(recipe.manualCost) : null;

    await this.prisma.$transaction([
      this.prisma.recipe.update({
        where: { id: recipeId },
        data: { manualCost },
      }),
      this.prisma.priceHistory.create({
        data: {
          recipeId,
          priceType: 'COST',
          oldPrice: oldCost ?? undefined,
          // History rows need a number — a cleared override records 0 and the
          // COST label tells the story.
          newPrice: manualCost ?? 0,
          changedById: userId,
        },
      }),
    ]);

    return this.getRecipeMargin(recipeId);
  }

  async setSellingPrice(
    recipeId: string,
    sellingPrice: number,
    userId: string,
  ): Promise<RecipeMarginResponseDto> {
    const recipe = await this.prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException(`Recipe "${recipeId}" not found`);
    }

    const oldPrice = recipe.sellingPrice ? Number(recipe.sellingPrice) : null;

    await this.prisma.$transaction([
      this.prisma.recipe.update({
        where: { id: recipeId },
        data: { sellingPrice },
      }),
      this.prisma.priceHistory.create({
        data: {
          recipeId,
          priceType: 'SELLING',
          oldPrice: oldPrice ?? undefined,
          newPrice: sellingPrice,
          changedById: userId,
        },
      }),
    ]);

    return this.getRecipeMargin(recipeId);
  }

  async getPriceHistory(query: {
    rawMaterialId?: string;
    consumableId?: string;
    recipeId?: string;
  }): Promise<PriceHistoryResponseDto[]> {
    const where: any = {};
    if (query.rawMaterialId) where.rawMaterialId = query.rawMaterialId;
    if (query.consumableId) where.consumableId = query.consumableId;
    if (query.recipeId) where.recipeId = query.recipeId;

    const records = await this.prisma.priceHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        rawMaterial: { select: { title: true, producer: true } },
        consumable: { select: { title: true } },
        recipe: { select: { name: true } },
        changedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return records.map(
      (r: any) =>
        new PriceHistoryResponseDto({
          id: r.id,
          rawMaterialId: r.rawMaterialId,
          consumableId: r.consumableId,
          recipeId: r.recipeId,
          priceType: r.priceType,
          oldPrice: r.oldPrice ? Number(r.oldPrice) : null,
          newPrice: Number(r.newPrice),
          changedById: r.changedById,
          changedByName: r.changedBy
            ? `${r.changedBy.firstName} ${r.changedBy.lastName}`.trim()
            : null,
          // The priced item's name + a disambiguating subtitle (two "Zahăr"
          // rows are told apart by the producer).
          itemName: r.rawMaterial?.title ?? r.consumable?.title ?? r.recipe?.name ?? null,
          itemSubtitle: r.rawMaterial?.producer ?? null,
          createdAt: r.createdAt,
        }),
    );
  }

  async getOrderRevenue(
    orderId: string,
  ): Promise<{ orderId: string; totalRevenue: number | null }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { recipe: { select: { sellingPrice: true } } },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${orderId}" not found`);
    }

    let totalRevenue: number | null = 0;
    for (const item of order.items) {
      if (item.recipe?.sellingPrice != null) {
        (totalRevenue as number) += Number(item.recipe.sellingPrice) * Number(item.quantity);
      } else {
        totalRevenue = null;
        break;
      }
    }

    return { orderId: order.id, totalRevenue };
  }
}
