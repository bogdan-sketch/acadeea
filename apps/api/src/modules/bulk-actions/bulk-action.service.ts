import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  MaterialStatus,
  OrderStatus,
  SystemLogLevel,
  TaskStatus,
  TransferStatus,
} from '@prisma/client';

import { JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { TasksService } from '@/modules/tasks/tasks.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { LocationsService } from '@/modules/locations/locations.service';
import { RawMaterialsService } from '@/modules/raw-materials/raw-materials.service';
import { ConsumablesService } from '@/modules/consumables/consumables.service';
import { RecipesService } from '@/modules/recipes/recipes.service';
import { SalesDeductionsService } from '@/modules/sales-deductions/sales-deductions.service';
import { SystemLogsService } from '@/modules/system-logs/system-logs.service';
import { BULK_ACTIONS, BulkDeleteResource } from './bulk-actions.resources';
import { reasonOf } from './bulk-delete.service';
import { BulkActionResultDto } from './dto';

type Params = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Parameter readers — throw a Romanian BadRequest when the shape is wrong. */
const read = {
  enum<T extends string>(p: Params, key: string, allowed: readonly T[]): T {
    const v = p[key];
    if (typeof v !== 'string' || !allowed.includes(v as T)) {
      throw new BadRequestException(
        `Parametrul „${key}” trebuie să fie unul din: ${allowed.join(', ')}.`,
      );
    }
    return v as T;
  },
  uuid(p: Params, key: string): string {
    const v = p[key];
    if (typeof v !== 'string' || !UUID_RE.test(v)) {
      throw new BadRequestException(`Parametrul „${key}” trebuie să fie un id valid.`);
    }
    return v;
  },
  uuidOrNull(p: Params, key: string): string | null {
    const v = p[key];
    if (v === null || v === undefined || v === '') return null;
    return read.uuid(p, key);
  },
  isoDate(p: Params, key: string): string {
    const v = p[key];
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) {
      throw new BadRequestException(`Parametrul „${key}” trebuie să fie o dată validă (ISO).`);
    }
    return new Date(v).toISOString();
  },
  int(p: Params, key: string, min: number, max: number): number {
    const v = p[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      throw new BadRequestException(
        `Parametrul „${key}” trebuie să fie un întreg între ${min} și ${max}.`,
      );
    }
    return v;
  },
  number(p: Params, key: string, min: number): number {
    const v = p[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min) {
      throw new BadRequestException(`Parametrul „${key}” trebuie să fie un număr ≥ ${min}.`);
    }
    return v;
  },
  bool(p: Params, key: string): boolean {
    const v = p[key];
    if (typeof v !== 'boolean')
      throw new BadRequestException(`Parametrul „${key}” trebuie să fie true/false.`);
    return v;
  },
  stringOrNull(p: Params, key: string, max = 100): string | null {
    const v = p[key];
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string' || v.length > max) {
      throw new BadRequestException(`Parametrul „${key}” trebuie să fie text (max ${max}).`);
    }
    return v.trim();
  },
  optionalString(p: Params, key: string, max = 500): string | undefined {
    const v = p[key];
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v !== 'string' || v.length > max) {
      throw new BadRequestException(`Parametrul „${key}” trebuie să fie text (max ${max}).`);
    }
    return v;
  },
};

/**
 * Bulk actions other than delete ("Selectează" → Acțiuni on the list screens).
 * Every action maps 1:1 onto the resource's existing single-row service call,
 * so business rules (status machines, stock side effects, permissions inside
 * services) are reused untouched; rows run one by one and failures are
 * reported per row, never aborting the batch.
 */
@Injectable()
export class BulkActionService {
  private readonly logger = new Logger(BulkActionService.name);

  constructor(
    private readonly tasks: TasksService,
    private readonly orders: OrdersService,
    private readonly locations: LocationsService,
    private readonly rawMaterials: RawMaterialsService,
    private readonly consumables: ConsumablesService,
    private readonly recipes: RecipesService,
    private readonly salesDeductions: SalesDeductionsService,
    private readonly systemLogs: SystemLogsService,
  ) {}

  async run(
    resource: BulkDeleteResource,
    ids: string[],
    action: string,
    rawParams: Params | undefined,
    user: JwtPayload,
  ): Promise<BulkActionResultDto> {
    const allowed = BULK_ACTIONS[resource] as readonly string[];
    if (!allowed.includes(action)) {
      throw new BadRequestException(
        `Acțiunea „${action}” nu există pentru ${resource}. Disponibile: ${allowed.join(', ')}.`,
      );
    }
    const params = rawParams ?? {};
    // Validate once (throws 400 before touching any row), then apply per id.
    const apply = this.compile(resource, action, params, user);

    const result: BulkActionResultDto = { done: [], failed: [] };
    for (const id of [...new Set(ids)]) {
      try {
        await apply(id);
        result.done.push(id);
      } catch (err) {
        result.failed.push({ id, reason: reasonOf(err) });
      }
    }

    this.logger.log(
      `Bulk ${resource}.${action}: ${result.done.length} done, ${result.failed.length} failed by ${user.email ?? user.userId}`,
    );
    if (result.done.length > 0) {
      this.systemLogs.log({
        category: 'SYSTEM',
        action: 'bulk.action',
        level: SystemLogLevel.INFO,
        message: `Acțiune multiplă ${resource}.${action}: ${result.done.length} rânduri${
          result.failed.length ? `, ${result.failed.length} eșuate` : ''
        }`,
        organizationId: user.organizationId,
        userId: user.userId,
        userEmail: user.email ?? null,
        metadata: { resource, action, params, done: result.done, failed: result.failed },
      });
    }
    return result;
  }

