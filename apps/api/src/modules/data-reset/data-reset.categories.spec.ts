import {
  RESET_CATEGORIES,
  RESET_CATEGORY_KEYS,
  RESET_EXECUTION_ORDER,
  resolveCategories,
} from './data-reset.categories';

describe('data-reset categories', () => {
  it('every category key is in the execution order exactly once', () => {
    expect([...RESET_EXECUTION_ORDER].sort()).toEqual([...RESET_CATEGORY_KEYS].sort());
    expect(RESET_CATEGORIES.map((c) => c.key).sort()).toEqual([...RESET_CATEGORY_KEYS].sort());
  });

  it('recipes and raw materials are the only "danger" categories and are never implied', () => {
    const danger = RESET_CATEGORIES.filter((c) => c.danger).map((c) => c.key);
    expect(danger.sort()).toEqual(['RAW_MATERIALS', 'RECIPES']);
    for (const cat of RESET_CATEGORIES) {
      expect(cat.requires).not.toContain('RECIPES');
      expect(cat.requires).not.toContain('RAW_MATERIALS');
    }
  });

  it('resolveCategories adds transitive dependencies in execution order', () => {
    expect(resolveCategories(['RECIPES'])).toEqual([
      'TASKS',
      'SALES',
      'ORDERS',
      'TRANSFERS',
      'STOCK',
      'RECIPES',
    ]);
    expect(resolveCategories(['RAW_MATERIALS'])).toEqual(['TRANSFERS', 'STOCK', 'RAW_MATERIALS']);
    expect(resolveCategories(['NOTIFICATIONS', 'TASKS'])).toEqual(['TASKS', 'NOTIFICATIONS']);
    expect(resolveCategories([])).toEqual([]);
  });

  it('dependencies always run before the category that needs them', () => {
    for (const cat of RESET_CATEGORIES) {
      const idx = RESET_EXECUTION_ORDER.indexOf(cat.key);
      for (const dep of cat.requires) {
        expect(RESET_EXECUTION_ORDER.indexOf(dep)).toBeLessThan(idx);
      }
    }
  });

  it('FK-restricted parents are listed after their children inside a category', () => {
    const position = (key: string, model: string): number => {
      const tables = RESET_CATEGORIES.find((c) => c.key === key)?.tables.map((t) => t.model) ?? [];
      return tables.indexOf(model);
    };
    expect(position('TASKS', 'StockReservation')).toBeLessThan(position('TASKS', 'Task'));
    expect(position('ORDERS', 'OrderItem')).toBeLessThan(position('ORDERS', 'Order'));
    expect(position('STOCK', 'MaterialStock')).toBeGreaterThanOrEqual(0);
    expect(position('RAW_MATERIALS', 'RecipeIngredient')).toBeLessThan(
      position('RAW_MATERIALS', 'RawMaterial'),
    );
  });

  it('every table scopes by organization (direct column or relation path)', () => {
    for (const cat of RESET_CATEGORIES) {
      for (const t of cat.tables) {
        expect(JSON.stringify(t.where('org-1'))).toContain('org-1');
      }
    }
  });
});
