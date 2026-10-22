import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/prisma/prisma.service';
import { tenantOrgFilter } from '@/prisma/tenant-context';
import { StockReviewChangeDto, StockReviewResultDto } from '../dto/stock-review.dto';
import { StockImportExportService } from './stock-import-export.service';
import { StockImportChangeDto } from '../dto/stock-import.dto';

/**
 * "Revizie stocuri": ONE spreadsheet with everything the app keeps as stock,
 * one row per lot (different expiry dates = different rows), and the way
 * back: upload the (edited, possibly partial) sheet and only the rows found in
 * it are adjusted — new products/lots that appeared since the export are left
 * alone, rows deleted from the sheet are left alone. Every quantity change
 * lands in the movements log as an AJUSTARE ("Revizie stocuri"), so the
 * report and the log agree.
 *
 * Sheets: "Materii prime", "Consumabile", "Semipreparate", "Produse finite".
 * Row types: LOT (a StockLot / RecipeStockLot — id = the lot id) and STOC
 * (stock that has no lot rows: the item's / location's aggregate — id = the
 * RawMaterial / Consumable id, or the RecipeStock row id).
 */
const SHEET_RAW = 'Materii prime';
const SHEET_CONSUMABLE = 'Consumabile';
const SHEET_SEMI = 'Semipreparate';
const SHEET_FINAL = 'Produse finite';

const HEADERS = [
  'ID rând', // 1 — never edit
  'Tip', // 2 — LOT | STOC — never edit
  'Produs', // 3
  'Categorie', // 4
  'Locație', // 5
  'Nr lot', // 6
  'Furnizor', // 7 (editable, lots of materials)
  'Factură', // 8
  'Data expirare', // 9 (editable, lots)
  'Preț achiziție', // 10 (editable, materials/consumables)
  'Cantitate', // 11 (editable)
  'U.M.', // 12
];
const COL = {
  id: 1,
  kind: 2,
  name: 3,
  location: 5,
  lot: 6,
  supplier: 7,
  expiry: 9,
  price: 10,
  quantity: 11,
};

const REFERENCE_NOTE = 'Revizie stocuri';

interface ReviewRow {
  sheet: string;
  rowNumber: number;
  id: string;
  kind: 'LOT' | 'STOC';
  name: string;
  lotNumber: string | null;
  location: string | null;
  supplier: string | null;
  expiryDate: Date | null | undefined; // undefined = cell empty (leave as is)
  price: number | null;
  quantity: number | null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const sameNumber = (a: number | null, b: number | null) =>
  a === b || (a !== null && b !== null && Math.abs(a - b) < 0.0005);
const sameDay = (a: Date | null, b: Date | null) =>
  (a === null && b === null) ||
  (a !== null && b !== null && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10));

@Injectable()
export class StockReviewService {
  private readonly logger = new Logger(StockReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importExport: StockImportExportService,
  ) {}

  // ========================================================================
  // Export
  // ========================================================================

  async exportXlsx(): Promise<Buffer> {
    const [rawMaterials, consumables, recipes, locations] = await Promise.all([
      this.prisma.rawMaterial.findMany({
        orderBy: { title: 'asc' },
        include: { supplier: { select: { name: true } } },
      }),
      this.prisma.consumable.findMany({ orderBy: { title: 'asc' } }),
      this.prisma.recipe.findMany({
        where: { isArchived: false, isDraft: false },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, type: true, category: true, unit: true },
      }),
      this.prisma.location.findMany({ select: { id: true, name: true } }),
    ]);
    const locationName = new Map(locations.map((l) => [l.id, l.name]));

