import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { categoryFilter } from './category-filter';
import { Prisma, TaskStatus, UnitType } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { runWithoutTenant } from '@/prisma/tenant-context';
import { PaginatedDto } from '@/common/dto';
import { UnitConversionsService, pricePerStockUnit } from '@/modules/unit-conversions';
import { CaslAbilityFactory } from '@/modules/auth/casl/casl-ability.factory';
import { JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import {
  CreateRecipeDto,
  UpdateRecipeDto,
  RecipeResponseDto,
  RecipeComponentResponseDto,
  RecipeIngredientResponseDto,
  RecipeQueryDto,
  RecipeYieldHistoryResponseDto,
  RecipeVersionResponseDto,
  RecipeCostResponseDto,
  RecipeCostIngredientDto,
  RecipeByproductSummaryDto,
} from './dto';

/** Prisma include clause shared across queries that need full recipe data. */
const RECIPE_INCLUDE = {
  // Active byproducts left over by this recipe — powers the form's
  // "lasă byproduct" checkbox state on every client.
  byproducts: {
    where: { isArchived: false },
    select: { id: true, name: true },
  },
  components: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      ingredients: {
        orderBy: { sortOrder: 'asc' as const },
        include: {
          rawMaterial: {
            select: { stockCount: true, reservedCount: true, unit: true },
          },
        },
      },
    },
  },
};

@Injectable()
export class RecipesService implements OnModuleInit {
  private readonly logger = new Logger(RecipesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly unitConversions: UnitConversionsService,
  ) {}

  /**
   * One-time, idempotent migration of category kinds:
   *   PRODUCT -> MATERIE_PRIMA, and RECIPE -> SEMIPREPARAT + PRODUS_FINIT.
   * Materii prime / Semipreparate / Produse finite are now separate lists.
   * Startup job (no tenant context) — iterates every organization explicitly.
   */
  async onModuleInit(): Promise<void> {
    try {
      // Startup job iterating every organization — explicit tenant bypass.
      await runWithoutTenant(async () => {
        const orgs = await this.prisma.organization.findMany({ select: { id: true } });
        for (const org of orgs) {
          await this.migrateLegacyCategoryKinds(org.id);
        }
      });
    } catch (err) {
      // Never block boot on this best-effort migration (e.g. a first boot
      // racing `migrate deploy` before new columns exist) — it re-runs on
      // the next start.
      this.logger.warn(`Skipping legacy category-kind migration (schema not ready?): ${err}`);
    }
  }

  private async migrateLegacyCategoryKinds(organizationId: string): Promise<void> {
    const legacyProduct = await this.prisma.recipeCategoryConfig.findMany({
      where: { kind: 'PRODUCT', organizationId },
    });
    for (const row of legacyProduct) {
      await this.prisma.recipeCategoryConfig.upsert({
        where: {
          organizationId_name_kind: { organizationId, name: row.name, kind: 'MATERIE_PRIMA' },
        },
        update: { isSystem: row.isSystem, sortOrder: row.sortOrder },
        create: {
          organizationId,
          name: row.name,
          kind: 'MATERIE_PRIMA',
          isSystem: row.isSystem,
          sortOrder: row.sortOrder,
        },
      });
    }
    if (legacyProduct.length) {
      await this.prisma.recipeCategoryConfig.deleteMany({
        where: { kind: 'PRODUCT', organizationId },
      });
    }

    const legacyRecipe = await this.prisma.recipeCategoryConfig.findMany({
      where: { kind: 'RECIPE', organizationId },
    });
    for (const row of legacyRecipe) {
      for (const kind of ['SEMIPREPARAT', 'PRODUS_FINIT']) {
        await this.prisma.recipeCategoryConfig.upsert({
          where: { organizationId_name_kind: { organizationId, name: row.name, kind } },
          update: {},
          create: {
            organizationId,
            name: row.name,
            kind,
            isSystem: row.isSystem,
            sortOrder: row.sortOrder,
          },
        });
      }
    }
    if (legacyRecipe.length) {
      await this.prisma.recipeCategoryConfig.deleteMany({
        where: { kind: 'RECIPE', organizationId },
      });
    }

    // Ensure the system "Materii prime" category exists under the new kind.
    await this.prisma.recipeCategoryConfig.upsert({
      where: {
        organizationId_name_kind: { organizationId, name: 'Materii prime', kind: 'MATERIE_PRIMA' },
      },
      update: { isSystem: true },
      create: {
        organizationId,
        name: 'Materii prime',
        kind: 'MATERIE_PRIMA',
        isSystem: true,
        sortOrder: 0,
      },
    });

    if (legacyProduct.length || legacyRecipe.length) {
      this.logger.log(
        `Migrated category kinds to MATERIE_PRIMA / SEMIPREPARAT / PRODUS_FINIT (org ${organizationId})`,
      );
    }
  }

  /**
   * List recipes with pagination, search, and filters.
   */
  async findAll(
    query: RecipeQueryDto,
    user?: JwtPayload,
  ): Promise<PaginatedDto<RecipeResponseDto>> {
    const { page = 1, limit = 20, search, type, category, createdById } = query;
    const skip = (page - 1) * limit;

    // Default = active only; ?archived=true flips the list to the archive.
    // Drafts are hidden by default too; ?draft=true returns the draft list.
    const where: Prisma.RecipeWhereInput = {
      isArchived: query.archived === true,
      isDraft: query.draft === true,
    };

    // Cofetar restriction: executors without `read Recipe` only see recipes
    // from their active tasks. Users who can CREATE tasks (sef-cofetar has
    // `manage Task`) must always get the full list — they need to pick a
    // recipe for a new task — so the restriction never catches them, even if
    // their org's role row drifted and lost `read Recipe`.
    if (user) {
      const ability = await this.caslAbilityFactory.createForUser({
        id: user.userId,
        role: user.role,
        organizationId: user.organizationId,
      });
      if (!ability.can('read', 'Recipe') && !ability.can('create', 'Task')) {
        const activeRecipeIds = await this.prisma.task.findMany({
          where: {
            assignedToId: user.userId,
            status: TaskStatus.IN_LUCRU,
          },
          select: { recipeId: true },
          distinct: ['recipeId'],
        });
        where.id = { in: activeRecipeIds.map((t) => t.recipeId) };
        // A cofetar must still see the recipe of a running task even if it
        // was archived or drafted mid-production.
        delete where.isArchived;
        delete where.isDraft;
      }
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    if (type) {
      where.type = type;
    }

    // Byproduct filter: omitted → all; true/false → only that side.
    if (query.byproduct !== undefined) {
      where.isByproduct = query.byproduct;
    }

    if (category) {
      // A parent category also matches its sub-categories (category dial).
      where.category = await categoryFilter(this.prisma, category);
    }

    if (createdById) {
      where.createdById = createdById;
    }

    const [recipes, total] = await Promise.all([
      this.prisma.recipe.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: RECIPE_INCLUDE,
      }),
      this.prisma.recipe.count({ where }),
    ]);

