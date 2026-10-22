import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { StockMovementType, UnitType } from '@prisma/client';
import * as ExcelJS from 'exceljs';

import { PrismaService } from '@/prisma/prisma.service';
import { StockImportChangeDto, StockImportResultDto } from '../dto';
import { deriveMaterialStatus } from '../material-status.util';

const RAW_SHEET_NAME = 'Materii prime';
const CONSUMABLE_SHEET_NAME = 'Consumabile';

/**
 * Sheet layout shared by export and import. The ID column is the STRICT match
 * key on import; only Cantitate / Preț achiziție / Stoc minim are applied back
 * (name/category/lot columns are display-only context).
 */
const HEADERS = [
  'ID',
  'Nume',
  'Categorie',
  'Cantitate',
  'Unitate',
  'Preț achiziție',
  'Lot',
  'Data expirare',
  'Stoc minim',
];
const COL_ID = 1;
const COL_QUANTITY = 4;
const COL_PRICE = 6;
const COL_MIN_STOCK = 9;

type EditableField = 'stockCount' | 'purchasePrice' | 'minimumStock';

interface ImportRow {
  id: string;
  rowNumber: number;
  quantity: number | null;
  purchasePrice: number | null;
  minimumStock: number | null;
}

@Injectable()
export class StockImportExportService {
  private readonly logger = new Logger(StockImportExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ========================================================================
  // Export
  // ========================================================================

  /**
   * Full stock snapshot as .xlsx: one sheet for raw materials, one for
   * consumables, one row per item (aggregated quantity). Lot / expiry come
   * from the soonest-expiring StockLot that still has remaining quantity.
   */
  async exportXlsx(): Promise<Buffer> {
    const [rawMaterials, consumables] = await Promise.all([
      this.prisma.rawMaterial.findMany({ orderBy: { title: 'asc' } }),
      this.prisma.consumable.findMany({ orderBy: { title: 'asc' } }),
    ]);

    // Soonest-expiring lot with stock left, per item. StockLot is not
    // tenant-scoped — scoping comes from the (tenant-scoped) material IDs.
    const lots = await this.prisma.stockLot.findMany({
      where: {
        remainingQuantity: { gt: 0 },
        expiryDate: { not: null },
        OR: [
          { rawMaterialId: { in: rawMaterials.map((m) => m.id) } },
          { consumableId: { in: consumables.map((c) => c.id) } },
        ],
      },
      orderBy: { expiryDate: 'asc' },
    });
    const nearestLotByRaw = new Map<string, (typeof lots)[number]>();
    const nearestLotByConsumable = new Map<string, (typeof lots)[number]>();
    for (const lot of lots) {
      if (lot.rawMaterialId && !nearestLotByRaw.has(lot.rawMaterialId)) {
        nearestLotByRaw.set(lot.rawMaterialId, lot);
      }
      if (lot.consumableId && !nearestLotByConsumable.has(lot.consumableId)) {
        nearestLotByConsumable.set(lot.consumableId, lot);
      }
    }

    const workbook = new ExcelJS.Workbook();

    const addSheet = (name: string): ExcelJS.Worksheet => {
      const sheet = workbook.addWorksheet(name, {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      sheet.columns = [
        { width: 38 }, // ID
        { width: 34 }, // Nume
        { width: 20 }, // Categorie
        { width: 12 }, // Cantitate
        { width: 12 }, // Unitate
        { width: 14 }, // Preț achiziție
        { width: 16 }, // Lot
        { width: 14 }, // Data expirare
        { width: 12 }, // Stoc minim
      ];
      const header = sheet.addRow(HEADERS);
      header.font = { bold: true };
      header.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
        cell.border = { bottom: { style: 'thin' } };
      });
      return sheet;
    };

    const round = (n: number) => Math.round(n * 1000) / 1000;

    const rawSheet = addSheet(RAW_SHEET_NAME);
    for (const m of rawMaterials) {
      const lot = nearestLotByRaw.get(m.id);
      const row = rawSheet.addRow([
        m.id,
        m.title,
        m.category ?? '',
        round(Number(m.stockCount)),
        m.unit,
        m.purchasePrice !== null ? Number(m.purchasePrice) : '',
        lot?.lotNumber ?? '',
        lot?.expiryDate ?? '',
        round(Number(m.minimumStock)),
      ]);
      if (lot?.expiryDate) row.getCell(8).numFmt = 'dd.mm.yyyy';
    }

    const consumableSheet = addSheet(CONSUMABLE_SHEET_NAME);
    for (const c of consumables) {
      const lot = nearestLotByConsumable.get(c.id);
      const row = consumableSheet.addRow([
        c.id,
        c.title,
        c.category ?? '',
        round(Number(c.stockCount)),
        // Consumables have no unit column in the DB — pieces by convention.
        'BUCATI',
        c.purchasePrice !== null ? Number(c.purchasePrice) : '',
        lot?.lotNumber ?? '',
        lot?.expiryDate ?? '',
        round(Number(c.minimumStock)),
      ]);
      if (lot?.expiryDate) row.getCell(8).numFmt = 'dd.mm.yyyy';
    }

    const data = await workbook.xlsx.writeBuffer();
    return Buffer.from(data);
  }

  // ========================================================================
  // Import
  // ========================================================================

  /**
   * Re-import an (edited) export. Rows are matched STRICTLY on the ID column;
   * only Cantitate / Preț achiziție / Stoc minim are compared and applied —
   * name/category edits are ignored. `dryRun` returns the computed diff without
   * writing; otherwise everything is applied in one transaction, with an
   * AJUSTARE StockMovement (quantity = the delta, referenceNote 'Import Excel')
   * for every quantity change. Raw-material quantity deltas land on the item's
   * primary stock location (its largest MaterialStock row, else the default
   * location — same fallback chain the manual AJUSTARE uses), then the global
   * stockCount is resynced as the sum of locations.
   */
  async importXlsx(buffer: Buffer, dryRun: boolean, userId: string): Promise<StockImportResultDto> {
    const workbook = new ExcelJS.Workbook();
    try {
      // exceljs declares its own Buffer alias — the runtime type is the same.
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('Fișierul încărcat nu este un .xlsx valid.');
    }

    const rawSheet = workbook.getWorksheet(RAW_SHEET_NAME);
    const consumableSheet = workbook.getWorksheet(CONSUMABLE_SHEET_NAME);
    if (!rawSheet && !consumableSheet) {
      throw new BadRequestException(
        `Fișierul trebuie să conțină cel puțin un sheet "${RAW_SHEET_NAME}" sau "${CONSUMABLE_SHEET_NAME}".`,
      );
    }

    const rawRows = this.readRows(rawSheet);
    const consumableRows = this.readRows(consumableSheet);

    // Strict ID match, tenant-scoped by the Prisma extension — IDs from other
    // orgs (or plain typos) fall out as unknownIds.
    const [rawMaterials, consumables] = await Promise.all([
      this.prisma.rawMaterial.findMany({ where: { id: { in: rawRows.map((r) => r.id) } } }),
      this.prisma.consumable.findMany({ where: { id: { in: consumableRows.map((r) => r.id) } } }),
    ]);
    const rawById = new Map(rawMaterials.map((m) => [m.id, m]));
    const consumableById = new Map(consumables.map((c) => [c.id, c]));

    const changes: StockImportChangeDto[] = [];
    const unknownIds: string[] = [];
    let unchanged = 0;

    const diffRow = (
      row: ImportRow,
      item: { id: string; title: string } & Record<string, unknown>,
    ): StockImportChangeDto[] => {
      const rowChanges: StockImportChangeDto[] = [];
      const compare = (field: EditableField, sheetValue: number | null) => {
        if (sheetValue === null) return; // empty cell = leave as-is
        if (sheetValue < 0) {
          throw new BadRequestException(
            `Valoare negativă pe rândul ${row.rowNumber} ("${item.title}") — nu este permisă.`,
          );
        }
        const dbRaw = item[field] as unknown;
        const dbValue = dbRaw === null || dbRaw === undefined ? null : Number(dbRaw);
        // Export rounds to 3 decimals — compare at the same precision so a
        // re-imported fresh export produces zero false diffs.
        if (dbValue !== null && Math.abs(dbValue - sheetValue) < 0.0005) return;
        if (dbValue === null && field !== 'purchasePrice') return; // never null in practice
        if (dbValue === null && sheetValue === 0) return;
        rowChanges.push(
          new StockImportChangeDto({
            id: item.id,
            name: item.title,
            field,
            from: dbValue,
            to: sheetValue,
          }),
        );
      };
      compare('stockCount', row.quantity);
      compare('purchasePrice', row.purchasePrice);
      compare('minimumStock', row.minimumStock);
      return rowChanges;
    };

    for (const row of rawRows) {
      const material = rawById.get(row.id);
      if (!material) {
        unknownIds.push(row.id);
        continue;
      }
      const rowChanges = diffRow(row, material);
      if (rowChanges.length === 0) unchanged++;
      changes.push(...rowChanges);
    }
    for (const row of consumableRows) {
      const consumable = consumableById.get(row.id);
      if (!consumable) {
        unknownIds.push(row.id);
        continue;
      }
      const rowChanges = diffRow(row, consumable);
      if (rowChanges.length === 0) unchanged++;
      changes.push(...rowChanges);
    }

    if (dryRun || changes.length === 0) {
      return new StockImportResultDto({ changes, unknownIds, unchanged, applied: false });
    }

    await this.prisma.$transaction(
      async (tx) => {
        for (const change of changes) {
          if (rawById.has(change.id)) {
            await this.applyRawMaterialChange(tx, change, userId);
          } else {
            await this.applyConsumableChange(tx, change, userId);
          }
        }
      },
      { timeout: 30000 },
    );

    this.logger.log(
      `Applied Excel stock import: ${changes.length} changes, ${unknownIds.length} unknown IDs`,
    );

    return new StockImportResultDto({ changes, unknownIds, unchanged, applied: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async applyRawMaterialChange(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    change: StockImportChangeDto,
    userId: string,
    referenceNote = 'Import Excel',
  ): Promise<void> {
    const material = await tx.rawMaterial.findUnique({ where: { id: change.id } });
    if (!material) return;

    if (change.field === 'purchasePrice') {
      await tx.rawMaterial.update({
        where: { id: change.id },
        data: { purchasePrice: change.to },
      });
      return;
    }
    if (change.field === 'minimumStock') {
      await tx.rawMaterial.update({
        where: { id: change.id },
        data: {
          minimumStock: change.to,
          status: deriveMaterialStatus(Number(material.stockCount), change.to, material.status),
        },
      });
      return;
    }

    // stockCount: apply the DELTA on the item's primary location (its largest
    // MaterialStock row, else the default location — the manual-AJUSTARE
    // fallback), then resync the global count as the sum of locations so it
    // lands exactly on the imported value.
    const delta = change.to - Number(material.stockCount);
    const primary = await tx.materialStock.findFirst({
      where: { rawMaterialId: change.id },
      orderBy: { quantity: 'desc' },
    });
    const locationId = primary?.locationId ?? (await this.resolveDefaultLocationId(tx));
    if (!locationId) {
      throw new BadRequestException(
        `Nicio locație configurată pentru ajustarea stocului "${change.name}". Asignează o locație.`,
      );
    }

    await tx.materialStock.upsert({
      where: { locationId_rawMaterialId: { locationId, rawMaterialId: change.id } },
      update: { quantity: primary ? Number(primary.quantity) + delta : change.to },
      create: { locationId, rawMaterialId: change.id, quantity: change.to },
    });

    const agg = await tx.materialStock.aggregate({
      where: { rawMaterialId: change.id },
      _sum: { quantity: true },
    });
    const newStockCount = Number(agg._sum.quantity ?? 0);
    await tx.rawMaterial.update({
      where: { id: change.id },
      data: {
        stockCount: newStockCount,
        status: deriveMaterialStatus(newStockCount, Number(material.minimumStock), material.status),
      },
    });

    await tx.stockMovement.create({
      data: {
        rawMaterialId: change.id,
        locationId,
        movementType: StockMovementType.AJUSTARE,
        quantity: delta,
        unit: material.unit,
        performedById: userId,
        referenceNote,
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async applyConsumableChange(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    change: StockImportChangeDto,
    userId: string,
    referenceNote = 'Import Excel',
  ): Promise<void> {
    const consumable = await tx.consumable.findUnique({ where: { id: change.id } });
    if (!consumable) return;

    if (change.field === 'purchasePrice') {
      await tx.consumable.update({
        where: { id: change.id },
        data: { purchasePrice: change.to },
      });
      return;
    }
    if (change.field === 'minimumStock') {
      await tx.consumable.update({
        where: { id: change.id },
        data: {
          minimumStock: change.to,
          status: deriveMaterialStatus(Number(consumable.stockCount), change.to, consumable.status),
        },
      });
      return;
    }

    // stockCount: consumables are global-only — set directly.
    const delta = change.to - Number(consumable.stockCount);
    await tx.consumable.update({
      where: { id: change.id },
      data: {
        stockCount: change.to,
        status: deriveMaterialStatus(change.to, Number(consumable.minimumStock), consumable.status),
      },
    });

    await tx.stockMovement.create({
      data: {
        consumableId: change.id,
        movementType: StockMovementType.AJUSTARE,
        quantity: delta,
        unit: UnitType.BUCATI,
        performedById: userId,
        referenceNote,
      },
    });
  }

  /**
   * Same default-location chain the stock service uses for manual adjustments:
   * first active LABORATOR, else first active location.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async resolveDefaultLocationId(tx: any): Promise<string | null> {
    const lab = await tx.location.findFirst({
      where: { isActive: true, type: 'LABORATOR' },
      orderBy: { createdAt: 'asc' },
    });
    if (lab) return lab.id;
    const any = await tx.location.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    return any?.id ?? null;
  }

  private readRows(sheet: ExcelJS.Worksheet | undefined): ImportRow[] {
    if (!sheet) return [];
    const rows: ImportRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const id = this.cellText(row.getCell(COL_ID));
      if (!id) return; // blank/padding row
      rows.push({
        id,
        rowNumber,
        quantity: this.cellNumber(row.getCell(COL_QUANTITY)),
        purchasePrice: this.cellNumber(row.getCell(COL_PRICE)),
        minimumStock: this.cellNumber(row.getCell(COL_MIN_STOCK)),
      });
    });
    return rows;
  }

  private cellText(cell: ExcelJS.Cell): string {
    // `cell.text` renders any value type (rich text, formula result…) as string.
    return (cell.text ?? '').trim();
  }

  private cellNumber(cell: ExcelJS.Cell): number | null {
    const value = cell.value;
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const n = parseFloat(value.replace(',', '.'));
      return Number.isNaN(n) ? null : n;
    }
    if (typeof value === 'object' && 'result' in value && typeof value.result === 'number') {
      return value.result;
    }
    return null;
  }
}