  /** Validates the params for (resource, action) and returns the per-row applier. */
  private compile(
    resource: BulkDeleteResource,
    action: string,
    p: Params,
    user: JwtPayload,
  ): (id: string) => Promise<unknown> {
    switch (resource) {
      case 'tasks':
        switch (action) {
          case 'status': {
            // FINALIZAT needs a yield per task — not a bulk thing. IN_LUCRU may 409 per row (stock).
            const status = read.enum(p, 'status', [
              TaskStatus.DE_FACUT,
              TaskStatus.IN_LUCRU,
              TaskStatus.ANULAT,
            ]);
            const reason = read.optionalString(p, 'reason');
            return (id) => this.tasks.transition(id, { status, reason }, user);
          }
          case 'assign': {
            const assignedToId = read.uuid(p, 'assignedToId');
            return (id) => this.tasks.assignTask(id, assignedToId, user);
          }
          case 'plannedDate': {
            const plannedDate = read.isoDate(p, 'plannedDate');
            return (id) => this.tasks.update(id, { plannedDate }, user.userId);
          }
          case 'dueDate': {
            const dueDate = read.isoDate(p, 'dueDate');
            return (id) => this.tasks.update(id, { dueDate }, user.userId);
          }
          case 'priority': {
            const priority = read.int(p, 'priority', 1, 5);
            return (id) => this.tasks.update(id, { priority }, user.userId);
          }
          case 'location': {
            const locationId = read.uuid(p, 'locationId');
            return (id) => this.tasks.update(id, { locationId }, user.userId);
          }
        }
        break;
      case 'orders':
        switch (action) {
          case 'status': {
            const status = read.enum(p, 'status', Object.values(OrderStatus));
            return (id) => this.orders.update(id, { status }, user);
          }
          case 'assign': {
            const assignedToId = read.uuid(p, 'assignedToId');
            return (id) => this.orders.update(id, { assignedToId }, user);
          }
          case 'dueDate': {
            const dueDate = read.isoDate(p, 'dueDate');
            return (id) => this.orders.update(id, { dueDate }, user);
          }
          case 'archive': {
            const archived = read.bool(p, 'archived');
            return (id) => this.orders.setArchived(id, archived);
          }
        }
        break;
      case 'transfers':
        switch (action) {
          case 'status': {
            const status = read.enum(p, 'status', [
              TransferStatus.IN_TRANZIT,
              TransferStatus.FINALIZAT,
              TransferStatus.ANULAT,
            ]);
            // IN_TRANZIT needs a transporter; in bulk, default to the acting user.
            const assignedToId =
              p.assignedToId === undefined
                ? status === TransferStatus.IN_TRANZIT
                  ? user.userId
                  : undefined
                : read.uuid(p, 'assignedToId');
            return (id) =>
              this.locations.updateTransferStatus(id, { status, assignedToId }, user.userId);
          }
        }
        break;
      case 'raw-materials':
        switch (action) {
          case 'category': {
            const category = read.stringOrNull(p, 'category');
            return (id) =>
              this.rawMaterials.update(id, { category: category ?? undefined }, user.userId);
          }
          case 'status': {
            const status = read.enum(p, 'status', [
              MaterialStatus.ACTIVE,
              MaterialStatus.DISCONTINUED,
            ]);
            return (id) => this.rawMaterials.update(id, { status }, user.userId);
          }
          case 'supplier': {
            const supplierId = read.uuidOrNull(p, 'supplierId');
            return (id) => this.rawMaterials.update(id, { supplierId }, user.userId);
          }
          case 'minimumStock': {
            const minimumStock = read.number(p, 'minimumStock', 0);
            return (id) => this.rawMaterials.update(id, { minimumStock }, user.userId);
          }
        }
        break;
      case 'consumables':
        switch (action) {
          case 'category': {
            const category = read.stringOrNull(p, 'category');
            return (id) => this.consumables.update(id, { category: category ?? undefined });
          }
          case 'status': {
            const status = read.enum(p, 'status', [
              MaterialStatus.ACTIVE,
              MaterialStatus.DISCONTINUED,
            ]);
            return (id) => this.consumables.update(id, { status });
          }
          case 'minimumStock': {
            const minimumStock = read.number(p, 'minimumStock', 0);
            return (id) => this.consumables.update(id, { minimumStock });
          }
        }
        break;
      case 'recipes':
        switch (action) {
          case 'archive': {
            const archived = read.bool(p, 'archived');
            return (id) => this.recipes.setArchived(id, archived);
          }
          case 'draft': {
            const draft = read.bool(p, 'draft');
            return (id) => this.recipes.setDraft(id, draft);
          }
          case 'category': {
            const category = read.stringOrNull(p, 'category');
            return (id) => this.recipes.update(id, { category: category ?? undefined });
          }
        }
        break;
      case 'sales-deductions':
        switch (action) {
          case 'discard':
            return (id) => this.salesDeductions.discard(id);
          case 'revert':
            return (id) => this.salesDeductions.revert(id, user.userId);
        }
        break;
    }
    throw new BadRequestException(`Acțiunea „${action}” nu este implementată pentru ${resource}.`);
  }
}
