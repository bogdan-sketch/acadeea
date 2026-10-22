import * as ExcelJS from 'exceljs';

import { normalizeProductName } from './name-matcher';

/**
 * Parser for POS sales reports (eBriza "vânzări pe produs" exports and any
 * similar spreadsheet). The exact eBriza layout isn't pinned down, so the
 * parser is header-driven rather than position-driven:
 *
 *   1. scan the first rows of every sheet for a header row that has a
 *      product-name column AND a quantity column (Romanian/English labels);
 *   2. read every following row with a name and a numeric quantity;
 *   3. skip totals/subtotals, merge duplicate product names (summed).
 *
 * Accepts .xlsx (exceljs) and .csv (`;`, `,` or tab separated). Legacy .xls
 * (BIFF) isn't readable — the caller gets a clear "save as .xlsx" error.
 */

export interface ParsedSalesRow {
  name: string;
  quantity: number;
  unit: string | null;
  /** 1-based row in the source sheet — for error messages / display. */
  rowNumber: number;
}

export interface ParsedSalesReport {
  rows: ParsedSalesRow[];
  sheetName: string | null;
  headers: { name: string; quantity: string; unit: string | null };
  skippedRows: number;
}

export class SalesReportParseError extends Error {}

const NAME_HEADER =
  /^(denumire|denumire produs|produs|produse|articol|articole|nume|nume produs|product|product name|product title|item|item name|descriere|titlu produs|nume articol)$/;
const NAME_HEADER_LOOSE = /(denumire|produs|articol|product|item)/;
const QTY_HEADER =
  /^(cantitate|cant|cantitate vanduta|cant vanduta|vandute|vanzari|qty|quantity|buc|nr buc|bucati|numar|cantitate totala|items sold|sold|units sold|bucati vandute|unitati vandute)$/;
const QTY_HEADER_LOOSE = /(cantitate|cant\b|qty|quantity|vandut|bucati|sold)/;
const UNIT_HEADER = /^(um|u m|unitate|unitate masura|unitate de masura|unit|uom)$/;
/** Columns that look numeric but are money — never the quantity. */
const MONEY_HEADER = /(pret|valoare|total|suma|lei|ron|tva|discount|incasat)/;
const TOTAL_ROW = /^(total|subtotal|totaluri|grand total|total general)\b/;

const HEADER_SCAN_ROWS = 40;

