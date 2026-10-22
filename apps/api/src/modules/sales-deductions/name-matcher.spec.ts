import { CONFIDENT_SCORE, normalizeProductName, rankCandidates, scorePair } from './name-matcher';

describe('name-matcher', () => {
  const products = [
    { id: 'sos', name: 'Sos de usturoi' },
    { id: 'tort-cioc', name: 'Tort Ciocolată' },
    { id: 'tort-fruct', name: 'Tort de fructe' },
    { id: 'eclair', name: 'Ecler vanilie' },
    { id: 'savarina', name: 'Savarină' },
  ];

  it('normalizes case, diacritics and punctuation', () => {
    expect(normalizeProductName('  Savarină, (BUC) ')).toBe('savarina buc');
    expect(normalizeProductName('Tort 1,5kg')).toBe('tort 1,5kg');
  });

  it('treats stopwords as noise: "sos usturoi" is "sos de usturoi"', () => {
    const r = scorePair('sos usturoi', 'Sos de usturoi');
    expect(r.score).toBeGreaterThanOrEqual(CONFIDENT_SCORE);
  });

  it('exact after normalization scores 1', () => {
    expect(scorePair('SAVARINA', 'Savarină')).toEqual({ score: 1, kind: 'EXACT' });
  });

  it('ignores pack sizes when the rest matches', () => {
    const r = scorePair('Tort ciocolata 1kg', 'Tort Ciocolată');
    expect(r.score).toBeGreaterThanOrEqual(CONFIDENT_SCORE);
  });

  it('a lone shared word is only a weak containment', () => {
    const r = scorePair('Tort', 'Tort de fructe cu frisca');
    expect(r.kind).toBe('CONTAINS');
    expect(r.score).toBeLessThan(CONFIDENT_SCORE);
  });

  it('fuzzy-matches small typos', () => {
    const [best] = rankCandidates('Ecler vanilla', products);
    expect(best?.id).toBe('eclair');
  });

  it('confirmed alias wins outright', () => {
    const aliases = new Map([[normalizeProductName('Ciocolata mare'), 'tort-cioc']]);
    const [best] = rankCandidates('Ciocolată MARE', products, aliases);
    expect(best).toMatchObject({ id: 'tort-cioc', kind: 'ALIAS', score: 1 });
  });

  it('returns nothing for unrelated names', () => {
    expect(rankCandidates('Cafea espresso', products)).toEqual([]);
  });
});
