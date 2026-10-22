import * as ExcelJS from 'exceljs';

import { parseCsv, parseGrid, parseLocaleNumber, parseSalesReport } from './sales-report.parser';

describe('sales-report.parser', () => {
  it('parses Romanian and English number formats', () => {
    expect(parseLocaleNumber('1.234,50')).toBe(1234.5);
    expect(parseLocaleNumber('1,234.50')).toBe(1234.5);
    expect(parseLocaleNumber('12,5')).toBe(12.5);
    expect(parseLocaleNumber(7)).toBe(7);
    expect(parseLocaleNumber('abc')).toBeNull();
  });

  it('finds the header below report preamble, skips totals, merges duplicates', () => {
    const grid = [
      ['Raport vânzări pe produse'],
      ['Perioada: 01.10.2026 - 01.10.2026'],
      [],
      ['Nr.', 'Denumire', 'U.M.', 'Cantitate', 'Preț', 'Valoare'],
      [1, 'Savarină', 'buc', 3, 15, 45],
      [2, 'Sos usturoi', 'buc', '2,5', 4, 10],
      [3, 'Savarină', 'buc', 1, 15, 15],
      [4, 'Ecler', 'buc', 0, 9, 0],
      ['', 'Total', '', 6.5, '', 70],
    ];
    const parsed = parseGrid(grid);
    if (!parsed) throw new Error('no header');
    expect(parsed.headers).toEqual({ name: 'Denumire', quantity: 'Cantitate', unit: 'U.M.' });
    expect(parsed.rows).toEqual([
      { name: 'Savarină', quantity: 4, unit: 'buc', rowNumber: 5 },
      { name: 'Sos usturoi', quantity: 2.5, unit: 'buc', rowNumber: 6 },
    ]);
    expect(parsed.skippedRows).toBe(1);
  });

  it('never picks a money column as quantity', () => {
    const parsed = parseGrid([
      ['Produs', 'Valoare totala', 'Cant.'],
      ['Tort', 200, 2],
    ]);
    expect(parsed?.rows[0]?.quantity).toBe(2);
  });

  it('reads semicolon CSV with quotes', () => {
    const grid = parseCsv('Produs;Cantitate\n"Tort ""Opera""";2\nEcler;5\n');
    expect(parseGrid(grid)?.rows.map((r) => [r.name, r.quantity])).toEqual([
      ['Tort "Opera"', 2],
      ['Ecler', 5],
    ]);
  });

  it('reads a real .xlsx buffer', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Vanzari');
    ws.addRow(['Articol', 'Cantitate']);
    ws.addRow(['Macarons', 12]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const parsed = await parseSalesReport(buf);
    expect(parsed.sheetName).toBe('Vanzari');
    expect(parsed.rows).toEqual([{ name: 'Macarons', quantity: 12, unit: null, rowNumber: 2 }]);
  });

  it('rejects legacy .xls with a helpful message', async () => {
    const xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
    await expect(parseSalesReport(xls)).rejects.toThrow('.xlsx');
  });
});
