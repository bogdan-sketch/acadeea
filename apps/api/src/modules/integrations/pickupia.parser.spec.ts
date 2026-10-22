import { extractPickupiaDelivery, PickupiaDelivery, pickupiaMethodLabel } from './pickupia.parser';
import { WooOrder } from './woocommerce.client';

describe('extractPickupiaDelivery', () => {
  it('returns null for an order without Pickupia meta (legacy orders)', () => {
    const order: WooOrder = {
      id: 1,
      line_items: [{ meta_data: [{ key: 'Comanda se ridică de la cofetărie', value: 'mâine' }] }],
    };
    expect(extractPickupiaDelivery(order)).toBeNull();
  });

  it('reads order-level delivery groups, earliest date first', () => {
    const order: WooOrder = {
      id: 2,
      meta_data: [
        {
          key: '_pickupia_delivery_groups',
          value: [
            { method_id: 7, method: 'Livrare la domiciliu', external_id: '', date: '2026-10-21' },
            {
              method_id: 5,
              method: 'Ridicare Napoca 15',
              external_id: 'napoca-15',
              date: '2026-10-19',
            },
          ],
        },
      ],
    };
    const d = extractPickupiaDelivery(order) as PickupiaDelivery;
    expect(d.dueDate?.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(d.groups.map((g) => g.externalId)).toEqual(['napoca-15', null]);
    expect(pickupiaMethodLabel(d)).toBe('Ridicare Napoca 15 + Livrare la domiciliu');
  });

  it('puts no-date methods last and falls back to the order-level date', () => {
    const order: WooOrder = {
      id: 3,
      meta_data: [
        { key: '_pickupia_pickup_date', value: '2026-11-02' },
        {
          key: '_pickupia_delivery_groups',
          value: [{ method_id: 9, method: 'Livrare națională', external_id: '', date: '' }],
        },
      ],
    };
    const d = extractPickupiaDelivery(order) as PickupiaDelivery;
    expect(d.groups).toEqual([{ method: 'Livrare națională', externalId: null, date: null }]);
    expect(d.dueDate?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('falls back to line-item meta and dedupes repeated groups', () => {
    const item = {
      meta_data: [
        { key: '_pickupia_delivery_method', value: '5' },
        { key: '_pickupia_delivery_method_external_id', value: 'napoca-15' },
        { key: 'Metodă de livrare', value: 'Ridicare Napoca 15' },
        { key: '_pickupia_pickup_date', value: '2026-10-19' },
        { key: 'Data livrării', value: 'luni, 19 octombrie 2026' },
      ],
    };
    const d = extractPickupiaDelivery({ id: 4, line_items: [item, item] }) as PickupiaDelivery;
    expect(d.groups).toEqual([
      { method: 'Ridicare Napoca 15', externalId: 'napoca-15', date: '2026-10-19' },
    ]);
  });

  it('uses the single-method order meta when nothing else is there', () => {
    const d = extractPickupiaDelivery({
      id: 5,
      meta_data: [
        { key: '_pickupia_pickup_date', value: '2026-10-25' },
        { key: '_pickupia_delivery_method_name', value: 'Ridicare Mărăști' },
        { key: '_pickupia_delivery_method_external_id', value: 'marasti' },
      ],
    }) as PickupiaDelivery;
    expect(d.groups).toEqual([
      { method: 'Ridicare Mărăști', externalId: 'marasti', date: '2026-10-25' },
    ]);
  });

  it('ignores malformed dates', () => {
    const d = extractPickupiaDelivery({
      id: 6,
      meta_data: [{ key: '_pickupia_pickup_date', value: '2026-02-31' }],
    });
    expect(d).toBeNull();
  });
});

describe('resolveWooDelivery', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolveWooDelivery } = require('./integrations.service');
  const legacy = { key: 'Comanda se ridică de la cofetărie', value: '20.10.2026' };

  it('prefers the Pickupia date over the deprecated free-text field', () => {
    const d = resolveWooDelivery({
      id: 7,
      date_created: '2026-10-17T10:00:00',
      meta_data: [{ key: '_pickupia_pickup_date', value: '2026-10-19' }],
      line_items: [{ meta_data: [legacy] }],
    });
    expect(d.dueDate.toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });

  it('still honours the free-text field when Pickupia is absent', () => {
    const d = resolveWooDelivery({
      id: 8,
      date_created: '2026-10-17T10:00:00',
      line_items: [{ meta_data: [legacy] }],
    });
    expect(d.pickupia).toBeNull();
    expect(d.dueDate.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });
});

describe('Scheduled Pickup (_spw_ keys, the plugin before Pickupia)', () => {
  it('reads the same data under the old prefix', () => {
    const d = extractPickupiaDelivery({
      id: 9,
      meta_data: [
        { key: '_spw_pickup_date', value: '2026-10-21' },
        {
          key: '_spw_delivery_groups',
          value: [
            { method_id: 3, method: 'Ridicare Napoca', external_id: 'napoca', date: '2026-10-21' },
          ],
        },
      ],
    }) as PickupiaDelivery;
    expect(d.groups).toEqual([
      { method: 'Ridicare Napoca', externalId: 'napoca', date: '2026-10-21' },
    ]);
    expect(d.dueDate?.toISOString()).toBe('2026-10-21T00:00:00.000Z');
  });

  it('reads old line-item meta (no order-level groups yet)', () => {
    const d = extractPickupiaDelivery({
      id: 10,
      meta_data: [{ key: '_spw_pickup_date', value: '2026-10-19' }],
      line_items: [
        {
          meta_data: [
            { key: '_spw_delivery_method', value: '3' },
            { key: 'Mod de livrare', value: 'Ridicare din cofetărie' },
            { key: '_spw_pickup_date', value: '2026-10-19' },
          ],
        },
      ],
    }) as PickupiaDelivery;
    expect(d.groups).toEqual([
      { method: 'Ridicare din cofetărie', externalId: null, date: '2026-10-19' },
    ]);
  });
});
