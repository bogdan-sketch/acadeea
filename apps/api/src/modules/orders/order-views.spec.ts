import {
  autoDeliveryKind,
  defaultDeliveryLabel,
  deliveryMethodWhere,
  sortForDeliveries,
  splitDeliveryMethods,
} from './order-views';

const row = (id: string, due: string | null, created = '2026-10-01T10:00:00Z') => ({
  id,
  dueDate: due ? new Date(due) : null,
  createdAt: new Date(created),
});

describe('sortForDeliveries', () => {
  const now = new Date('2026-10-18T09:00:00Z'); // Sunday 18 Oct, 12:00 in Bucharest

  it('puts the furthest delivery first and undated orders under today', () => {
    const sorted = sortForDeliveries(
      [
        row('yesterday', '2026-10-17T00:00:00Z'),
        row('undated', null),
        row('nextWeek', '2026-10-25T00:00:00Z'),
        row('todayTimed', '2026-10-18T08:30:00Z'),
        row('tomorrow', '2026-10-19T00:00:00Z'),
      ],
      now,
    );
    expect(sorted.map((r) => r.id)).toEqual([
      'nextWeek',
      'tomorrow',
      'todayTimed',
      'undated',
      'yesterday',
    ]);
  });

  it('uses the Romanian day (late-evening UTC instants belong to the next day)', () => {
    // 22:30Z on the 18th = 01:30 on the 19th in Bucharest.
    const sorted = sortForDeliveries(
      [
        row('todayLate', '2026-10-18T20:00:00Z'), // 23:00 on the 18th
        row('late', '2026-10-18T22:30:00Z'),
        row('undated', null),
      ],
      now,
    );
    expect(sorted.map((r) => r.id)).toEqual(['late', 'todayLate', 'undated']);
  });

  it('breaks ties by newest placed', () => {
    const sorted = sortForDeliveries(
      [row('older', null, '2026-10-10T10:00:00Z'), row('newer', null, '2026-10-12T10:00:00Z')],
      now,
    );
    expect(sorted.map((r) => r.id)).toEqual(['newer', 'older']);
  });
});

describe('delivery method helpers', () => {
  it('splits joined methods', () => {
    expect(splitDeliveryMethods('Ridicare Napoca + Livrare în Cluj ')).toEqual([
      'Ridicare Napoca',
      'Livrare în Cluj',
    ]);
    expect(splitDeliveryMethods(null)).toEqual([]);
  });

  it('matches whole parts only', () => {
    expect(deliveryMethodWhere('Livrare în Cluj')).toEqual({
      OR: [
        { deliveryMethod: 'Livrare în Cluj' },
        { deliveryMethod: { startsWith: 'Livrare în Cluj + ' } },
        { deliveryMethod: { endsWith: ' + Livrare în Cluj' } },
        { deliveryMethod: { contains: ' + Livrare în Cluj + ' } },
      ],
    });
  });
});

describe('delivery method labels + kinds', () => {
  it('drops the implied pickup prefix', () => {
    expect(defaultDeliveryLabel('Ridicare la Acadeea Napoca')).toBe('Acadeea Napoca');
    expect(defaultDeliveryLabel('Ridicare de la cofetărie')).toBe('Cofetărie');
    expect(defaultDeliveryLabel('Livrare la Domiciliu')).toBe('Livrare la Domiciliu');
    expect(defaultDeliveryLabel('Ridicare la ')).toBe('Ridicare la ');
  });

  it('detects the kind from imported orders, then the name', () => {
    expect(autoDeliveryKind('Acadeea Napoca', 3, 1)).toBe('PICKUP');
    expect(autoDeliveryKind('Ridicare la Acadeea Napoca', 0, 4)).toBe('PICKUP');
    expect(autoDeliveryKind('Livrare la Domiciliu', 0, 4)).toBe('DELIVERY');
  });
});
