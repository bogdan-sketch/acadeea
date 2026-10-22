import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  BULK_DELETE_RESOURCES,
  BULK_DEPENDENT_LABELS,
  describeDependents,
  mergeCounts,
  toDependents,
} from './bulk-actions.resources';
import { reasonOf } from './bulk-delete.service';

describe('bulk-delete resources', () => {
  it('covers the seven list screens', () => {
    expect([...BULK_DELETE_RESOURCES]).toEqual([
      'tasks',
      'orders',
      'transfers',
      'raw-materials',
      'consumables',
      'recipes',
      'sales-deductions',
    ]);
  });

  it('toDependents drops zeros, keeps declaration order and attaches Romanian labels', () => {
    const deps = toDependents({ tasks: 2, subtasks: 0, orderLines: 1 });
    expect(deps.map((d) => d.key)).toEqual(['tasks', 'orderLines']);
    expect(deps[0]?.label).toBe(BULK_DEPENDENT_LABELS.tasks);
    expect(deps[0]?.count).toBe(2);
  });

  it('mergeCounts sums per key across rows', () => {
    const acc = { tasks: 1 };
    mergeCounts(acc, { tasks: 2, orderLines: 3 });
    mergeCounts(acc, { orderLines: 0 });
    expect(acc).toEqual({ tasks: 3, orderLines: 3 });
  });

  it('describeDependents renders "label: count" pairs', () => {
    expect(describeDependents(toDependents({ confirmedDeductions: 2 }))).toBe(
      `${BULK_DEPENDENT_LABELS.confirmedDeductions}: 2`,
    );
  });
});

describe('reasonOf', () => {
  it('uses the HttpException message (string or object)', () => {
    expect(reasonOf(new BadRequestException('Nu se poate.'))).toBe('Nu se poate.');
    expect(reasonOf(new NotFoundException({ errorCode: 'X', message: 'Lipsă.' }))).toBe('Lipsă.');
  });

  it('maps a Prisma FK violation to a user-facing sentence', () => {
    const err = new Prisma.PrismaClientKnownRequestError('fk', {
      code: 'P2003',
      clientVersion: 'x',
    });
    expect(reasonOf(err)).toContain('integritate');
  });

  it('falls back to Error.message / unknown', () => {
    expect(reasonOf(new Error('boom'))).toBe('boom');
    expect(reasonOf('???')).toBe('Eroare necunoscută');
  });
});
