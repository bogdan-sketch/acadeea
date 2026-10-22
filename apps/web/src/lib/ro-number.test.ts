import { describe, expect, it } from 'vitest';
import { decimalInputText, parseDecimal } from './ro-number';

describe('parseDecimal', () => {
  it('reads Romanian and plain decimals', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('1.5')).toBe(1.5);
    expect(parseDecimal(' 2 ')).toBe(2);
    expect(parseDecimal('-0,25')).toBe(-0.25);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('3,')).toBe(3);
  });

  it('treats the last separator as decimal and the other as grouping', () => {
    expect(parseDecimal('1.250,5')).toBe(1250.5);
    expect(parseDecimal('1,250.5')).toBe(1250.5);
    expect(parseDecimal('12.345.678,9')).toBe(12345678.9);
  });

  it('ignores space grouping (plain and non-breaking)', () => {
    expect(parseDecimal('1 000,5')).toBe(1000.5);
    expect(parseDecimal('1 000,5')).toBe(1000.5);
    expect(parseDecimal('1 000,5')).toBe(1000.5);
  });

  it('rejects exponents, type suffixes, hex and non-finite words', () => {
    for (const bad of ['1e5', '1E5', '2f', '3d', '0x10', 'Infinity', 'NaN', '1,2,3', '1.2.3']) {
      expect(parseDecimal(bad), bad).toBeNull();
    }
  });

  it('returns null for blank input', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
    expect(parseDecimal('-')).toBeNull();
  });
});

describe('decimalInputText', () => {
  it('writes a stored number with a Romanian comma, never scientific notation', () => {
    expect(decimalInputText(1.5)).toBe('1,5');
    expect(decimalInputText(2)).toBe('2');
    expect(decimalInputText(0.0001)).toBe('0,0001');
    expect(decimalInputText(0.0000001)).toBe('0');
    expect(decimalInputText(0.125)).toBe('0,125');
    expect(decimalInputText(1250.5)).toBe('1250,5');
  });

  it('round-trips through parseDecimal', () => {
    for (const v of [0.0001, 0.125, 1.5, 1250.5, 12345.678]) {
      expect(parseDecimal(decimalInputText(v))).toBe(v);
    }
  });

  it('is empty for missing values', () => {
    expect(decimalInputText(null)).toBe('');
    expect(decimalInputText(undefined)).toBe('');
    expect(decimalInputText(Number.NaN)).toBe('');
  });
});