    // StockLot is not tenant-scoped: scope through the tenant-scoped item ids.
    const lots = await this.prisma.stockLot.findMany({
      where: {
        remainingQuantity: { gt: 0 },
        OR: [
          { rawMaterialId: { in: rawMaterials.map((m) => m.id) } },
          { consumableId: { in: consumables.map((c) => c.id) } },
        ],
      },
      orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }],
    });
    const lotsByRaw = new Map<string, typeof lots>();
    const lotsByConsumable = new Map<string, typeof lots>();
    for (const lot of lots) {
      if (lot.rawMaterialId)
        lotsByRaw.set(lot.rawMaterialId, [...(lotsByRaw.get(lot.rawMaterialId) ?? []), lot]);
      if (lot.consumableId)
        lotsByConsumable.set(lot.consumableId, [
          ...(lotsByConsumable.get(lot.consumableId) ?? []),
          lot,
        ]);
    }
    const recipeLots = await this.prisma.recipeStockLot.findMany({
      where: { remainingQuantity: { gt: 0 }, recipeId: { in: recipes.map((r) => r.id) } },
      orderBy: [{ expiryDate: 'asc' }, { producedAt: 'asc' }],
    });
    const recipeStocks = await this.prisma.recipeStock.findMany({
      where: { recipeId: { in: recipes.map((r) => r.id) } },
    });

    const workbook = new ExcelJS.Workbook();
    const addSheet = (name: string): ExcelJS.Worksheet => {
      const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = [
        { width: 38 },
        { width: 8 },
        { width: 34 },
        { width: 18 },
        { width: 18 },
        { width: 22 },
        { width: 20 },
        { width: 16 },
        { width: 14 },
        { width: 14 },
        { width: 12 },
        { width: 10 },
      ];
      const header = sheet.addRow(HEADERS);
      header.font = { bold: true };
      header.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
        cell.border = { bottom: { style: 'thin' } };
      });
      return sheet;
    };
    const addRow = (sheet: ExcelJS.Worksheet, values: (string | number | Date | null)[]) => {
      const row = sheet.addRow(values.map((v) => (v === null ? '' : v)));
      if (values[COL.expiry - 1] instanceof Date) row.getCell(COL.expiry).numFmt = 'dd.mm.yyyy';
      return row;
    };

    const rawSheet = addSheet(SHEET_RAW);
    for (const m of rawMaterials) {
      const mine = lotsByRaw.get(m.id) ?? [];
      let attributed = 0;
      for (const lot of mine) {
        attributed += Number(lot.remainingQuantity);
        addRow(rawSheet, [
          lot.id,
          'LOT',
          m.title,
          m.category ?? '',
          '',
          lot.lotNumber ?? '',
          lot.supplier ?? m.supplier?.name ?? '',
          lot.supplierInvoice ?? '',
          lot.expiryDate,
          lot.purchasePrice !== null
            ? Number(lot.purchasePrice)
            : m.purchasePrice !== null
              ? Number(m.purchasePrice)
              : null,
          round3(Number(lot.remainingQuantity)),
          m.unit,
        ]);
      }
      const rest = round3(Number(m.stockCount) - attributed);
      if (mine.length === 0 || rest > 0.0005) {
        addRow(rawSheet, [
          m.id,
          'STOC',
          m.title,
          m.category ?? '',
          '',
          mine.length ? '(fără lot)' : '',
          m.supplier?.name ?? '',
          '',
          null,
          m.purchasePrice !== null ? Number(m.purchasePrice) : null,
          mine.length ? rest : round3(Number(m.stockCount)),
          m.unit,
        ]);
      }
    }

    const consumableSheet = addSheet(SHEET_CONSUMABLE);
    for (const c of consumables) {
      const mine = lotsByConsumable.get(c.id) ?? [];
      let attributed = 0;
      for (const lot of mine) {
        attributed += Number(lot.remainingQuantity);
        addRow(consumableSheet, [
          lot.id,
          'LOT',
          c.title,
          c.category ?? '',
          '',
          lot.lotNumber ?? '',
          lot.supplier ?? '',
          lot.supplierInvoice ?? '',
          lot.expiryDate,
          lot.purchasePrice !== null
            ? Number(lot.purchasePrice)
            : c.purchasePrice !== null
              ? Number(c.purchasePrice)
              : null,
          round3(Number(lot.remainingQuantity)),
          'BUCATI',
        ]);
      }
      const rest = round3(Number(c.stockCount) - attributed);
      if (mine.length === 0 || rest > 0.0005) {
        addRow(consumableSheet, [
          c.id,
          'STOC',
          c.title,
          c.category ?? '',
          '',
          mine.length ? '(fără lot)' : '',
          '',
          '',
          null,
          c.purchasePrice !== null ? Number(c.purchasePrice) : null,
          mine.length ? rest : round3(Number(c.stockCount)),
          'BUCATI',
        ]);
      }
    }

    const semiSheet = addSheet(SHEET_SEMI);
    const finalSheet = addSheet(SHEET_FINAL);
    const recipeById = new Map(recipes.map((r) => [r.id, r]));
    const lotsByRecipeLoc = new Map<string, typeof recipeLots>();
    for (const lot of recipeLots) {
      const k = `${lot.recipeId}|${lot.locationId}`;
      lotsByRecipeLoc.set(k, [...(lotsByRecipeLoc.get(k) ?? []), lot]);
    }
    const sortedStocks = [...recipeStocks].sort((a, b) =>
      (recipeById.get(a.recipeId)?.name ?? '').localeCompare(
        recipeById.get(b.recipeId)?.name ?? '',
      ),
    );
    for (const rs of sortedStocks) {
      const r = recipeById.get(rs.recipeId);
      if (!r) continue;
      const sheet = r.type === 'SEMIPREPARAT' ? semiSheet : finalSheet;
      const mine = lotsByRecipeLoc.get(`${rs.recipeId}|${rs.locationId}`) ?? [];
      let attributed = 0;
      for (const lot of mine) {
        attributed += Number(lot.remainingQuantity);
        addRow(sheet, [
          lot.id,
          'LOT',
          r.name,
          r.category ?? '',
          locationName.get(rs.locationId) ?? '',
          lot.lotNumber,
          '',
          '',
          lot.expiryDate,
          null,
          round3(Number(lot.remainingQuantity)),
          r.unit,
        ]);
      }
      const rest = round3(Number(rs.quantity) - attributed);
      if ((mine.length === 0 && Number(rs.quantity) > 0) || rest > 0.0005) {
        addRow(sheet, [
          rs.id,
          'STOC',
          r.name,
          r.category ?? '',
          locationName.get(rs.locationId) ?? '',
          mine.length ? '(fără lot)' : '',
          '',
          '',
          rs.expiryDate ?? null,
          null,
          mine.length ? rest : round3(Number(rs.quantity)),
          r.unit,
        ]);
      }
    }

    const data = await workbook.xlsx.writeBuffer();
    return Buffer.from(data);
  }

  // ========================================================================
  // Import
  // ========================================================================

  async importXlsx(buffer: Buffer, dryRun: boolean, userId: string): Promise<StockReviewResultDto> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('Fișierul nu este un .xlsx valid.');
    }
    const rows: ReviewRow[] = [];
    for (const name of [SHEET_RAW, SHEET_CONSUMABLE, SHEET_SEMI, SHEET_FINAL]) {
      rows.push(...this.readRows(workbook.getWorksheet(name), name));
    }
    if (rows.length === 0) {
      throw new BadRequestException(
        `Fișierul trebuie să fie exportul „Revizie stocuri” (foile ${SHEET_RAW}, ${SHEET_CONSUMABLE}, ${SHEET_SEMI}, ${SHEET_FINAL}).`,
      );
    }

    const changes: StockReviewChangeDto[] = [];
    const unknownIds: string[] = [];
    let unchanged = 0;

    const lotIds = rows
      .filter((r) => r.kind === 'LOT' && r.sheet !== SHEET_SEMI && r.sheet !== SHEET_FINAL)
      .map((r) => r.id);
    const recipeLotIds = rows
      .filter((r) => r.kind === 'LOT' && (r.sheet === SHEET_SEMI || r.sheet === SHEET_FINAL))
      .map((r) => r.id);
    const stockRowIds = rows
      .filter((r) => r.kind === 'STOC' && (r.sheet === SHEET_SEMI || r.sheet === SHEET_FINAL))
      .map((r) => r.id);
    const rawIds = rows.filter((r) => r.kind === 'STOC' && r.sheet === SHEET_RAW).map((r) => r.id);
    const consumableIds = rows
      .filter((r) => r.kind === 'STOC' && r.sheet === SHEET_CONSUMABLE)
      .map((r) => r.id);

    const [rawMaterials, consumables] = await Promise.all([
      this.prisma.rawMaterial.findMany({ select: { id: true } }),
      this.prisma.consumable.findMany({ select: { id: true } }),
    ]);
    const ownRaw = new Set(rawMaterials.map((m) => m.id));
    const ownConsumable = new Set(consumables.map((c) => c.id));

    const [lots, recipeLots, recipeStocks, rawItems, consumableItems] = await Promise.all([
      this.prisma.stockLot.findMany({
        where: {
          id: { in: lotIds },
          OR: [
            { rawMaterialId: { in: [...ownRaw] } },
            { consumableId: { in: [...ownConsumable] } },
          ],
        },
        include: {
          rawMaterial: { select: { title: true } },
          consumable: { select: { title: true } },
        },
      }),
      this.prisma.recipeStockLot.findMany({
        where: { id: { in: recipeLotIds } },
        include: { recipe: { select: { name: true } }, location: { select: { name: true } } },
      }),
      // RecipeStock has no organizationId — uploaded ids must belong to an
      // own recipe (otherwise another org's stock row could be rewritten).
      this.prisma.recipeStock.findMany({
        where: { id: { in: stockRowIds }, recipe: tenantOrgFilter() },
        include: { recipe: { select: { name: true } }, location: { select: { name: true } } },
      }),
      this.prisma.rawMaterial.findMany({ where: { id: { in: rawIds } } }),
      this.prisma.consumable.findMany({ where: { id: { in: consumableIds } } }),
    ]);
    const lotById = new Map(lots.map((l) => [l.id, l]));
    const recipeLotById = new Map(recipeLots.map((l) => [l.id, l]));
    const recipeStockById = new Map(recipeStocks.map((s) => [s.id, s]));
    const rawById = new Map(rawItems.map((m) => [m.id, m]));
    const consumableById = new Map(consumableItems.map((c) => [c.id, c]));

    // Plans to apply (dry run just reports them).
    type LotPlan = { row: ReviewRow; lot: (typeof lots)[number]; changes: StockReviewChangeDto[] };
    type RecipeLotPlan = {
      row: ReviewRow;
      lot: (typeof recipeLots)[number];
      changes: StockReviewChangeDto[];
    };
    type RecipeStockPlan = {
      row: ReviewRow;
      stock: (typeof recipeStocks)[number];
      changes: StockReviewChangeDto[];
    };
    const lotPlans: LotPlan[] = [];
    const recipeLotPlans: RecipeLotPlan[] = [];
    const recipeStockPlans: RecipeStockPlan[] = [];
    const itemChanges: { sheet: string; change: StockImportChangeDto }[] = [];

    for (const row of rows) {
      const base = {
        sheet: row.sheet,
        id: row.id,
        kind: row.kind,
        name: row.name,
        lotNumber: row.lotNumber,
        location: row.location,
      };
      if (row.kind === 'LOT' && (row.sheet === SHEET_RAW || row.sheet === SHEET_CONSUMABLE)) {
        const lot = lotById.get(row.id);
        if (!lot) {
          unknownIds.push(row.id);
          continue;
        }
        const name = lot.rawMaterial?.title ?? lot.consumable?.title ?? row.name;
        const cs: StockReviewChangeDto[] = [];
        if (row.quantity !== null && !sameNumber(row.quantity, Number(lot.remainingQuantity))) {
          cs.push(
            new StockReviewChangeDto({
              ...base,
              name,
              lotNumber: lot.lotNumber,
              field: 'quantity',
              from: round3(Number(lot.remainingQuantity)),
              to: row.quantity,
            }),
          );
        }
        if (
          row.price !== null &&
          !sameNumber(row.price, lot.purchasePrice !== null ? Number(lot.purchasePrice) : null)
        ) {
          cs.push(
            new StockReviewChangeDto({
              ...base,
              name,
              lotNumber: lot.lotNumber,
              field: 'purchasePrice',
              from: lot.purchasePrice !== null ? Number(lot.purchasePrice) : null,
              to: row.price,
            }),
          );
        }
        if (row.expiryDate !== undefined && !sameDay(row.expiryDate, lot.expiryDate)) {
          cs.push(
            new StockReviewChangeDto({
              ...base,
              name,
              lotNumber: lot.lotNumber,
              field: 'expiryDate',
              from: lot.expiryDate?.toISOString().slice(0, 10) ?? null,
              to: row.expiryDate?.toISOString().slice(0, 10) ?? null,
            }),
          );
        }
        if (row.supplier !== null && row.supplier !== (lot.supplier ?? '')) {
          cs.push(
            new StockReviewChangeDto({
              ...base,
              name,
              lotNumber: lot.lotNumber,
              field: 'supplier',
              from: lot.supplier ?? null,
              to: row.supplier,
            }),
          );
        }
        if (cs.length) {
          lotPlans.push({ row, lot, changes: cs });
          changes.push(...cs);
        } else unchanged++;
      } else if (row.kind === 'LOT') {
        const lot = recipeLotById.get(row.id);
        if (!lot) {
          unknownIds.push(row.id);
          continue;
        }
        const cs: StockReviewChangeDto[] = [];
        const name = lot.recipe.name;
        if (row.quantity !== null && !sameNumber(row.quantity, Number(lot.remainingQuantity))) {
          cs.push(
            new StockReviewChangeDto({
              ...base,
              name,
              lotNumber: lot.lotNumber,
              location: lot.location.name,
              field: 'quantity',
              from: round3(Number(lot.remainingQuantity)),
              to: row.quantity,
            }),
          );
        }
        if (row.expiryDate !== undefined && !sameDay(row.expiryDate, lot.expiryDate)) {
          cs.push(
            new StockReviewChangeDto({
              ...base,
              name,
              lotNumber: lot.lotNumber,
              location: lot.location.name,
              field: 'expiryDate',
              from: lot.expiryDate?.toISOString().slice(0, 10) ?? null,
              to: row.expiryDate?.toISOString().slice(0, 10) ?? null,
            }),
          );
        }
        if (cs.length) {
          recipeLotPlans.push({ row, lot, changes: cs });
          changes.push(...cs);
        } else unchanged++;
      } else if (row.sheet === SHEET_SEMI || row.sheet === SHEET_FINAL) {
        const stock = recipeStockById.get(row.id);
        if (!stock) {
          unknownIds.push(row.id);
          continue;
        }
        // The STOC row of a recipe at a location = the unattributed remainder
        // when lots exist, else the whole quantity. Its new value sets that part.
        const lotsHere = recipeLots.filter(
          (l) => l.recipeId === stock.recipeId && l.locationId === stock.locationId,
        );
        const attributedHere = lotsHere.length
          ? (
              await this.prisma.recipeStockLot.aggregate({
                where: {
                  recipeId: stock.recipeId,
                  locationId: stock.locationId,
                  remainingQuantity: { gt: 0 },
                },
                _sum: { remainingQuantity: true },
              })
            )._sum.remainingQuantity
          : null;
        const current = round3(Number(stock.quantity) - Number(attributedHere ?? 0));
        if (row.quantity !== null && !sameNumber(row.quantity, current)) {
          const c = new StockReviewChangeDto({
            ...base,
            name: stock.recipe.name,
            location: stock.location.name,
            field: 'quantity',
            from: current,
            to: row.quantity,
          });
          recipeStockPlans.push({ row, stock, changes: [c] });
          changes.push(c);
        } else unchanged++;
      } else if (row.sheet === SHEET_RAW) {
        const m = rawById.get(row.id);
        if (!m) {
          unknownIds.push(row.id);
          continue;
        }
        const cs: StockImportChangeDto[] = [];
        if (row.quantity !== null) {
          // STOC row = unattributed remainder when lots exist → new stockCount = lots + new remainder.
          const attributed = Number(
            (
              await this.prisma.stockLot.aggregate({
                where: { rawMaterialId: m.id, remainingQuantity: { gt: 0 } },
                _sum: { remainingQuantity: true },
              })
            )._sum.remainingQuantity ?? 0,
          );
          const current = round3(Number(m.stockCount) - attributed);
          if (!sameNumber(row.quantity, current)) {
            const target = round3(attributed + row.quantity);
            cs.push(
              new StockImportChangeDto({
                id: m.id,
                name: m.title,
                field: 'stockCount',
                from: round3(Number(m.stockCount)),
                to: target,
              }),
            );
            changes.push(
              new StockReviewChangeDto({
                ...base,
                name: m.title,
                field: 'quantity',
                from: current,
                to: row.quantity,
              }),
            );
          }
        }
        if (
          row.price !== null &&
          !sameNumber(row.price, m.purchasePrice !== null ? Number(m.purchasePrice) : null)
        ) {
          cs.push(
            new StockImportChangeDto({
              id: m.id,
              name: m.title,
              field: 'purchasePrice',
              from: m.purchasePrice !== null ? Number(m.purchasePrice) : null,
              to: row.price,
            }),
          );
          changes.push(
            new StockReviewChangeDto({
              ...base,
              name: m.title,
              field: 'purchasePrice',
              from: m.purchasePrice !== null ? Number(m.purchasePrice) : null,
              to: row.price,
            }),
          );
        }
        if (cs.length) itemChanges.push(...cs.map((change) => ({ sheet: SHEET_RAW, change })));
        else unchanged++;
      } else {
        const c = consumableById.get(row.id);
        if (!c) {
          unknownIds.push(row.id);
          continue;
        }
        const cs: StockImportChangeDto[] = [];
        if (row.quantity !== null) {
          const attributed = Number(
            (
              await this.prisma.stockLot.aggregate({
                where: { consumableId: c.id, remainingQuantity: { gt: 0 } },
                _sum: { remainingQuantity: true },
              })
            )._sum.remainingQuantity ?? 0,
          );
          const current = round3(Number(c.stockCount) - attributed);
          if (!sameNumber(row.quantity, current)) {
            const target = round3(attributed + row.quantity);
            cs.push(
              new StockImportChangeDto({
                id: c.id,
                name: c.title,
                field: 'stockCount',
                from: round3(Number(c.stockCount)),
                to: target,
              }),
            );
            changes.push(
              new StockReviewChangeDto({
                ...base,
                name: c.title,
                field: 'quantity',
                from: current,
                to: row.quantity,
              }),
            );
          }
        }
        if (
          row.price !== null &&
          !sameNumber(row.price, c.purchasePrice !== null ? Number(c.purchasePrice) : null)
        ) {
          cs.push(
            new StockImportChangeDto({
              id: c.id,
              name: c.title,
              field: 'purchasePrice',
              from: c.purchasePrice !== null ? Number(c.purchasePrice) : null,
              to: row.price,
            }),
          );
          changes.push(
            new StockReviewChangeDto({
              ...base,
              name: c.title,
              field: 'purchasePrice',
              from: c.purchasePrice !== null ? Number(c.purchasePrice) : null,
              to: row.price,
            }),
          );
        }
        if (cs.length)
          itemChanges.push(...cs.map((change) => ({ sheet: SHEET_CONSUMABLE, change })));
        else unchanged++;
      }
    }

    if (dryRun || changes.length === 0) {
      return new StockReviewResultDto({
        changes,
        unknownIds,
        unchanged,
        rowsRead: rows.length,
        applied: false,
      });
    }

    await this.prisma.$transaction(
      async (tx) => {
        // Material / consumable lots: set the lot, move the aggregate by the delta.
        for (const plan of lotPlans) {
          const lot = plan.lot;
          const data: Record<string, unknown> = {};
          let delta = 0;
          for (const c of plan.changes) {
            if (c.field === 'quantity') {
              data.remainingQuantity = c.to;
              delta = Number(c.to) - Number(lot.remainingQuantity);
            }
            if (c.field === 'purchasePrice') data.purchasePrice = c.to;
            if (c.field === 'expiryDate') data.expiryDate = c.to ? new Date(String(c.to)) : null;
            if (c.field === 'supplier') data.supplier = c.to || null;
          }
          await tx.stockLot.update({ where: { id: lot.id }, data });
          if (Math.abs(delta) > 0.0005) {
            if (lot.rawMaterialId) {
              const m = await tx.rawMaterial.findUnique({ where: { id: lot.rawMaterialId } });
              if (m)
                await this.importExport.applyRawMaterialChange(
                  tx,
                  new StockImportChangeDto({
                    id: m.id,
                    name: m.title,
                    field: 'stockCount',
                    from: Number(m.stockCount),
                    to: round3(Number(m.stockCount) + delta),
                  }),
                  userId,
                  `${REFERENCE_NOTE} — lot ${lot.lotNumber ?? ''}`.trim(),
                );
            } else if (lot.consumableId) {
              const c = await tx.consumable.findUnique({ where: { id: lot.consumableId } });
              if (c)
                await this.importExport.applyConsumableChange(
                  tx,
                  new StockImportChangeDto({
                    id: c.id,
                    name: c.title,
                    field: 'stockCount',
                    from: Number(c.stockCount),
                    to: round3(Number(c.stockCount) + delta),
                  }),
                  userId,
                  `${REFERENCE_NOTE} — lot ${lot.lotNumber ?? ''}`.trim(),
                );
            }
          }
        }
        // Recipe lots: set the lot, move the per-location RecipeStock by the delta.
        for (const plan of recipeLotPlans) {
          const lot = plan.lot;
          const data: Record<string, unknown> = {};
          let delta = 0;
          for (const c of plan.changes) {
            if (c.field === 'quantity') {
              data.remainingQuantity = c.to;
              delta = Number(c.to) - Number(lot.remainingQuantity);
            }
            if (c.field === 'expiryDate') data.expiryDate = c.to ? new Date(String(c.to)) : null;
          }
          await tx.recipeStockLot.update({ where: { id: lot.id }, data });
          if (Math.abs(delta) > 0.0005) {
            await this.moveRecipeStock(
              tx,
              lot.recipeId,
              lot.locationId,
              delta,
              userId,
              `${REFERENCE_NOTE} — lot ${lot.lotNumber}`,
            );
          }
        }
        // Recipe STOC rows: the unattributed remainder changes by the delta.
        for (const plan of recipeStockPlans) {
          const c = plan.changes[0];
          if (!c) continue;
          const delta = Number(c.to) - Number(c.from);
          if (Math.abs(delta) > 0.0005) {
            await this.moveRecipeStock(
              tx,
              plan.stock.recipeId,
              plan.stock.locationId,
              delta,
              userId,
              REFERENCE_NOTE,
            );
          }
        }
        // Material / consumable STOC rows + prices: the existing import rules.
        for (const { sheet, change } of itemChanges) {
          if (sheet === SHEET_RAW)
            await this.importExport.applyRawMaterialChange(tx, change, userId, REFERENCE_NOTE);
          else await this.importExport.applyConsumableChange(tx, change, userId, REFERENCE_NOTE);
        }
      },
      { timeout: 120_000 },
    );
    this.logger.log(`Stock review applied: ${changes.length} change(s) by ${userId}`);
    return new StockReviewResultDto({
      changes,
      unknownIds,
      unchanged,
      rowsRead: rows.length,
      applied: true,
    });
  }

  /** Per-location RecipeStock += delta (never below 0), recipe aggregate resynced, AJUSTARE logged. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async moveRecipeStock(
    tx: any,
    recipeId: string,
    locationId: string,
    delta: number,
    userId: string,
    note: string,
  ): Promise<void> {
    const row = await tx.recipeStock.findUnique({
      where: { locationId_recipeId: { locationId, recipeId } },
    });
    const before = Number(row?.quantity ?? 0);
    const after = Math.max(0, round3(before + delta));
    await tx.recipeStock.upsert({
      where: { locationId_recipeId: { locationId, recipeId } },
      update: { quantity: after },
      create: { locationId, recipeId, quantity: after },
    });
    const agg = await tx.recipeStock.aggregate({ where: { recipeId }, _sum: { quantity: true } });
    const recipe = await tx.recipe.update({
      where: { id: recipeId },
      data: { stockCount: Math.max(0, Math.round(Number(agg._sum.quantity ?? 0))) },
      select: { unit: true },
    });
    await tx.stockMovement.create({
      data: {
        recipeId,
        locationId,
        movementType: StockMovementType.AJUSTARE,
        quantity: round3(after - before),
        // Required column — omitting it made every recipe change in a review
        // fail with a Prisma validation error ("Date invalide în cerere").
        unit: recipe.unit,
        referenceNote: note,
        performedById: userId,
      },
    });
  }

  private readRows(sheet: ExcelJS.Worksheet | undefined, name: string): ReviewRow[] {
    if (!sheet) return [];
    const rows: ReviewRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const id = this.text(row.getCell(COL.id)).trim();
      const kind = this.text(row.getCell(COL.kind)).trim().toUpperCase();
      if (!id || (kind !== 'LOT' && kind !== 'STOC')) return;
      rows.push({
        sheet: name,
        rowNumber,
        id,
        kind: kind as 'LOT' | 'STOC',
        name: this.text(row.getCell(COL.name)).trim(),
        lotNumber: this.text(row.getCell(COL.lot)).trim() || null,
        location: this.text(row.getCell(COL.location)).trim() || null,
        supplier: this.textOrNull(row.getCell(COL.supplier)),
        expiryDate: this.date(row.getCell(COL.expiry)),
        price: this.number(row.getCell(COL.price)),
        quantity: this.number(row.getCell(COL.quantity)),
      });
    });
    return rows;
  }

  private text(cell: ExcelJS.Cell): string {
    const v = cell.value;
    if (v == null) return '';
    if (typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('');
    if (typeof v === 'object' && 'result' in v) return String(v.result ?? '');
    if (v instanceof Date) return v.toISOString();
    return String(v);
  }

  /** Empty cell → null (leave as is); text → the text ("" clears). */
  private textOrNull(cell: ExcelJS.Cell): string | null {
    if (cell.value == null) return null;
    return this.text(cell).trim();
  }

  private number(cell: ExcelJS.Cell): number | null {
    const v = cell.value;
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = this.text(cell).trim().replace(/\s/g, '');
    if (!s) return null;
    const n = Number(
      s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, ''),
    );
    return Number.isFinite(n) ? n : null;
  }

  /**
   * undefined = cell empty or unreadable (keep); null = explicit "-" / "x"
   * (clear); Date otherwise. Spreadsheet apps re-save dates in several shapes
   * (Date, serial number, "dd.mm.yyyy", ISO) — anything outside a sane year
   * range is ignored rather than sent to the database (a serial read as a year
   * made the whole import fail with "Date invalide în cerere").
   */
  private date(cell: ExcelJS.Cell): Date | null | undefined {
    const v = cell.value;
    if (v == null || v === '') return undefined;
    const sane = (d: Date) =>
      !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100
        ? d
        : undefined;
    if (v instanceof Date) return sane(v);
    const s = this.text(cell).trim();
    if (!s) return undefined;
    if (/^[-x]$/i.test(s)) return null;
    // Excel serial day number (1 = 1900-01-01, with Excel's 1900 leap-year quirk).
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      return sane(new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86_400_000));
    }
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
    if (m) {
      const [, day, month, y] = m as unknown as [string, string, string, string];
      const year = y.length === 2 ? 2000 + Number(y) : Number(y);
      return sane(new Date(Date.UTC(year, Number(month) - 1, Number(day))));
    }
    return sane(new Date(s));
  }
}
