import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UnitType } from '@prisma/client';
import * as ExcelJS from 'exceljs';

import { PrismaService } from '@/prisma/prisma.service';
import { RecipeResolutionService } from '@/modules/recipes';
import {
  PlanProductDto,
  PlanRequirementDto,
  RequirementsPlanDto,
  RequirementsPlanResponseDto,
} from '../dto';

/** Safety cap for expanding nested semipreparate across recipe trees. */
const MAX_EXPANSION_ROUNDS = 10;

/**
 * Ad-hoc production planning: "we want to make 200 fraisier + 30 cheesecake
 * this week — what raw materials do we need?". Resolves every product's recipe
 * tree, recursively expands semipreparate down to raw materials (a procurement
 * plan wants the FULL ingredient need, unlike task reservation which draws
 * stocked semis from RecipeStock), and aggregates per material with supplier,
 * global stock, and the resulting purchase deficit.
 */
@Injectable()
export class RequirementsPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipeResolution: RecipeResolutionService,
  ) {}

  async plan(dto: RequirementsPlanDto): Promise<RequirementsPlanResponseDto> {
    const products: PlanProductDto[] = [];
    // key = rawMaterialId::unit (mirrors RecipeResolutionService.mergeDuplicates)
    const aggregated = new Map<string, { rawMaterialId: string; unit: string; needed: number }>();

    // Work queue of (recipeId, quantity, unit) to resolve; semis get re-queued.
    let queue: { recipeId: string; quantity: number; unit: UnitType }[] = [];

    for (const item of dto.items) {
      const recipe = await this.prisma.recipe.findUnique({ where: { id: item.recipeId } });
      if (!recipe) {
        throw new NotFoundException(`Recipe with ID "${item.recipeId}" not found`);
      }
      products.push(
        new PlanProductDto({
          recipeId: recipe.id,
          recipeName: recipe.name,
          quantity: item.quantity,
          unit: recipe.unit,
        }),
      );
      queue.push({ recipeId: recipe.id, quantity: item.quantity, unit: recipe.unit });
    }

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
          const key = `${ing.rawMaterialId}::${ing.unit}`;
          const existing = aggregated.get(key);
          if (existing) {
            existing.needed += ing.quantity;
          } else {
            aggregated.set(key, {
              rawMaterialId: ing.rawMaterialId,
              unit: ing.unit,
              needed: ing.quantity,
            });
          }
        }

        // A procurement plan needs the semis' ingredients too — expand them.
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

    const requirements: PlanRequirementDto[] = [];
    for (const agg of aggregated.values()) {
      const material = await this.prisma.rawMaterial.findUnique({
        where: { id: agg.rawMaterialId },
        include: { supplier: true },
      });
      if (!material) continue;

      const currentStock = Number(material.stockCount);
      const available = currentStock - Number(material.reservedCount);
      const needed = agg.needed;

      requirements.push(
        new PlanRequirementDto({
          rawMaterialId: material.id,
          title: material.title,
          category: material.category,
          needed,
          unit: agg.unit,
          currentStock,
          available,
          deficit: Math.max(0, needed - available),
          supplierId: material.supplierId,
          supplierName: material.supplier?.name ?? null,
        }),
      );
    }

    // Group by supplier (no supplier last), then by material name.
    requirements.sort((a, b) => {
      const sa = a.supplierName ?? '￿';
      const sb = b.supplierName ?? '￿';
      return sa.localeCompare(sb, 'ro') || a.title.localeCompare(b.title, 'ro');
    });

    return new RequirementsPlanResponseDto({ products, requirements });
  }

  /** Same computation, rendered as an .xlsx workbook for download/sharing. */
  async exportXlsx(dto: RequirementsPlanDto): Promise<Buffer> {
    const result = await this.plan(dto);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Necesar MP');

    sheet.columns = [
      { width: 34 },
      { width: 24 },
      { width: 12 },
      { width: 8 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
    ];

    const title = sheet.addRow(['Necesar materii prime']);
    title.font = { bold: true, size: 14 };
    sheet.addRow([]);

    const planHeader = sheet.addRow(['Plan de productie']);
    planHeader.font = { bold: true };
    for (const p of result.products) {
      sheet.addRow([p.recipeName, `${p.quantity} ${p.unit}`]);
    }
    sheet.addRow([]);

    const header = sheet.addRow([
      'Materie prima',
      'Furnizor',
      'Necesar',
      'UM',
      'Stoc',
      'Disponibil',
      'De cumparat',
    ]);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
      cell.border = { bottom: { style: 'thin' } };
    });

    const round = (n: number) => Math.round(n * 1000) / 1000;
    for (const r of result.requirements) {
      const row = sheet.addRow([
        r.title,
        r.supplierName ?? '—',
        round(r.needed),
        r.unit,
        round(r.currentStock),
        round(r.available),
        round(r.deficit),
      ]);
      if (r.deficit > 0) {
        row.getCell(7).font = { bold: true, color: { argb: 'FFC00000' } };
      }
    }

    const data = await workbook.xlsx.writeBuffer();
    return Buffer.from(data);
  }
}