/** "1.234,50" | "1,234.50" | "12,5" | "3" → number; anything else → null. */
export function parseLocaleNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  let s = String(value).trim().replace(/\s+/g, '');
  if (!s || !/^-?[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // The later separator is the decimal one.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** exceljs cell value → plain string/number. */
function cellValue(v: ExcelJS.CellValue): string | number | null {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('result' in v && v.result != null) return cellValue(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
  }
  return null;
}

type Grid = (string | number | null)[][];

interface HeaderHit {
  rowIndex: number;
  nameCol: number;
  qtyCol: number;
  unitCol: number | null;
  labels: { name: string; quantity: string; unit: string | null };
}

function findHeader(grid: Grid): HeaderHit | null {
  const limit = Math.min(grid.length, HEADER_SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const row = grid[r] ?? [];
    const cells = row.map((c) => (typeof c === 'string' ? normalizeProductName(c) : ''));
    const pick = (strict: RegExp, loose: RegExp, exclude?: RegExp) => {
      let idx = cells.findIndex((c) => c && strict.test(c));
      if (idx === -1)
        idx = cells.findIndex((c) => c && loose.test(c) && !(exclude && exclude.test(c)));
      return idx;
    };
    const nameCol = pick(NAME_HEADER, NAME_HEADER_LOOSE, QTY_HEADER_LOOSE);
    const qtyCol = pick(QTY_HEADER, QTY_HEADER_LOOSE, MONEY_HEADER);
    if (nameCol === -1 || qtyCol === -1 || nameCol === qtyCol) continue;
    const unitIdx = cells.findIndex((c) => c && UNIT_HEADER.test(c));
    return {
      rowIndex: r,
      nameCol,
      qtyCol,
      unitCol: unitIdx === -1 ? null : unitIdx,
      labels: {
        name: String(row[nameCol]),
        quantity: String(row[qtyCol]),
        unit: unitIdx === -1 ? null : String(row[unitIdx]),
      },
    };
  }
  return null;
}

/** Turn one sheet grid into rows, or null when it has no recognizable header. */
export function parseGrid(grid: Grid, sheetName: string | null = null): ParsedSalesReport | null {
  const header = findHeader(grid);
  if (!header) return null;

  const merged = new Map<string, ParsedSalesRow>();
  let skipped = 0;
  for (let r = header.rowIndex + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const rawName = row[header.nameCol];
    const name = rawName == null ? '' : String(rawName).trim();
    if (!name) continue;
    if (TOTAL_ROW.test(normalizeProductName(name))) continue;
    const qty = parseLocaleNumber(row[header.qtyCol]);
    if (qty == null || qty === 0) {
      skipped++;
      continue;
    }
    const unitRaw = header.unitCol == null ? null : row[header.unitCol];
    const unit = unitRaw == null || String(unitRaw).trim() === '' ? null : String(unitRaw).trim();
    const key = normalizeProductName(name) + '|' + (unit ?? '').toLowerCase();
    const existing = merged.get(key);
    if (existing) existing.quantity = Math.round((existing.quantity + qty) * 1000) / 1000;
    else merged.set(key, { name, quantity: qty, unit, rowNumber: r + 1 });
  }

  return { rows: [...merged.values()], sheetName, headers: header.labels, skippedRows: skipped };
}

/** Minimal CSV reader: quotes, `""` escapes, auto-detected separator. */
export function parseCsv(text: string): Grid {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].reduce((best, s) =>
    firstLine.split(s).length > firstLine.split(best).length ? s : best,
  );
  const rows: Grid = [];
  let row: (string | null)[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function isXlsx(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK" zip
}

function isLegacyXls(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf; // OLE2
}

/**
 * CSV exports are not always UTF-8: eBriza writes UTF-16LE without a BOM
 * (every other byte is NUL). Detect BOMs first, then the NUL pattern, and
 * fall back to UTF-8.
 */
export function decodeText(buffer: Buffer): string {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
    if (buffer[0] === 0xfe && buffer[1] === 0xff) return swapUtf16(buffer.subarray(2));
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  let nulOdd = 0;
  let nulEven = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) {
      if (i % 2 === 1) nulOdd++;
      else nulEven++;
    }
  }
  const half = Math.floor(sample.length / 2);
  if (half > 0 && nulOdd > half * 0.3 && nulEven === 0) return buffer.toString('utf16le');
  if (half > 0 && nulEven > half * 0.3 && nulOdd === 0) return swapUtf16(buffer);
  return buffer.toString('utf8');
}

function swapUtf16(buffer: Buffer): string {
  const swapped = Buffer.from(buffer);
  swapped.swap16();
  return swapped.toString('utf16le');
}

export async function parseSalesReport(buffer: Buffer): Promise<ParsedSalesReport> {
  if (isLegacyXls(buffer)) {
    throw new SalesReportParseError(
      'Fișierul e în formatul vechi .xls. Deschide-l în Excel și salvează-l ca .xlsx (sau .csv), apoi încarcă-l din nou.',
    );
  }

  const grids: { name: string | null; grid: Grid }[] = [];
  if (isXlsx(buffer)) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new SalesReportParseError('Fișierul încărcat nu este un .xlsx valid.');
    }
    workbook.eachSheet((sheet) => {
      const grid: Grid = [];
      sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const values: (string | number | null)[] = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          values[col - 1] = cellValue(cell.value);
        });
        grid[rowNumber - 1] = values;
      });
      for (let i = 0; i < grid.length; i++) grid[i] = grid[i] ?? [];
      grids.push({ name: sheet.name, grid });
    });
  } else {
    grids.push({ name: null, grid: parseCsv(decodeText(buffer)) });
  }

  for (const { name, grid } of grids) {
    const parsed = parseGrid(grid, name);
    if (parsed && parsed.rows.length > 0) return parsed;
  }

  throw new SalesReportParseError(
    'Nu am găsit în fișier un tabel cu coloanele „Denumire/Produs" și „Cantitate". Verifică exportul din eBriza (raport vânzări pe produse).',
  );
}
