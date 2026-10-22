import { extractWooPickupText, parseWooConfig } from './woocommerce.client';

describe('extractWooPickupText', () => {
  const orderWithPickup = (key: string, value: unknown) => ({
    id: 1,
    line_items: [
      {
        product_id: 42,
        quantity: 1,
        meta_data: [
          { key: '_some_internal', value: 'x' },
          { key, value },
        ],
      },
    ],
  });

  it('finds the pickup meta by a diacritic/case-insensitive "ridic" key', () => {
    const order = orderWithPickup('Comanda se ridică de la cofetărie în data de', '28.07.2026');
    expect(extractWooPickupText(order)).toBe('28.07.2026');
  });

  it('matches even when the key is upper-case / unaccented', () => {
    const order = orderWithPickup('SE RIDICA DIN MAGAZIN', '26 iulie');
    expect(extractWooPickupText(order)).toBe('26 iulie');
  });

  it('returns the first matching value across multiple line items', () => {
    const order = {
      id: 2,
      line_items: [
        { product_id: 1, meta_data: [{ key: 'nimic', value: 'a' }] },
        { product_id: 2, meta_data: [{ key: 'Ridicare comanda', value: 'maine' }] },
        { product_id: 3, meta_data: [{ key: 'ridic', value: 'ignored' }] },
      ],
    };
    expect(extractWooPickupText(order)).toBe('maine');
  });

  it('coerces a non-string value to string', () => {
    expect(extractWooPickupText(orderWithPickup('se ridica', 123))).toBe('123');
  });

  it('returns null when no pickup meta is present', () => {
    const order = {
      id: 3,
      line_items: [{ product_id: 1, meta_data: [{ key: 'culoare', value: 'roz' }] }],
    };
    expect(extractWooPickupText(order)).toBeNull();
  });

  it('returns null for missing / malformed orders', () => {
    expect(extractWooPickupText(null)).toBeNull();
    expect(extractWooPickupText(undefined)).toBeNull();
    expect(extractWooPickupText({ id: 4 } as never)).toBeNull();
    expect(extractWooPickupText({ id: 5, line_items: [{ product_id: 1 }] })).toBeNull();
  });

  it('skips empty-string pickup values', () => {
    expect(extractWooPickupText(orderWithPickup('se ridica', '   '))).toBeNull();
  });
});

describe('parseWooConfig', () => {
  it('reads the canonical key names and strips a trailing slash', () => {
    const creds = parseWooConfig({
      storeUrl: 'https://shop.example.com/',
      consumerKey: 'ck_abc',
      consumerSecret: 'cs_xyz',
    });
    expect(creds).toEqual({
      storeUrl: 'https://shop.example.com',
      consumerKey: 'ck_abc',
      consumerSecret: 'cs_xyz',
    });
  });

  it('accepts the short aliases url / ck / cs', () => {
    const creds = parseWooConfig({
      url: 'https://shop.example.com',
      ck: 'ck_abc',
      cs: 'cs_xyz',
    });
    expect(creds.storeUrl).toBe('https://shop.example.com');
    expect(creds.consumerKey).toBe('ck_abc');
    expect(creds.consumerSecret).toBe('cs_xyz');
  });

  it('throws (secret-free) when required fields are missing', () => {
    expect(() => parseWooConfig({ storeUrl: 'https://x.com' })).toThrow(/consumerKey/);
    expect(() => parseWooConfig({})).toThrow(/storeUrl/);
  });

  it('rejects a non-absolute store URL', () => {
    expect(() => parseWooConfig({ storeUrl: 'shop.example.com', ck: 'a', cs: 'b' })).toThrow(
      /absolute http/,
    );
  });
});