    const data = recipes.map((recipe) => this.toDto(recipe));

    return new PaginatedDto(data, total, page, limit);
  }

  /**
   * Find a single recipe by ID with all nested relations.
   * @throws NotFoundException if the recipe does not exist.
   */
  async findById(id: string, user?: JwtPayload): Promise<RecipeResponseDto> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: RECIPE_INCLUDE,
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${id}" not found`);
    }

    // Cofetar restriction: executors without `read Recipe` may only open a
    // recipe from one of their active tasks. Task creators (`create Task`,
    // e.g. sef-cofetar) are never restricted — same rule as findAll.
    if (user) {
      const ability = await this.caslAbilityFactory.createForUser({
        id: user.userId,
        role: user.role,
        organizationId: user.organizationId,
      });
      if (!ability.can('read', 'Recipe') && !ability.can('create', 'Task')) {
        const activeTask = await this.prisma.task.findFirst({
          where: {
            recipeId: id,
            assignedToId: user.userId,
            status: TaskStatus.IN_LUCRU,
          },
        });
        if (!activeTask) {
          throw new ForbiddenException('Acces permis doar la retete din task-uri active');
        }
      }
    }

    return this.toDto(recipe);
  }

  /**
   * Create a new recipe with all nested children in one request.
   * Validates the XOR constraint on ingredients (exactly one of
   * rawMaterialId or semipreparatRecipeId must be set).
   * @throws BadRequestException if the XOR constraint is violated.
   */
  async create(dto: CreateRecipeDto, userId: string): Promise<RecipeResponseDto> {
    this.validateIngredientXor(dto.components);
    await this.validateSemipreparatUnits(dto.components);

    // A byproduct is by definition a semipreparat; its optional source link
    // must point at an existing (org-scoped) recipe.
    if (dto.isByproduct && dto.type === 'FINAL') {
      throw new BadRequestException('A byproduct must be a SEMIPREPARAT, not FINAL');
    }
    if (dto.sourceRecipeId && !dto.isByproduct) {
      throw new BadRequestException('sourceRecipeId is only valid with isByproduct=true');
    }
    if (dto.sourceRecipeId) {
      const source = await this.prisma.recipe.findUnique({
        where: { id: dto.sourceRecipeId },
        select: { id: true },
      });
      if (!source) {
        throw new NotFoundException(`Source recipe "${dto.sourceRecipeId}" not found`);
      }
    }

    const recipe = await this.prisma.recipe.create({
      data: {
        name: dto.name,
        unit: dto.unit,
        quantityPerPiece: dto.quantityPerPiece ?? 1,
        yieldQuantity: dto.yieldQuantity,
        finishedWeightGrams: dto.finishedWeightGrams ?? null,
        pieceEquivalentQuantity: dto.pieceEquivalentQuantity ?? null,
        pieceEquivalentUnit: dto.pieceEquivalentUnit ?? null,
        type: dto.isByproduct ? 'SEMIPREPARAT' : (dto.type ?? 'FINAL'),
        isByproduct: dto.isByproduct ?? false,
        sourceRecipeId: dto.sourceRecipeId ?? null,
        category: dto.category,
        estimatedLossPercent: dto.estimatedLossPercent ?? 0,
        shelfLifeMonths: dto.shelfLifeMonths ?? null,
        flavors: dto.flavors ?? [],
        isDraft: dto.isDraft ?? false,
        draftedAt: dto.isDraft ? new Date() : null,
        createdById: userId,
        components: dto.components?.length
          ? {
              create: dto.components.map((comp) => ({
                name: comp.name,
                sortOrder: comp.sortOrder,
                ingredients: comp.ingredients?.length
                  ? {
                      create: comp.ingredients.map((ing) => ({
                        rawMaterialId: ing.rawMaterialId,
                        semipreparatRecipeId: ing.semipreparatRecipeId,
                        name: ing.name,
                        quantity: ing.quantity,
                        unit: ing.unit,
                        prepMethod: ing.prepMethod,
                        sortOrder: ing.sortOrder,
                      })),
                    }
                  : undefined,
              })),
            }
          : undefined,
      },
      include: RECIPE_INCLUDE,
    });

    this.logger.log(`Created recipe "${recipe.name}" (${recipe.id})`);
    await this.snapshotVersion(recipe.id, userId, recipe.version, recipe);

    return this.toDto(recipe);
  }

  /**
   * Update an existing recipe. Nested arrays use a full replacement strategy:
   * old children are deleted and new ones are created within a transaction.
   * @throws NotFoundException if the recipe does not exist.
   * @throws BadRequestException if the ingredient XOR constraint is violated.
   */
  async update(id: string, dto: UpdateRecipeDto, userId?: string): Promise<RecipeResponseDto> {
    const existing = await this.prisma.recipe.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Recipe with ID "${id}" not found`);
    }
    // Pre-edit state, in case it has to become the baseline version.
    const existingSnapshot = await this.prisma.recipe.findUnique({
      where: { id },
      include: RECIPE_INCLUDE,
    });

    if (dto.components !== undefined) {
      this.validateIngredientXor(dto.components);
      await this.validateSemipreparatUnits(dto.components);
      await this.assertNoCircularDependency(id, existing.name, dto.components);
    }

    const recipe = await this.prisma.$transaction(async (tx) => {
      // Delete old children when replacements are provided
      const deleteOps: Prisma.PrismaPromise<unknown>[] = [];

      if (dto.components !== undefined) {
        // Ingredients are cascade-deleted with their parent components
        deleteOps.push(tx.recipeComponent.deleteMany({ where: { recipeId: id } }));
      }

      if (deleteOps.length > 0) {
        await Promise.all(deleteOps);
      }

      // Build the update data for scalar fields
      const updateData: Prisma.RecipeUpdateInput = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.unit !== undefined) updateData.unit = dto.unit;
      if (dto.quantityPerPiece !== undefined) updateData.quantityPerPiece = dto.quantityPerPiece;
      if (dto.finishedWeightGrams !== undefined)
        updateData.finishedWeightGrams = dto.finishedWeightGrams || null;
      if (dto.pieceEquivalentQuantity !== undefined)
        updateData.pieceEquivalentQuantity = dto.pieceEquivalentQuantity || null;
      if (dto.pieceEquivalentUnit !== undefined)
        updateData.pieceEquivalentUnit = dto.pieceEquivalentUnit ?? null;
      if (dto.yieldQuantity !== undefined) updateData.yieldQuantity = dto.yieldQuantity;
      if (dto.type !== undefined) updateData.type = dto.type;
      if (dto.category !== undefined) updateData.category = dto.category;
      if (dto.estimatedLossPercent !== undefined)
        updateData.estimatedLossPercent = dto.estimatedLossPercent;
      if (dto.shelfLifeMonths !== undefined) updateData.shelfLifeMonths = dto.shelfLifeMonths;
      if (dto.sellingPrice !== undefined) updateData.sellingPrice = dto.sellingPrice;
      if (dto.flavors !== undefined) updateData.flavors = dto.flavors;
      // Every edit is a new version (archive/draft/photo bypass update()).
      updateData.version = { increment: 1 };

      // Create new children
      if (dto.components !== undefined && dto.components.length > 0) {
        updateData.components = {
          create: dto.components.map((comp) => ({
            name: comp.name!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
            sortOrder: comp.sortOrder!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
            ingredients: comp.ingredients?.length
              ? {
                  create: comp.ingredients.map((ing) => ({
                    rawMaterialId: ing.rawMaterialId,
                    semipreparatRecipeId: ing.semipreparatRecipeId,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    name: ing.name!,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    quantity: ing.quantity!,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    unit: ing.unit!,
                    prepMethod: ing.prepMethod,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    sortOrder: ing.sortOrder!,
                  })),
                }
              : undefined,
          })),
        };
      }

      return tx.recipe.update({
        where: { id },
        data: updateData,
        include: RECIPE_INCLUDE,
      });
    });

    this.logger.log(`Updated recipe "${recipe.name}" (${recipe.id})`);

    if (userId) {
      // Recipes edited before versioning existed have no history: keep their
      // pre-edit state as the baseline version first.
      const hasHistory = await this.prisma.recipeVersion.count({ where: { recipeId: id } });
      if (hasHistory === 0) {
        await this.snapshotVersion(id, existing.createdById, existing.version, existingSnapshot);
      }
      await this.snapshotVersion(id, userId);
    }

    return this.toDto(recipe);
  }

  /**
   * Archive / unarchive a recipe. Archived recipes disappear from every
   * default listing (and pickers) but keep their history intact — the escape
   * hatch for test/retired recipes that can't be deleted because tasks or
   * orders reference them. Deliberately bypasses `update()` so flipping the
   * flag never touches recipe versioning.
   */
  async setArchived(id: string, archived: boolean): Promise<RecipeResponseDto> {
    const existing = await this.prisma.recipe.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Recipe with ID "${id}" not found`);
    }

    const recipe = await this.prisma.recipe.update({
      where: { id },
      data: {
        isArchived: archived,
        // Keep the original archive timestamp on a repeated/retried archive.
        archivedAt: archived ? (existing.isArchived ? existing.archivedAt : new Date()) : null,
      },
      include: RECIPE_INCLUDE,
    });

    this.logger.log(`${archived ? 'Archived' : 'Unarchived'} recipe "${recipe.name}" (${id})`);

    return this.toDto(recipe);
  }

  /**
   * Mark a recipe as a draft / publish it. Draft recipes disappear from every
   * default listing (and pickers) and are blocked from production, orders and
   * stock — the work-in-progress state while the author is still editing.
   * Deliberately bypasses `update()` so flipping the flag never touches recipe
   * versioning.
   */
  async setDraft(id: string, draft: boolean): Promise<RecipeResponseDto> {
    const existing = await this.prisma.recipe.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Recipe with ID "${id}" not found`);
    }

    const recipe = await this.prisma.recipe.update({
      where: { id },
      data: {
        isDraft: draft,
        // Keep the original draft timestamp on a repeated/retried draft.
        draftedAt: draft ? (existing.isDraft ? existing.draftedAt : new Date()) : null,
      },
      include: RECIPE_INCLUDE,
    });

    this.logger.log(`${draft ? 'Drafted' : 'Published'} recipe "${recipe.name}" (${id})`);

    return this.toDto(recipe);
  }

  /**
   * Delete a recipe. Children are cascade-deleted by the database.
   * @throws NotFoundException if the recipe does not exist.
   */
  async remove(id: string): Promise<RecipeResponseDto> {
    const existing = await this.prisma.recipe.findUnique({
      where: { id },
      include: RECIPE_INCLUDE,
    });

    if (!existing) {
      throw new NotFoundException(`Recipe with ID "${id}" not found`);
    }

    // Production history (tasks) holds a RESTRICT FK on the recipe — deleting
    // it would orphan traceability. Surface a clear 400 instead of a raw 500.
    const taskCount = await this.prisma.task.count({ where: { recipeId: id } });
    if (taskCount > 0) {
      throw new BadRequestException(
        `Reteta are ${taskCount} task-uri in istoric si nu poate fi stearsa. Sterge intai task-urile de productie.`,
      );
    }
    const orderItemCount = await this.prisma.orderItem.count({ where: { recipeId: id } });
    if (orderItemCount > 0) {
      throw new BadRequestException(
        `Reteta apare in ${orderItemCount} comenzi si nu poate fi stearsa. Sterge intai comenzile.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Cleanup non-cascading references so the delete never FK-crashes.
      await tx.recipeStock.deleteMany({ where: { recipeId: id } });
      // Per-batch lots (stoc diferentiat) — same RESTRICT FK as recipeStock,
      // added alongside it in the 1.21.0 lots feature but missed here.
      await tx.recipeStockLot.deleteMany({ where: { recipeId: id } });
      await tx.recipeYieldHistory.deleteMany({ where: { recipeId: id } });
      await tx.productMapping.deleteMany({ where: { recipeId: id } });
      await tx.recipe.delete({ where: { id } });
    });

    this.logger.log(`Deleted recipe "${existing.name}" (${existing.id})`);

    return this.toDto(existing);
  }

  /**
   * Get yield history for a recipe with pagination.
   */
  async getYieldHistory(
    recipeId: string,
    query: RecipeQueryDto,
  ): Promise<PaginatedDto<RecipeYieldHistoryResponseDto>> {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const recipe = await this.prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${recipeId}" not found`);
    }

    const [records, total] = await Promise.all([
      this.prisma.recipeYieldHistory.findMany({
        where: { recipeId },
        skip,
        take: limit,
        orderBy: { recordedAt: 'desc' },
      }),
      this.prisma.recipeYieldHistory.count({ where: { recipeId } }),
    ]);

    const data = records.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) =>
        new RecipeYieldHistoryResponseDto({
          id: r.id,
          recipeId: r.recipeId,
          taskId: r.taskId,
          targetQuantity: Number(r.targetQuantity),
          actualYield: Number(r.actualYield),
          varianceAbsolute: Number(r.varianceAbsolute),
          variancePercent: Number(r.variancePercent),
          scaleFactor: Number(r.scaleFactor),
          recordedAt: r.recordedAt,
        }),
    );

    return new PaginatedDto(data, total, page, limit);
  }

  /**
   * Calculate approximate cost of a recipe from ingredient lot prices.
   */
  async getRecipeCost(recipeId: string): Promise<RecipeCostResponseDto> {
    return this.computeRecipeCost(recipeId, new Set());
  }

  /**
   * Cost calculation for a recipe. Ingredient quantities are converted to the
   * raw material's stock unit before multiplying by the price. Prices are
   * entered per commercial unit (RON/kg for mass, RON/litru for volume,
   * RON/<stock unit> otherwise) and normalized to the stock unit via
   * pricePerStockUnit — a material stocked in grams priced "6 RON/kg" costs
   * 0.006/g, not 6/g. Price source: the latest intake lot, falling back to
   * the material's purchasePrice field.
   * Semipreparat ingredients are costed recursively (sub-recipe total /
   * yield, scaled to the used quantity); `seen` guards recipe cycles. Any
   * ingredient that can't be priced/converted leaves the total at null.
   */
  private async computeRecipeCost(
    recipeId: string,
    seen: Set<string>,
  ): Promise<RecipeCostResponseDto> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        components: {
          include: {
            ingredients: {
              include: {
                rawMaterial: { include: { lots: { orderBy: { createdAt: 'desc' }, take: 1 } } },
                semipreparatRecipe: {
                  select: {
                    id: true,
                    yieldQuantity: true,
                    unit: true,
                    pieceEquivalentQuantity: true,
                    pieceEquivalentUnit: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${recipeId}" not found`);
    }

    seen.add(recipeId);

    const ingredients: RecipeCostIngredientDto[] = [];
    let totalCost: number | null = 0;

    for (const comp of recipe.components) {
      for (const ing of comp.ingredients) {
        const qty = Number(ing.quantity);
        let unitPrice: number | null = null;
        let cost: number | null = null;

        if (ing.rawMaterial) {
          // Price source: latest intake lot, else the material field. Prices
          // are entered per COMMERCIAL unit (RON/kg, RON/litru — see
          // price-unit.ts), so normalize to the stock unit before multiplying.
          const latestLot = ing.rawMaterial.lots?.[0];
          const enteredPrice = latestLot?.purchasePrice
            ? Number(latestLot.purchasePrice)
            : ing.rawMaterial.purchasePrice != null
              ? Number(ing.rawMaterial.purchasePrice)
              : null;
          const stockUnitPrice =
            enteredPrice != null ? pricePerStockUnit(enteredPrice, ing.rawMaterial.unit) : null;

          if (stockUnitPrice != null) {
            try {
              const converted = await this.unitConversions.convert(
                qty,
                ing.unit,
                ing.rawMaterial.unit,
                ing.rawMaterial.id,
              );
              cost = stockUnitPrice * converted.quantity;
              // Price expressed in the ingredient's own unit, so row math adds up.
              unitPrice = qty > 0 ? cost / qty : stockUnitPrice;
            } catch {
              this.logger.warn(
                `Recipe cost: no unit conversion ${ing.unit} -> ${ing.rawMaterial.unit} for "${ing.name}"`,
              );
            }
          }
        } else if (ing.semipreparatRecipe) {
          const semi = ing.semipreparatRecipe;
          if (!seen.has(semi.id)) {
            const subCost = await this.computeRecipeCost(semi.id, seen);
            const yieldQty = Number(semi.yieldQuantity);
            if (subCost.totalCost != null && yieldQty > 0) {
              try {
                const pieceEquivalent =
                  semi.pieceEquivalentQuantity != null && semi.pieceEquivalentUnit != null
                    ? {
                        quantity: Number(semi.pieceEquivalentQuantity),
                        unit: semi.pieceEquivalentUnit,
                      }
                    : null;
                const converted = await this.unitConversions.convertWithPieceBridge(
                  qty,
                  ing.unit,
                  semi.unit,
                  semi.unit,
                  pieceEquivalent,
                );
                cost = (subCost.totalCost / yieldQty) * converted.quantity;
                unitPrice = qty > 0 ? cost / qty : null;
              } catch {
                this.logger.warn(
                  `Recipe cost: no unit conversion ${ing.unit} -> ${semi.unit} for semipreparat "${ing.name}"`,
                );
              }
            }
          } else {
            this.logger.warn(`Recipe cost: cycle detected at semipreparat "${ing.name}"`);
          }
        }

        if (cost == null) totalCost = null;
        else if (totalCost != null) totalCost += cost;

        ingredients.push(
          new RecipeCostIngredientDto({
            rawMaterialId: ing.rawMaterialId ?? ing.semipreparatRecipeId ?? '',
            name: ing.name,
            quantity: qty,
            unit: ing.unit,
            unitPrice,
            totalCost: cost,
            isSemipreparat: !!ing.semipreparatRecipe,
          }),
        );
      }
    }

    // Manual override (labor & overheads): when set it REPLACES the computed
    // ingredients cost for margins — and propagates upward, since parent
    // recipes cost a semipreparat from THIS totalCost.
    const ingredientsCost = totalCost;
    const manualCost = recipe.manualCost != null ? Number(recipe.manualCost) : null;
    const effectiveCost = manualCost ?? ingredientsCost;

    const sellingPrice = recipe.sellingPrice ? Number(recipe.sellingPrice) : null;
    const margin =
      effectiveCost != null && sellingPrice != null ? sellingPrice - effectiveCost : null;
    const marginPercent = margin != null && sellingPrice ? (margin / sellingPrice) * 100 : null;

    return new RecipeCostResponseDto({
      recipeId: recipe.id,
      recipeName: recipe.name,
      totalCost: effectiveCost,
      ingredientsCost,
      manualCost,
      sellingPrice,
      margin,
      marginPercent,
      ingredients,
    });
  }

  /**
   * Get version history for a recipe.
   */
  async getVersionHistory(recipeId: string): Promise<RecipeVersionResponseDto[]> {
    const recipe = await this.prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${recipeId}" not found`);
    }

    const versions = await this.prisma.recipeVersion.findMany({
      where: { recipeId },
      orderBy: { version: 'desc' },
    });

    return versions.map(
      (v) =>
        new RecipeVersionResponseDto({
          id: v.id,
          recipeId: v.recipeId,
          version: v.version,
          snapshot: v.snapshot,
          changedById: v.changedById,
          createdAt: v.createdAt,
        }),
    );
  }

  /**
   * Auto-snapshot current recipe state as a new version.
   */
  /**
   * Store an immutable snapshot of the recipe under `version` (default: the
   * recipe's current Recipe.version). Idempotent per (recipeId, version).
   * Written on create (v1) and after every update (the new version).
   */
  async snapshotVersion(
    recipeId: string,
    userId: string,
    version?: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snapshot?: any,
  ): Promise<void> {
    const recipe =
      snapshot ??
      (await this.prisma.recipe.findUnique({
        where: { id: recipeId },
        include: RECIPE_INCLUDE,
      }));
    if (!recipe) return;

    const v = version ?? recipe.version;
    await this.prisma.recipeVersion.upsert({
      where: { recipeId_version: { recipeId, version: v } },
      update: {},
      create: {
        recipeId,
        version: v,
        snapshot: JSON.parse(JSON.stringify(recipe)),
        changedById: userId,
      },
    });
  }

  /**
   * Validate the XOR constraint: each ingredient must reference exactly one
   * of rawMaterialId or semipreparatRecipeId, not both and not neither.
   */
  private validateIngredientXor(
    components?: {
      ingredients?: { rawMaterialId?: string; semipreparatRecipeId?: string; name?: string }[];
    }[],
  ): void {
    if (!components) return;

    for (const component of components) {
      if (!component.ingredients) continue;

      for (const ingredient of component.ingredients) {
        const hasRawMaterial = !!ingredient.rawMaterialId;
        const hasSemipreparat = !!ingredient.semipreparatRecipeId;

        if (hasRawMaterial === hasSemipreparat) {
          throw new BadRequestException(
            `Ingredient "${ingredient.name}" must reference exactly one of rawMaterialId or semipreparatRecipeId, not ${hasRawMaterial ? 'both' : 'neither'}.`,
          );
        }
      }
    }
  }

  /**
   * Reject a recipe that would (transitively) contain itself — used directly
   * as its own semipreparat, or reached again through a chain of
   * semipreparate (A → B → A). Cost and resolution can't terminate on such a
   * tree, so refuse it at save time with RECIPE_001. Only an UPDATE can close
   * a loop: a recipe being created has no id anyone could reference yet.
   */
  private async assertNoCircularDependency(
    recipeId: string,
    recipeName: string,
    components: { ingredients?: { semipreparatRecipeId?: string }[] }[],
  ): Promise<void> {
    const direct = new Set<string>();
    for (const component of components) {
      for (const ing of component.ingredients ?? []) {
        if (ing.semipreparatRecipeId) direct.add(ing.semipreparatRecipeId);
      }
    }
    if (direct.size === 0) return;

    // BFS over the SAVED sub-recipe trees; `via` keeps the path for the message.
    const via = new Map<string, string | null>();
    const queue: string[] = [];
    for (const semiId of direct) {
      via.set(semiId, null);
      queue.push(semiId);
    }
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (current === recipeId) {
        const chain: string[] = [];
        for (
          let node: string | null = via.get(current) ?? null;
          node;
          node = via.get(node) ?? null
        ) {
          chain.unshift(node);
        }
        const names = await this.prisma.recipe.findMany({
          where: { id: { in: chain } },
          select: { id: true, name: true },
        });
        const nameOf = new Map(names.map((r) => [r.id, r.name]));
        const path = [recipeName, ...chain.map((cid) => nameOf.get(cid) ?? cid), recipeName];
        throw new BadRequestException({
          statusCode: 400,
          errorCode: 'RECIPE_001',
          message:
            chain.length === 0
              ? `Rețeta „${recipeName}” nu poate fi folosită ca ingredient în ea însăși.`
              : `Dependență circulară: rețeta „${recipeName}” ajunge să se conțină pe ea însăși ` +
                `(${path.join(' → ')}). Scoate semipreparatul care închide bucla.`,
        });
      }
      const children = await this.prisma.recipeIngredient.findMany({
        where: { component: { recipeId: current }, semipreparatRecipeId: { not: null } },
        select: { semipreparatRecipeId: true },
      });
      for (const child of children) {
        const childId = child.semipreparatRecipeId as string;
        if (!via.has(childId)) {
          via.set(childId, current);
          queue.push(childId);
        }
      }
    }
  }

  /**
   * Reject semipreparat ingredients whose unit can't be converted to the
   * sub-recipe's yield unit — cost and stock math would silently produce "—"
   * later (e.g. a sub-recipe yielding BUCATI used as "2 GRAME"). Failing at
   * save time with a clear message beats a mystery null cost at read time.
   */
  private async validateSemipreparatUnits(
    components?: {
      ingredients?: { semipreparatRecipeId?: string; name?: string; unit?: string }[];
    }[],
  ): Promise<void> {
    if (!components) return;
    for (const component of components) {
      for (const ing of component.ingredients ?? []) {
        if (!ing.semipreparatRecipeId || !ing.unit) continue;
        const semi = await this.prisma.recipe.findUnique({
          where: { id: ing.semipreparatRecipeId },
          select: {
            name: true,
            unit: true,
            pieceEquivalentQuantity: true,
            pieceEquivalentUnit: true,
          },
        });
        if (!semi || semi.unit === ing.unit) continue;
        const pieceEquivalent =
          semi.pieceEquivalentQuantity != null && semi.pieceEquivalentUnit != null
            ? { quantity: Number(semi.pieceEquivalentQuantity), unit: semi.pieceEquivalentUnit }
            : null;
        try {
          await this.unitConversions.convertWithPieceBridge(
            1,
            ing.unit as UnitType,
            semi.unit,
            semi.unit,
            pieceEquivalent,
          );
        } catch {
          throw new BadRequestException(
            `Ingredientul "${ing.name ?? semi.name}" este exprimat în ${ing.unit}, dar rețeta ` +
              `"${semi.name}" are randamentul în ${semi.unit} și nu există o conversie între ele. ` +
              `Setează cât reprezintă o bucată din "${semi.name}" (ex: 1 bucată = 2 kg) în rețeta ` +
              `semipreparatului, sau folosește ${semi.unit}.`,
          );
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(recipe: any): RecipeResponseDto {
    return new RecipeResponseDto({
      ...recipe,
      quantityPerPiece: Number(recipe.quantityPerPiece),
      yieldQuantity: Number(recipe.yieldQuantity),
      finishedWeightGrams:
        recipe.finishedWeightGrams != null ? Number(recipe.finishedWeightGrams) : null,
      pieceEquivalentQuantity:
        recipe.pieceEquivalentQuantity != null ? Number(recipe.pieceEquivalentQuantity) : null,
      pieceEquivalentUnit: recipe.pieceEquivalentUnit ?? null,
      estimatedLossPercent: Number(recipe.estimatedLossPercent ?? 0),
      shelfLifeMonths: recipe.shelfLifeMonths ?? null,
      sellingPrice: recipe.sellingPrice ? Number(recipe.sellingPrice) : null,
      isByproduct: recipe.isByproduct ?? false,
      sourceRecipeId: recipe.sourceRecipeId ?? null,
      byproducts:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recipe.byproducts?.map((b: any) => new RecipeByproductSummaryDto(b)) ?? [],
      components: recipe.components?.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (comp: any) =>
          new RecipeComponentResponseDto({
            ...comp,
            ingredients: comp.ingredients?.map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (ing: any) =>
                new RecipeIngredientResponseDto({
                  ...ing,
                  quantity: Number(ing.quantity),
                  rawMaterialStockCount: ing.rawMaterial
                    ? Number(ing.rawMaterial.stockCount)
                    : null,
                  rawMaterialReservedCount: ing.rawMaterial
                    ? Number(ing.rawMaterial.reservedCount)
                    : null,
                  rawMaterialUnit: ing.rawMaterial ? ing.rawMaterial.unit : null,
                }),
            ),
          }),
      ),
    });
  }

  // ──────────────────────────────────────────────
  // Dynamic Categories (backed by RecipeCategoryConfig table)
  // ──────────────────────────────────────────────

  /**
   * Re-tag the entities that reference a category when it is renamed/removed.
   * RECIPE categories live on Recipe.category; PRODUCT categories on
   * RawMaterial.category + Consumable.category.
   */
  private retagCategory(
    kind: string,
    oldName: string,
    newName: string | null,
  ): Prisma.PrismaPromise<unknown>[] {
    if (kind === 'MATERIE_PRIMA') {
      return [
        this.prisma.rawMaterial.updateMany({
          where: { category: oldName },
          data: { category: newName },
        }),
        this.prisma.consumable.updateMany({
          where: { category: oldName },
          data: { category: newName },
        }),
      ];
    }
    if (kind === 'SEMIPREPARAT') {
      return [
        this.prisma.recipe.updateMany({
          where: { category: oldName, type: 'SEMIPREPARAT' },
          data: { category: newName },
        }),
      ];
    }
    if (kind === 'PRODUS_FINIT') {
      return [
        this.prisma.recipe.updateMany({
          where: { category: oldName, type: 'FINAL' },
          data: { category: newName },
        }),
      ];
    }
    return [];
  }

  /** Get admin-managed categories for a kind (RECIPE | PRODUCT). */
  async getCategories(kind = 'RECIPE'): Promise<string[]> {
    const rows = await this.prisma.recipeCategoryConfig.findMany({
      where: { kind },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => r.name);
  }

  /**
   * Recipes per category (active, non-draft), optionally for one type — the
   * bento dial sizes/hides its tiles by these. Uncategorized recipes count
   * under "" (the clients show them as Misc).
   */
  async getCategoryCounts(type?: string): Promise<Record<string, number>> {
    const rows = await this.prisma.recipe.groupBy({
      by: ['category'],
      where: {
        isArchived: false,
        isDraft: false,
        ...(type === 'FINAL' || type === 'SEMIPREPARAT' ? { type } : {}),
      },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) out[r.category ?? ''] = r._count._all;
    return out;
  }

  /** Categories with system flag + colour + parent (for the admin management UI). */
  async getCategoryConfigs(
    kind = 'RECIPE',
  ): Promise<
    { name: string; isSystem: boolean; color: string | null; parentName: string | null }[]
  > {
    const rows = await this.prisma.recipeCategoryConfig.findMany({
      where: { kind },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return rows.map((r) => {
      const parent = r.parentId ? byId.get(r.parentId) : undefined;
      return {
        name: r.name,
        isSystem: r.isSystem,
        // Sub-categories inherit the parent's colour.
        color: r.parentId ? (parent?.color ?? null) : r.color,
        parentName: parent?.name ?? null,
      };
    });
  }

  private static readonly SUPER_DEFAULTS = [
    { kind: 'MATERIE_PRIMA', name: 'Materii prime', color: '#43A047' },
    { kind: 'SEMIPREPARAT', name: 'Semipreparate', color: '#1E88E5' },
    { kind: 'PRODUS_FINIT', name: 'Produse finite', color: '#D4527B' },
  ];

  /** All super-categories (dynamic), ordered. Seeds the 3 system ones if absent. */
  async getSuperCategories(): Promise<
    { kind: string; name: string; color: string; isSystem: boolean }[]
  > {
    const rows = await this.prisma.categoryKindColor.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const byKind = new Map(rows.map((r) => [r.kind, r]));
    const result = rows.map((r) => ({
      kind: r.kind,
      name: r.name ?? r.kind,
      color: r.color,
      isSystem: r.isSystem,
    }));
    // Guarantee the 3 system super-categories always exist in the response.
    for (const d of RecipesService.SUPER_DEFAULTS) {
      if (!byKind.has(d.kind)) {
        result.push({ kind: d.kind, name: d.name, color: d.color, isSystem: true });
      }
    }
    return result;
  }

  /** Create a new super-category (dynamic). Generates a stable slug. */
  async createSuperCategory(
    name: string,
    color: string,
  ): Promise<{ kind: string; name: string; color: string; isSystem: boolean }[]> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Numele super-categoriei nu poate fi gol');

    const base = trimmed
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    let kind = base || 'CATEGORIE';
    let i = 1;
    while (await this.prisma.categoryKindColor.findFirst({ where: { kind } })) {
      kind = `${base}_${i++}`;
    }

    const maxSort = await this.prisma.categoryKindColor.aggregate({ _max: { sortOrder: true } });
    await this.prisma.categoryKindColor.create({
      data: {
        kind,
        name: trimmed,
        color,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        isSystem: false,
      },
    });
    return this.getSuperCategories();
  }

  /** Rename / recolour a super-category. */
  async updateSuperCategory(
    kind: string,
    name?: string,
    color?: string,
  ): Promise<{ kind: string; name: string; color: string; isSystem: boolean }[]> {
    const existing = await this.prisma.categoryKindColor.findFirst({ where: { kind } });
    const data: Prisma.CategoryKindColorUpdateManyMutationInput = {};
    if (color !== undefined) data.color = color;
    if (name !== undefined && name.trim() && !(existing?.isSystem ?? false)) {
      data.name = name.trim();
    }
    if (existing) {
      await this.prisma.categoryKindColor.updateMany({ where: { kind }, data });
    } else {
      // Recolour a system super that wasn't persisted yet.
      await this.prisma.categoryKindColor.create({
        data: {
          kind,
          color: color ?? '#9E9E9E',
          name: name?.trim() ?? kind,
          isSystem: RecipesService.SUPER_DEFAULTS.some((d) => d.kind === kind),
        },
      });
    }
    return this.getSuperCategories();
  }

  /** Delete a non-system super-category and all its sub-categories. */
  async deleteSuperCategory(
    kind: string,
  ): Promise<{ kind: string; name: string; color: string; isSystem: boolean }[]> {
    const existing = await this.prisma.categoryKindColor.findFirst({ where: { kind } });
    if (!existing) throw new NotFoundException(`Super-categoria "${kind}" nu exista`);
    if (existing.isSystem || RecipesService.SUPER_DEFAULTS.some((d) => d.kind === kind)) {
      throw new BadRequestException('Super-categoria de sistem nu poate fi stearsa');
    }
    await this.prisma.$transaction([
      this.prisma.recipeCategoryConfig.deleteMany({ where: { kind } }),
      this.prisma.categoryKindColor.deleteMany({ where: { kind } }),
    ]);
    return this.getSuperCategories();
  }

  /**
   * Every category with its KIND colour — powers the stock carousel. The colour
   * comes from the category's kind (super-category); sub-categories inherit it.
   */
  async getCategoryCarousel(): Promise<
    { name: string; kind: string; color: string | null; parentName: string | null }[]
  > {
    const [rows, supers] = await Promise.all([
      this.prisma.recipeCategoryConfig.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.getSuperCategories(),
    ]);
    const colorByKind = new Map(supers.map((k) => [k.kind, k.color]));
    // GLOBAL ordinal first (set by reorderAllCategories — lets the admin pin
    // ANY category above everything else, across super-categories, e.g. a
    // semipreparate sub-category for a candy bar at the very top). Ties (rows
    // never globally reordered) fall back to the super order, then name.
    const superIndex = new Map(supers.map((k, i) => [k.kind, i]));
    const ordered = [...rows].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      const ka = superIndex.get(a.kind) ?? Number.MAX_SAFE_INTEGER;
      const kb = superIndex.get(b.kind) ?? Number.MAX_SAFE_INTEGER;
      if (ka !== kb) return ka - kb;
      return a.name.localeCompare(b.name);
    });
    // parentName tells the clients which rows are sub-categories: the category
    // dial lists only parents and shows a parent's children on demand.
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ordered.map((r) => ({
      name: r.name,
      kind: r.kind,
      color: colorByKind.get(r.kind) ?? null,
      parentName: r.parentId ? (byId.get(r.parentId)?.name ?? null) : null,
    }));
  }

  /**
   * Set a GLOBAL display order across ALL categories of every super-category:
   * index in `items` = global sortOrder. Rows not mentioned keep their
   * relative order after the mentioned ones. This is what the flat "toate
   * sub-categoriile" drag list saves — the carousel renders exactly this order.
   */
  async reorderAllCategories(
    items: { name: string; kind: string }[],
  ): Promise<{ name: string; kind: string; color: string | null }[]> {
    const rows = await this.prisma.recipeCategoryConfig.findMany();
    const rank = new Map(items.map((it, i) => [`${it.kind} ${it.name}`, i]));
    const sorted = [...rows].sort((a, b) => {
      const ra = rank.get(`${a.kind} ${a.name}`) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(`${b.kind} ${b.name}`) ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.sortOrder - b.sortOrder;
    });
    await this.prisma.$transaction(
      sorted.map((r, i) =>
        this.prisma.recipeCategoryConfig.updateMany({
          where: { id: r.id },
          data: { sortOrder: i },
        }),
      ),
    );
    return this.getCategoryCarousel();
  }

  /**
   * Set the display order of a kind's categories to the given name sequence
   * (index = sortOrder). Admin-driven; unknown names are ignored, names not in
   * the list keep their relative order after the provided ones.
   */
  async reorderCategories(kind = 'RECIPE', orderedNames: string[]): Promise<string[]> {
    // `sortOrder` is now a GLOBAL ordinal (shared with reorderAllCategories +
    // the carousel). Reordering within a kind must ONLY permute that kind's
    // categories among the global slots they already occupy — writing per-kind
    // 0..m indices would collide with other kinds' ordinals and interleave the
    // carousel across super-categories.
    const all = await this.prisma.recipeCategoryConfig.findMany();
    const globally = [...all].sort((a, b) =>
      a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name),
    );
    const rank = new Map(orderedNames.map((n, i) => [n, i]));
    // The target kind's rows in the requested order (unknown names keep tail order).
    const kindRows = globally
      .filter((r) => r.kind === kind)
      .sort((a, b) => {
        const ra = rank.get(a.name) ?? Number.MAX_SAFE_INTEGER;
        const rb = rank.get(b.name) ?? Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return a.sortOrder - b.sortOrder;
      });
    // Walk the global order; each target-kind slot receives the next reordered
    // kind row, every other row stays exactly where it was.
    let ki = 0;
    const finalOrder = globally.map((r) => {
      if (r.kind !== kind) return r;
      const next = kindRows[ki];
      ki += 1;
      // `next` is always defined (kind-slot count === kindRows.length); the ?? r
      // only satisfies noUncheckedIndexedAccess.
      return next ?? r;
    });
    await this.prisma.$transaction(
      finalOrder.map((r, i) =>
        this.prisma.recipeCategoryConfig.update({ where: { id: r.id }, data: { sortOrder: i } }),
      ),
    );
    return this.getCategories(kind);
  }

  /** Set the display order of the super-categories (the kind toggle). */
  async reorderSuperCategories(
    orderedKinds: string[],
  ): Promise<{ kind: string; name: string; color: string; isSystem: boolean }[]> {
    // Ensure the 3 system supers are persisted before ranking them.
    await this.getSuperCategories();
    const rows = await this.prisma.categoryKindColor.findMany();
    const rank = new Map(orderedKinds.map((k, i) => [k, i]));
    const sorted = [...rows].sort((a, b) => {
      const ra = rank.get(a.kind) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.kind) ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return a.sortOrder - b.sortOrder;
    });
    await this.prisma.$transaction(
      sorted.map((r, i) =>
        this.prisma.categoryKindColor.updateMany({
          where: { kind: r.kind },
          data: { sortOrder: i },
        }),
      ),
    );
    return this.getSuperCategories();
  }

  /**
   * Add a category. With `parentName` it becomes a sub-category under that
   * super-category (colour inherited). Otherwise a super-category with `color`.
   */
  async addCategory(
    name: string,
    kind = 'RECIPE',
    color?: string,
    parentName?: string,
  ): Promise<string[]> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Category name cannot be empty');

    const existing = await this.prisma.recipeCategoryConfig.findFirst({
      where: { name: trimmed, kind },
    });
    if (existing) return this.getCategories(kind);

    let parentId: string | null = null;
    if (parentName) {
      const parent = await this.prisma.recipeCategoryConfig.findFirst({
        where: { name: parentName, kind },
      });
      if (!parent) throw new NotFoundException(`Super-category "${parentName}" not found`);
      if (parent.parentId) {
        throw new BadRequestException('Sub-categories can only be one level deep');
      }
      parentId = parent.id;
    }

    const maxSort = await this.prisma.recipeCategoryConfig.aggregate({
      where: { kind },
      _max: { sortOrder: true },
    });
    await this.prisma.recipeCategoryConfig.create({
      data: {
        name: trimmed,
        kind,
        parentId,
        // Colour only on super-categories; subs inherit the parent's.
        color: parentId ? null : (color ?? null),
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    return this.getCategories(kind);
  }

  /** Rename a category (of a kind) and re-tag everything that used the old name. */
  /**
   * Edit a category: rename and/or recolour. Name change re-tags referencing
   * items; system categories can't be renamed but CAN be recoloured. Colour only
   * applies to super-categories (sub-categories inherit the parent's colour).
   */
  async renameCategory(
    oldName: string,
    newName: string,
    kind = 'RECIPE',
    color?: string,
  ): Promise<string[]> {
    const existing = await this.prisma.recipeCategoryConfig.findFirst({
      where: { name: oldName, kind },
    });
    if (!existing) throw new NotFoundException(`Category "${oldName}" not found`);

    const trimmed = (newName ?? '').trim() || oldName;
    const nameChanged = trimmed !== oldName;

    if (nameChanged && existing.isSystem) {
      throw new BadRequestException('Categoria de sistem nu poate fi redenumita');
    }
    if (nameChanged) {
      const clash = await this.prisma.recipeCategoryConfig.findFirst({
        where: { name: trimmed, kind },
      });
      if (clash) throw new BadRequestException(`Category "${trimmed}" already exists`);
    }

    const data: Prisma.RecipeCategoryConfigUpdateInput = {};
    if (nameChanged) data.name = trimmed;
    // Colour lives on super-categories only.
    if (color !== undefined && existing.parentId === null) data.color = color;

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.recipeCategoryConfig.updateMany({
        where: { name: oldName, kind },
        data,
      }),
    ];
    if (nameChanged) ops.push(...this.retagCategory(kind, oldName, trimmed));

    await this.prisma.$transaction(ops);
    return this.getCategories(kind);
  }

  /** Remove a category (of a kind) and clear it from everything that used it. */
  async removeCategory(name: string, kind = 'RECIPE'): Promise<string[]> {
    const existing = await this.prisma.recipeCategoryConfig.findFirst({
      where: { name, kind },
    });
    if (existing?.isSystem)
      throw new BadRequestException('Categoria de sistem nu poate fi stearsa');

    await this.prisma.$transaction([
      this.prisma.recipeCategoryConfig.deleteMany({ where: { name, kind } }),
      ...this.retagCategory(kind, name, null),
    ]);
    return this.getCategories(kind);
  }
  /** Photo path from the images module (`/api/v1/images/<id>`) or null to clear it. */
  async setPhotoUrl(id: string, photoUrl: string | null): Promise<RecipeResponseDto> {
    await this.prisma.recipe.update({ where: { id }, data: { photoUrl } });
    return this.findById(id);
  }
}
