import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaskStatus, UnitType } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { getCurrentTenantId } from '@/prisma/tenant-context';
import { PaginatedDto } from '@/common/dto';
import { WebsocketService } from '@/modules/websocket';
import { StockReservationService } from '@/modules/stock';
import { NotificationsService } from '@/modules/notifications';
import { RecipeResolutionService } from '@/modules/recipes';
import { CaslAbilityFactory } from '@/modules/auth/casl/casl-ability.factory';
import { JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import {
  CreateTaskDto,
  CreateMultiTaskDto,
  MultiTaskItemDto,
  MultiTaskResponseDto,
  UpdateTaskDto,
  TransitionTaskDto,
  TaskResponseDto,
  SubtaskSummaryDto,
  TaskQueryDto,
  TaskTraceabilityDto,
  TraceabilityIngredientDto,
  TraceabilityHistoryDto,
  TraceabilitySubtaskDto,
  TraceabilityLotDto,
  TaskMaterialRequirementDto,
} from './dto';

/** Group (family) stamping for tasks created together via POST /tasks/multi. */
interface TaskGroupOptions {
  groupId: string;
  groupLabel: string | null;
  /** Skip the deficit-based auto-subtasks (the multi flow creates its own). */
  skipAutoSubtasks?: boolean;
}

/** Valid state transitions for the task state machine. */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  DE_FACUT: [TaskStatus.IN_LUCRU, TaskStatus.ANULAT],
  BLOCAT: [TaskStatus.IN_LUCRU, TaskStatus.DE_FACUT, TaskStatus.ANULAT],
  IN_LUCRU: [TaskStatus.FINALIZAT, TaskStatus.ANULAT],
  FINALIZAT: [],
  ANULAT: [],
};

/** Prisma include clause for loading task relations. */
const TASK_INCLUDE = {
  recipe: { select: { name: true } },
  location: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      changedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  subtasks: {
    include: {
      recipe: { select: { name: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

/** Compute a display name for a task from its quantity + recipe name. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function taskDisplayName(task: any): string {
  const qty = Number(task.targetQuantity);
  const name = task.title?.trim() || task.recipe?.name || '';
  return `${qty} ${name}`.trim();
}

/** Clean a submitted custom name: trimmed, empty → null (= recipe name). */
function cleanTitle(title: string | null | undefined): string | null {
  const t = title?.trim();
  return t ? t : null;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: WebsocketService,
    private readonly stockReservation: StockReservationService,
    private readonly caslAbilityFactory: CaslAbilityFactory,
    private readonly notifications: NotificationsService,
    private readonly recipeResolution: RecipeResolutionService,
  ) {}

  /**
   * Best-effort: notify a newly assigned user that a task landed on them.
   * Skipped when there's no assignee or the acting user assigned it to
   * themselves. Never throws — a notification failure must not break the task
   * operation.
   */
  private async notifyAssignee(
    assignedToId: string | null | undefined,
    actingUserId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    task: any,
  ): Promise<void> {
    if (!assignedToId || assignedToId === actingUserId) {
      return;
    }
    try {
      await this.notifications.notifyUser(assignedToId, {
        type: 'TASK_ASSIGNED',
        title: 'Task nou asignat',
        body: taskDisplayName(task),
        data: { taskId: task.id },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to notify assignee ${assignedToId} for task ${task.id}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /**
   * List tasks with pagination, search, and filters.
   * AJUTOR_COFETAR users only see tasks assigned to them.
   */
  async findAll(query: TaskQueryDto, user: JwtPayload): Promise<PaginatedDto<TaskResponseDto>> {
    const {
      page = 1,
      limit = 20,
      status,
      assignedToId,
      recipeId,
      dueBefore,
      dueAfter,
      search,
      myDay,
      sort,
      unassigned,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {
      parentTaskId: null, // Only top-level tasks; subtasks are nested in parent response
    };
    // AND-composed clauses — where.OR is reserved for the permission scope
    // below, so every additional OR-shaped filter goes in here instead.
    const and: Prisma.TaskWhereInput[] = [];

    // Users without 'manage Task' permission only see tasks assigned to them
    // (including parents with subtasks assigned to them)
    const ability = await this.caslAbilityFactory.createForUser({
      id: user.userId,
      role: user.role,
      organizationId: user.organizationId,
    });
    if (!ability.can('manage', 'Task')) {
      where.OR = this.visibilityScope(user.userId);
    }

    // "Ziua mea" — the caller's own plate for today: assigned to them (or a
    // subtask of theirs), still open, and relevant today (due today/overdue,
    // or undated and not planned for a future day). Same "today" semantics as
    // the dashboard's Task-uri azi KPI.
    if (myDay) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);
      and.push(
        {
          OR: [
            { assignedToId: user.userId },
            { subtasks: { some: { assignedToId: user.userId } } },
          ],
        },
        { status: { notIn: ['FINALIZAT', 'ANULAT'] } },
        {
          OR: [
            { dueDate: { lt: endOfDay } },
            { dueDate: null, plannedDate: { lt: endOfDay } },
            { dueDate: null, plannedDate: null },
          ],
        },
      );
    }

    if (status) {
      where.status = status;
    }

    if (assignedToId && ability.can('manage', 'Task')) {
      where.assignedToId = assignedToId;
    }

    if (unassigned) {
      where.assignedToId = null;
    }

    if (recipeId) {
      where.recipeId = recipeId;
    }

    if (dueBefore) {
      where.dueDate = {
        ...((where.dueDate as Prisma.DateTimeNullableFilter) ?? {}),
        lte: new Date(dueBefore),
      };
    }

    if (dueAfter) {
      where.dueDate = {
        ...((where.dueDate as Prisma.DateTimeNullableFilter) ?? {}),
        gte: new Date(dueAfter),
      };
    }

    if (search) {
      and.push({
        OR: [
          { recipe: { name: { contains: search, mode: 'insensitive' } } },
          { title: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (and.length) where.AND = and;

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        // Newest task first (predictable "latest on top"); priority/due date
        // remain as tiebreakers for same-instant creations.
        // `sort` (board columns / status pages): due date or finish time.
        orderBy:
          sort === 'completed'
            ? [{ completedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }]
            : sort === 'due'
              ? [
                  { dueDate: { sort: 'asc', nulls: 'last' } },
                  { priority: 'desc' },
                  { createdAt: 'desc' },
                ]
              : [{ createdAt: 'desc' }, { priority: 'desc' }, { dueDate: 'asc' }],
        include: TASK_INCLUDE,
      }),
      this.prisma.task.count({ where }),
    ]);

    const data = tasks.map((task) => this.toDto(task));

    return new PaginatedDto(data, total, page, limit);
  }

  /**
   * What a user WITHOUT `manage Task` may see: tasks assigned to them (or with
   * a subtask of theirs), tasks visible to everyone, and tasks that list them
   * explicitly (visibility SELECTED). Administrators never go through this.
   */
  private visibilityScope(userId: string): Prisma.TaskWhereInput[] {
    return [
      { assignedToId: userId },
      { subtasks: { some: { assignedToId: userId } } },
      { visibility: 'EVERYONE' },
      { visibility: 'SELECTED', visibleToIds: { has: userId } },
    ];
  }

  /**
   * Find a single task by ID with all relations.
   * @throws NotFoundException if the task does not exist.
   */
  /**
   * `user` (GET /tasks/:id) applies the same visibility scope as the list for
   * callers without 'manage Task' — a task they can't see is a 404, so ids
   * don't leak its existence. Internal callers omit it.
   */
  async findById(id: string, user?: JwtPayload): Promise<TaskResponseDto> {
    let scope: Prisma.TaskWhereInput = {};
    if (user) {
      const ability = await this.caslAbilityFactory.createForUser({
        id: user.userId,
        role: user.role,
        organizationId: user.organizationId,
      });
      if (!ability.can('manage', 'Task')) scope = { OR: this.visibilityScope(user.userId) };
    }
    const task = await this.prisma.task.findFirst({
      where: { id, ...scope },
      include: TASK_INCLUDE,
    });

    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    return this.toDto(task);
  }

  /**
   * Create a new task.
   * Calculates scaleFactor from recipe yield and creates initial status history.
   * `group` stamps the family (groupId/groupLabel) when the task is part of a
   * multi-create batch (POST /tasks/multi).
   */
  async create(
    dto: CreateTaskDto,
    userId: string,
    group?: TaskGroupOptions,
  ): Promise<TaskResponseDto> {
    const recipe = await this.loadProducibleRecipe(dto);

    // targetUnit is honoured: the target is converted into the recipe's unit.
    const scaleFactor = await this.recipeResolution.scaleFactorFor(
      recipe,
      dto.targetQuantity,
      dto.targetUnit,
    );

    // Production location: explicit > assignee/creator primary location > default.
    const locationId =
      dto.locationId ?? (await this.resolveDefaultLocationId(dto.assignedToId ?? userId));

    const task = await this.prisma.task.create({
      data: {
        recipeId: dto.recipeId,
        locationId,
        scaleFactor,
        targetQuantity: dto.targetQuantity,
        targetUnit: dto.targetUnit,
        priority: dto.priority ?? 0,
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes,
        title: cleanTitle(dto.title),
        visibility: dto.visibility ?? 'ASSIGNED',
        visibleToIds: dto.visibility === 'SELECTED' ? [...new Set(dto.visibleToIds ?? [])] : [],
        createdById: userId,
        assignedToId: dto.assignedToId,
        groupId: group?.groupId ?? null,
        groupLabel: group?.groupLabel ?? null,
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: TaskStatus.DE_FACUT,
            changedById: userId,
          },
        },
      },
      include: TASK_INCLUDE,
    });

    this.logger.log(`Created task "${taskDisplayName(task)}" (${task.id})`);

    // Auto-create subtasks for semipreparate ingredients
    if (!group?.skipAutoSubtasks) {
      await this.createSemipreparateSubtasks(
        task.id,
        dto.recipeId,
        scaleFactor,
        dto,
        userId,
        locationId,
        group,
      );
    }

    // Re-fetch with subtasks included
    const taskWithSubtasks = await this.prisma.task.findUnique({
      where: { id: task.id },
      include: TASK_INCLUDE,
    });

    const result = this.toDto(taskWithSubtasks ?? task);

    this.ws.emitTaskUpdate({
      taskId: task.id,
      taskTitle: taskDisplayName(task),
      newStatus: task.status,
      assignedToId: task.assignedToId ?? '',
    });

    this.ws.emitActivity({
      type: 'TASK_TRANSITION',
      title: `${taskDisplayName(task)} — creat`,
      description: `${task.createdBy.firstName} ${task.createdBy.lastName} a creat taskul`,
      metadata: { taskId: task.id, userId },
    });

    await this.notifyAssignee(task.assignedToId, userId, task);

    return result;
  }

  /**
   * Create multiple tasks at once as a family (ClickUp-style group): one task
   * per item, all sharing a freshly generated groupId + the optional
   * groupLabel. With `includeSemipreparate`, each final recipe's SEMIPREPARAT
   * components also get a task (quantity scaled to the requested amount),
   * linked to the parent via parentTaskId and stamped with the same group.
   */
  /**
   * The recipe a task would produce, refused (4xx) when it can't go into
   * production: missing, archived, draft, no yield, or a non-positive target.
   * Shared by create and the createMulti pre-check.
   */
  private async loadProducibleRecipe(dto: { recipeId: string; targetQuantity: number }) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: dto.recipeId },
    });

    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${dto.recipeId}" not found`);
    }

    if (recipe.isArchived) {
      throw new BadRequestException('Reteta este arhivata si nu poate intra in productie.');
    }

    if (recipe.isDraft) {
      throw new BadRequestException('Rețeta este schiță și nu poate intra în producție.');
    }

    // scaleFactor = targetQuantity / (yieldQuantity * quantityPerPiece)
    const yieldQuantity = Number(recipe.yieldQuantity);
    const quantityPerPiece = Number(recipe.quantityPerPiece);
    const baseYield = yieldQuantity * quantityPerPiece;
    // A recipe saved with yield 0 would give Infinity/NaN here and surface as a
    // 500 from Prisma — reject it with the reason instead.
    if (!Number.isFinite(baseYield) || baseYield <= 0) {
      throw new BadRequestException(
        `Rețeta „${recipe.name}” nu are randament setat — completează randamentul înainte de producție.`,
      );
    }
    if (!Number.isFinite(dto.targetQuantity) || dto.targetQuantity <= 0) {
      throw new BadRequestException('Cantitatea de produs trebuie să fie mai mare decât 0.');
    }
    return recipe;
  }

  async createMulti(dto: CreateMultiTaskDto, userId: string): Promise<MultiTaskResponseDto> {
    // All-or-nothing: refuse the whole family up front if any item can't be
    // produced, so a bad item never leaves the earlier ones behind.
    for (const item of dto.items) {
      await this.loadProducibleRecipe(item);
    }

    const group: TaskGroupOptions = {
      groupId: randomUUID(),
      groupLabel: dto.groupLabel ?? null,
      // The multi flow controls semipreparate tasks explicitly via the flag —
      // the deficit-based auto-subtasks of the single create are skipped.
      skipAutoSubtasks: true,
    };

    const tasks: TaskResponseDto[] = [];
    const createdIds: string[] = [];
    try {
      for (const item of dto.items) {
        const itemDto: CreateTaskDto = {
          recipeId: item.recipeId,
          targetQuantity: item.targetQuantity,
          targetUnit: item.targetUnit,
          priority: dto.priority,
          plannedDate: dto.plannedDate,
          dueDate: dto.dueDate,
          notes: dto.notes,
          assignedToId: dto.assignedToId,
          locationId: dto.locationId,
          visibility: dto.visibility,
          visibleToIds: dto.visibleToIds,
        };

        const parent = await this.create(itemDto, userId, group);
        createdIds.push(parent.id);

        if (dto.includeSemipreparate) {
          await this.createSemipreparateGroupSubtasks(parent.id, item, itemDto, userId, group);
          // Re-fetch so the response carries the freshly created subtasks.
          tasks.push(await this.findById(parent.id));
        } else {
          tasks.push(parent);
        }
      }
    } catch (error) {
      // Anything failing after the pre-check (e.g. a DB error mid-family):
      // remove what was already created (subtasks included) and rethrow.
      for (const id of createdIds.reverse()) {
        await this.remove(id, userId).catch((e: Error) =>
          this.logger.error(`createMulti rollback failed for task ${id}: ${e.message}`),
        );
      }
      throw error;
    }

    return new MultiTaskResponseDto({ groupId: group.groupId, tasks });
  }

  /**
   * One task per SEMIPREPARAT component of the final recipe, at the FULL
   * quantity scaled to the requested amount (resolution-based — unlike the
   * deficit-based auto-subtasks of the single create). Each subtask hangs off
   * the parent (parentTaskId) and carries the family's groupId/groupLabel.
   */
  private async createSemipreparateGroupSubtasks(
    parentTaskId: string,
    item: MultiTaskItemDto,
    common: CreateTaskDto,
    userId: string,
    group: TaskGroupOptions,
  ): Promise<void> {
    const resolved = await this.recipeResolution.resolveTree(
      item.recipeId,
      item.targetQuantity,
      item.targetUnit,
    );

    // Merge duplicate semipreparate (same recipe + unit) into one subtask.
    const merged = new Map<string, { recipeId: string; quantity: number; unit: string }>();
    for (const semi of resolved.stockedSemipreparate) {
      const key = `${semi.recipeId}::${semi.unit}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += semi.quantity;
      } else {
        merged.set(key, { recipeId: semi.recipeId, quantity: semi.quantity, unit: semi.unit });
      }
    }

    if (merged.size === 0) return;

    const parent = await this.prisma.task.findUnique({
      where: { id: parentTaskId },
      select: { locationId: true },
    });

    for (const semi of merged.values()) {
      const semiRecipe = await this.prisma.recipe.findUnique({ where: { id: semi.recipeId } });
      if (!semiRecipe) continue;

      const semiYield = Number(semiRecipe.yieldQuantity) * Number(semiRecipe.quantityPerPiece);
      const scaleFactor =
        semiYield !== 0
          ? await this.recipeResolution.scaleFactorFor(
              semiRecipe,
              semi.quantity,
              semi.unit as UnitType,
            )
          : 0;

      const subtask = await this.prisma.task.create({
        data: {
          recipeId: semi.recipeId,
          parentTaskId,
          locationId: parent?.locationId ?? null,
          scaleFactor,
          targetQuantity: semi.quantity,
          targetUnit: semi.unit as UnitType,
          priority: common.priority ?? 0,
          plannedDate: common.plannedDate ? new Date(common.plannedDate) : null,
          dueDate: common.dueDate ? new Date(common.dueDate) : null,
          createdById: userId,
          groupId: group.groupId,
          groupLabel: group.groupLabel,
          statusHistory: {
            create: {
              fromStatus: null,
              toStatus: TaskStatus.DE_FACUT,
              changedById: userId,
            },
          },
        },
      });

      this.logger.log(
        `Created group subtask for semipreparate "${semiRecipe.name}" (${subtask.id}) under parent ${parentTaskId}, quantity=${semi.quantity}`,
      );
    }
  }

  /**
   * Update scalar fields of a task (not status — use transition for that).
   * @throws NotFoundException if the task does not exist.
   */
  async update(id: string, dto: UpdateTaskDto, actingUserId?: string): Promise<TaskResponseDto> {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      include: { recipe: true },
    });

    if (!existing) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    // Build update data, excluding status-related fields
    const data: Prisma.TaskUpdateInput = {};

    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.plannedDate !== undefined)
      data.plannedDate = dto.plannedDate ? new Date(dto.plannedDate) : null;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.title !== undefined) data.title = cleanTitle(dto.title);
    if (dto.visibility !== undefined) {
      data.visibility = dto.visibility;
      // Viewers only mean something for SELECTED; keep the column clean otherwise.
      data.visibleToIds =
        dto.visibility === 'SELECTED'
          ? [...new Set(dto.visibleToIds ?? existing.visibleToIds)]
          : [];
    } else if (dto.visibleToIds !== undefined && existing.visibility === 'SELECTED') {
      data.visibleToIds = [...new Set(dto.visibleToIds)];
    }
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }

    if (dto.recipeId !== undefined) {
      data.recipe = { connect: { id: dto.recipeId } };
    }

    if (dto.locationId !== undefined) {
      data.location = dto.locationId ? { connect: { id: dto.locationId } } : { disconnect: true };
    }

    if (dto.targetQuantity !== undefined) data.targetQuantity = dto.targetQuantity;
    if (dto.targetUnit !== undefined) data.targetUnit = dto.targetUnit;

    // Recalculate scaleFactor if targetQuantity, targetUnit or recipeId changed
    if (
      dto.targetQuantity !== undefined ||
      dto.targetUnit !== undefined ||
      dto.recipeId !== undefined
    ) {
      const recipeId = dto.recipeId ?? existing.recipeId;
      const recipe = dto.recipeId
        ? await this.prisma.recipe.findUnique({ where: { id: recipeId } })
        : existing.recipe;

      if (!recipe) {
        throw new NotFoundException(`Recipe with ID "${recipeId}" not found`);
      }

      // Only a freshly picked recipe is checked — an existing task keeps
      // working even if its recipe got archived/drafted mid-flight.
      if (dto.recipeId && recipe.isArchived) {
        throw new BadRequestException('Reteta este arhivata si nu poate intra in productie.');
      }
      if (dto.recipeId && recipe.isDraft) {
        throw new BadRequestException('Rețeta este schiță și nu poate intra în producție.');
      }

      const targetQuantity = dto.targetQuantity ?? Number(existing.targetQuantity);
      data.scaleFactor = await this.recipeResolution.scaleFactorFor(
        recipe,
        targetQuantity,
        dto.targetUnit ?? existing.targetUnit,
      );
    }

    const task = await this.prisma.task.update({
      where: { id },
      data,
      include: TASK_INCLUDE,
    });

    this.logger.log(`Updated task "${taskDisplayName(task)}" (${task.id})`);

    // Notify on a genuine reassignment (new assignee, changed from before).
    if (
      dto.assignedToId !== undefined &&
      dto.assignedToId &&
      dto.assignedToId !== existing.assignedToId &&
      actingUserId
    ) {
      await this.notifyAssignee(dto.assignedToId, actingUserId, task);
    }

    return this.toDto(task);
  }

  /**
   * Transition a task to a new status following the state machine.
   * Validates both the transition and user permissions.
   *
   * Stock operations are performed around the status update:
   * - DE_FACUT -> IN_LUCRU: reserve stock BEFORE updating status (rollback-safe)
   * - IN_LUCRU -> FINALIZAT: fulfill reservations AFTER updating status
   * - IN_LUCRU -> ANULAT: release reservations AFTER updating status
   */
  async transition(id: string, dto: TransitionTaskDto, user: JwtPayload): Promise<TaskResponseDto> {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      include: TASK_INCLUDE,
    });

    if (!existing) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    if (!this.validateTransition(existing.status, dto.status)) {
      throw new BadRequestException(
        `Invalid transition from "${existing.status}" to "${dto.status}"`,
      );
    }

    if (!(await this.canUserTransition(user, existing, dto.status))) {
      throw new ForbiddenException(
        `User does not have permission to transition this task to "${dto.status}"`,
      );
    }

    // FINALIZAT requires actualYield
    if (dto.status === TaskStatus.FINALIZAT) {
      if (dto.actualYield === undefined || dto.actualYield === null) {
        throw new BadRequestException('actualYield is required when finalizing a task');
      }
      if (dto.actualYield < 0) {
        throw new BadRequestException('actualYield must be >= 0');
      }

      // Parent task cannot be finalized until all subtasks are done
      const incompleteSubtasks = await this.prisma.task.count({
        where: {
          parentTaskId: id,
          status: { notIn: [TaskStatus.FINALIZAT, TaskStatus.ANULAT] },
        },
      });
      if (incompleteSubtasks > 0) {
        throw new BadRequestException(
          `Task-ul nu poate fi finalizat — ${incompleteSubtasks} subtask-uri nefinalizate`,
        );
      }
    }

    const isSubtask = existing.parentTaskId !== null;

    // DE_FACUT/BLOCAT -> IN_LUCRU: reserve stock BEFORE updating task status.
    // If reservation fails (insufficient stock), the task moves to BLOCAT.
    // Subtasks run the same stock lifecycle as any task: they consume their
    // own ingredients and credit their semipreparat to stock at finish — the
    // parent then reserves that semipreparat from stock like any other.
    if (
      (existing.status === TaskStatus.DE_FACUT || existing.status === TaskStatus.BLOCAT) &&
      dto.status === TaskStatus.IN_LUCRU
    ) {
      try {
        await this.stockReservation.reserveForTask(id, user.userId);
      } catch (error) {
        if (
          error instanceof BadRequestException &&
          (error.getResponse() as any)?.errorCode === 'STOCK_001'
        ) {
          const shortages = (error.getResponse() as any)?.shortages ?? [];

          // Auto-block: set status to BLOCAT with shortages
          const blockedTask = await this.prisma.task.update({
            where: { id },
            data: {
              status: TaskStatus.BLOCAT,
              shortages,
              statusHistory: {
                create: {
                  fromStatus: existing.status,
                  toStatus: TaskStatus.BLOCAT,
                  changedById: user.userId,
                  reason: 'Stoc insuficient',
                },
              },
            },
            include: TASK_INCLUDE,
          });

          this.logger.log(
            `Blocked start of task "${taskDisplayName(blockedTask)}" (${blockedTask.id}) — insufficient stock`,
          );

          this.ws.emitTaskUpdate({
            taskId: blockedTask.id,
            taskTitle: taskDisplayName(blockedTask),
            newStatus: blockedTask.status,
            assignedToId: blockedTask.assignedToId ?? '',
          });

          this.ws.emitActivity({
            type: 'TASK_TRANSITION',
            title: `${taskDisplayName(blockedTask)} — blocat`,
            description: 'Stoc insuficient pentru a incepe taskul',
            metadata: { taskId: blockedTask.id, userId: user.userId },
          });

          // Protection: refuse the start when resources are missing. The task is
          // kept/moved to BLOCAT (so it surfaces in the shopping list) and we
          // throw a clear error instead of silently returning a 200 "started"
          // that didn't actually start.
          const detail =
            (error.getResponse() as any)?.message ?? 'Stoc insuficient pentru a incepe taskul';
          throw new ConflictException({
            errorCode: 'TASK_BLOCKED_INSUFFICIENT_STOCK',
            message: `Nu poți începe taskul — ${detail}`,
            shortages,
          });
        }
        throw error;
      }
    }

    // Finalize with reported byproduct quantities: validate them BEFORE the
    // status flips, so a bad payload fails the whole request instead of
    // leaving a FINALIZAT task whose stock fulfillment then throws.
    if (
      existing.status === TaskStatus.IN_LUCRU &&
      dto.status === TaskStatus.FINALIZAT &&
      dto.byproducts?.length
    ) {
      await this.stockReservation.validateByproductsForTask(id, dto.byproducts);
    }

    // Build timestamp updates based on target status
    const timestamps: Prisma.TaskUpdateInput = {};
    if (dto.status === TaskStatus.IN_LUCRU) {
      timestamps.startedAt = new Date();
      timestamps.shortages = Prisma.DbNull; // Clear shortages when successfully starting
    } else if (dto.status === TaskStatus.FINALIZAT) {
      timestamps.completedAt = new Date();

      // Compute and store yield variance
      const targetQuantity = Number(existing.targetQuantity);
      const actualYield = dto.actualYield ?? 0;
      const varianceAbsolute = actualYield - targetQuantity;
      const variancePercent = targetQuantity !== 0 ? (varianceAbsolute / targetQuantity) * 100 : 0;

      timestamps.actualYield = actualYield;
      timestamps.varianceAbsolute = varianceAbsolute;
      timestamps.variancePercent = variancePercent;
    } else if (dto.status === TaskStatus.ANULAT) {
      timestamps.cancelledAt = new Date();
      timestamps.cancelReason = dto.reason ?? null;
    }

    const task = await this.prisma.task.update({
      where: { id },
      data: {
        status: dto.status,
        ...timestamps,
        statusHistory: {
          create: {
            fromStatus: existing.status,
            toStatus: dto.status,
            changedById: user.userId,
            reason: dto.reason,
          },
        },
      },
      include: TASK_INCLUDE,
    });

    this.logger.log(
      `Transitioned task "${taskDisplayName(task)}" (${task.id}) from ${existing.status} to ${dto.status}`,
    );

    // IN_LUCRU -> FINALIZAT: fulfill reservations (deduct actual stock) + production output
    if (existing.status === TaskStatus.IN_LUCRU && dto.status === TaskStatus.FINALIZAT) {
      await this.stockReservation.fulfillForTask(
        id,
        user.userId,
        dto.outputLocationId,
        dto.byproducts,
      );
      // A finished subtask just put its semipreparat in stock — the parent
      // may have been blocked waiting for exactly that.
      if (isSubtask && existing.parentTaskId) {
        await this.reevaluateBlockedParent(existing.parentTaskId, user.userId);
      }
    }

    // Create yield history record (for all tasks including subtasks)
    if (existing.status === TaskStatus.IN_LUCRU && dto.status === TaskStatus.FINALIZAT) {
      const yieldActual = dto.actualYield ?? 0;
      const yieldTarget = Number(existing.targetQuantity);
      await this.prisma.recipeYieldHistory.create({
        data: {
          recipeId: existing.recipeId,
          taskId: id,
          targetQuantity: yieldTarget,
          actualYield: yieldActual,
          varianceAbsolute: yieldActual - yieldTarget,
          variancePercent:
            yieldTarget !== 0 ? ((yieldActual - yieldTarget) / yieldTarget) * 100 : 0,
          scaleFactor: Number(existing.scaleFactor),
        },
      });
    }

    // IN_LUCRU -> ANULAT: release reservations (give back reserved stock)
    if (existing.status === TaskStatus.IN_LUCRU && dto.status === TaskStatus.ANULAT) {
      await this.stockReservation.releaseForTask(id, user.userId);
    }

    const result = this.toDto(task);

    this.ws.emitTaskUpdate({
      taskId: task.id,
      taskTitle: taskDisplayName(task),
      newStatus: task.status,
      assignedToId: task.assignedToId ?? '',
    });

    const statusLabels: Record<string, string> = {
      DE_FACUT: 'de facut',
      BLOCAT: 'blocat',
      IN_LUCRU: 'in lucru',
      FINALIZAT: 'finalizat',
      ANULAT: 'anulat',
    };

    this.ws.emitActivity({
      type: 'TASK_TRANSITION',
      title: `${taskDisplayName(task)} — ${statusLabels[dto.status] ?? dto.status}`,
      description: `Taskul a trecut de la ${statusLabels[existing.status] ?? existing.status} la ${statusLabels[dto.status] ?? dto.status}`,
      metadata: { taskId: task.id, userId: user.userId },
    });

    return result;
  }

  /**
   * Reassign a task to a different user.
   * Only COFETAR, PATISER, and ADMINISTRATOR can reassign.
   */
  async assignTask(id: string, assignedToId: string, user: JwtPayload): Promise<TaskResponseDto> {
    const ability = await this.caslAbilityFactory.createForUser({
      id: user.userId,
      role: user.role,
      organizationId: user.organizationId,
    });
    if (!ability.can('manage', 'Task')) {
      throw new ForbiddenException('Insufficient permissions to reassign tasks');
    }

    const existing = await this.prisma.task.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    const task = await this.prisma.task.update({
      where: { id },
      data: {
        assignedTo: { connect: { id: assignedToId } },
      },
      include: TASK_INCLUDE,
    });

    this.logger.log(
      `Reassigned task "${taskDisplayName(task)}" (${task.id}) to user ${assignedToId}`,
    );

    const result = this.toDto(task);

    this.ws.emitTaskUpdate({
      taskId: task.id,
      taskTitle: taskDisplayName(task),
      newStatus: task.status,
      assignedToId: task.assignedToId ?? '',
    });

    await this.notifyAssignee(assignedToId, user.userId, task);

    return result;
  }

  /**
   * Hard-delete a task from the database.
   * @throws NotFoundException if the task does not exist.
   */
  async remove(id: string, userId?: string): Promise<TaskResponseDto> {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      include: TASK_INCLUDE,
    });

    if (!existing) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    // A running task holds live stock reservations — release them first so the
    // reserved quantities go back, instead of tripping the RESTRICT FK with a 500.
    if (existing.status === TaskStatus.IN_LUCRU && userId) {
      await this.stockReservation.releaseForTask(id, userId);
    }
    // Subtasks reserve their own stock too — give back what running ones hold.
    if (userId) {
      const runningSubtasks = await this.prisma.task.findMany({
        where: { parentTaskId: id, status: TaskStatus.IN_LUCRU },
        select: { id: true },
      });
      for (const st of runningSubtasks) {
        await this.stockReservation.releaseForTask(st.id, userId);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Historical reservations (fulfilled/released) still hold RESTRICT FKs.
      // Lot-level traceability lives in LotConsumption (cascades), so dropping
      // the reservation rows with their task loses nothing.
      await tx.stockReservation.deleteMany({ where: { taskId: id } });
      await tx.recipeYieldHistory.deleteMany({ where: { taskId: id } });
      await tx.taskStatusHistory.deleteMany({ where: { taskId: id } });
      // Subtasks carry the same dependents.
      const subtasks = await tx.task.findMany({
        where: { parentTaskId: id },
        select: { id: true },
      });
      for (const st of subtasks) {
        await tx.stockReservation.deleteMany({ where: { taskId: st.id } });
        await tx.recipeYieldHistory.deleteMany({ where: { taskId: st.id } });
        await tx.taskStatusHistory.deleteMany({ where: { taskId: st.id } });
        await tx.task.delete({ where: { id: st.id } });
      }
      await tx.task.delete({ where: { id } });
    });

    this.logger.log(`Deleted task "${taskDisplayName(existing)}" (${existing.id})`);

    return this.toDto(existing);
  }

  /**
   * Aggregate shortages from all BLOCAT tasks into a shopping list.
   */
  async getShoppingList(): Promise<any> {
    const blockedTasks = await this.prisma.task.findMany({
      where: { status: TaskStatus.BLOCAT },
      select: {
        id: true,
        targetQuantity: true,
        shortages: true,
        recipe: { select: { name: true } },
      },
    });

    // Aggregate by material
    const materialMap = new Map<
      string,
      {
        rawMaterialId: string;
        rawMaterialTitle: string;
        unit: string;
        totalNeeded: number;
        totalAvailable: number;
        blockedTasks: { taskId: string; taskName: string; neededQuantity: number }[];
      }
    >();

    for (const task of blockedTasks) {
      if (!task.shortages || !Array.isArray(task.shortages)) continue;

      for (const s of task.shortages as any[]) {
        const key = s.rawMaterialId ?? s.recipeId ?? 'unknown';
        const existing = materialMap.get(key);

        if (existing) {
          existing.totalNeeded += s.needed;
          existing.totalAvailable = Math.min(existing.totalAvailable, s.available);
          existing.blockedTasks.push({
            taskId: task.id,
            taskName: taskDisplayName(task),
            neededQuantity: s.needed,
          });
        } else {
          materialMap.set(key, {
            rawMaterialId: key,
            rawMaterialTitle: s.rawMaterialTitle ?? s.recipeName ?? 'Unknown',
            unit: s.unit,
            totalNeeded: s.needed,
            totalAvailable: s.available,
            blockedTasks: [
              { taskId: task.id, taskName: taskDisplayName(task), neededQuantity: s.needed },
            ],
          });
        }
      }
    }

    const items = Array.from(materialMap.values()).map((item) => ({
      ...item,
      shortage: item.totalNeeded - item.totalAvailable,
      blockedTaskCount: item.blockedTasks.length,
    }));

    // Sort by shortage descending
    items.sort((a, b) => b.shortage - a.shortage);

    return { items };
  }

  /**
   * Get task counts grouped by status.
   */
  async getStats(): Promise<{ statusCounts: Record<string, number>; totalTasks: number }> {
    const statusCounts: Record<string, number> = {};
    for (const status of Object.values(TaskStatus)) {
      statusCounts[status] = 0;
    }

    const counts = await this.prisma.task.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    let totalTasks = 0;
    for (const row of counts) {
      statusCounts[row.status] = row._count.id;
      totalTasks += row._count.id;
    }

    return { statusCounts, totalTasks };
  }

  // ─── Calendar ──────────────────────────────────────────────────────

  async getCalendar(
    from?: string,
    to?: string,
    user?: JwtPayload,
  ): Promise<Record<string, TaskResponseDto[]>> {
    const where: Prisma.TaskWhereInput = {
      dueDate: { not: null },
    };
    // Same visibility rule as the list: managers/admins see everything.
    if (user) {
      const ability = await this.caslAbilityFactory.createForUser({
        id: user.userId,
        role: user.role,
        organizationId: user.organizationId,
      });
      if (!ability.can('manage', 'Task')) where.OR = this.visibilityScope(user.userId);
    }
    if (from) {
      where.dueDate = {
        ...((where.dueDate as Prisma.DateTimeNullableFilter) ?? {}),
        gte: new Date(from),
      };
    }
    if (to) {
      where.dueDate = {
        ...((where.dueDate as Prisma.DateTimeNullableFilter) ?? {}),
        lte: new Date(to),
      };
    }

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: TASK_INCLUDE,
    });

    const grouped: Record<string, TaskResponseDto[]> = {};
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const dateKey = task.dueDate.toISOString().split('T')[0] as string;
      if (!grouped[dateKey]) grouped[dateKey] = [];
      (grouped[dateKey] as TaskResponseDto[]).push(this.toDto(task));
    }
    return grouped;
  }

  // ==========================================================================
  // Traceability sheet
  // ==========================================================================

  private static readonly TRACE_INCLUDE = {
    recipe: { select: { name: true, type: true } },
    createdBy: { select: { firstName: true, lastName: true } },
    assignedTo: { select: { firstName: true, lastName: true } },
    stockMovements: {
      where: { movementType: 'IESIRE_PRODUCTIE' as const },
      include: {
        rawMaterial: {
          select: {
            title: true,
            lotNumber: true,
            expiryDate: true,
            producer: true,
            invoiceNumber: true,
          },
        },
        consumable: { select: { title: true } },
      },
    },
  };

  /**
   * Lot/expiry/supplier/invoice per consumed ingredient. Primary source is the
   * exact FIFO attribution recorded at production (LotConsumption → StockLot),
   * so several lots of the same material — even received the same day — are
   * listed separately with the consumed quantity per lot. Tasks produced
   * before FIFO tracking existed fall back to the old heuristic (newest lot
   * received at or before consumption, then the material's legacy fields).
   */
  private mapTraceIngredients(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    movements: any[],
    taskId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    consumptionsByTask: Map<string, any[]>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lotsByMaterial: Map<string, any[]>,
  ): TraceabilityIngredientDto[] {
    const taskConsumptions = consumptionsByTask.get(taskId) ?? [];

    return movements.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => {
        const consumed = m.rawMaterialId
          ? taskConsumptions.filter((c) => c.rawMaterialId === m.rawMaterialId)
          : [];

        if (consumed.length > 0) {
          const lots = consumed.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (c: any) =>
              new TraceabilityLotDto({
                lotNumber: c.stockLot?.lotNumber ?? null,
                invoiceNumber: c.stockLot?.supplierInvoice ?? null,
                supplier: c.stockLot?.supplier ?? m.rawMaterial?.producer ?? null,
                quantity: Number(c.quantity),
                expiryDate: c.stockLot?.expiryDate ?? null,
              }),
          );
          const first = lots[0];
          return new TraceabilityIngredientDto({
            title: m.rawMaterial?.title ?? m.consumable?.title ?? 'Necunoscut',
            quantity: Number(m.quantity),
            unit: m.unit,
            kind: m.rawMaterialId ? 'raw_material' : 'consumable',
            lotNumber: first?.lotNumber ?? null,
            expiryDate: first?.expiryDate ?? null,
            supplier: first?.supplier ?? null,
            invoiceNumber: first?.invoiceNumber ?? null,
            lots,
          });
        }

        // Fallback (pre-FIFO tasks): newest lot received before use.
        const materialLots = m.rawMaterialId ? (lotsByMaterial.get(m.rawMaterialId) ?? []) : [];
        const lot =
          materialLots.find((l) => l.receivedAt <= m.createdAt) ??
          materialLots[materialLots.length - 1] ??
          null;
        return new TraceabilityIngredientDto({
          title: m.rawMaterial?.title ?? m.consumable?.title ?? 'Necunoscut',
          quantity: Number(m.quantity),
          unit: m.unit,
          kind: m.rawMaterialId ? 'raw_material' : 'consumable',
          lotNumber: lot?.lotNumber ?? m.rawMaterial?.lotNumber ?? null,
          expiryDate: lot?.expiryDate ?? m.rawMaterial?.expiryDate ?? null,
          supplier: lot?.supplier ?? m.rawMaterial?.producer ?? null,
          invoiceNumber: lot?.supplierInvoice ?? m.rawMaterial?.invoiceNumber ?? null,
          lots: [],
        });
      },
    );
  }

  /** Exact FIFO lot consumptions for the task tree, grouped by taskId. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadLotConsumptions(taskIds: string[]): Promise<Map<string, any[]>> {
    const rows = await this.prisma.lotConsumption.findMany({
      where: { taskId: { in: taskIds } },
      include: { stockLot: true },
      orderBy: { createdAt: 'asc' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = new Map<string, any[]>();
    for (const row of rows) {
      const list = map.get(row.taskId) ?? [];
      list.push(row);
      map.set(row.taskId, list);
    }
    return map;
  }

  /** Intake lots (newest first) for every raw material consumed by the task tree. */
  private async loadTraceLots(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    movementGroups: any[][],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<Map<string, any[]>> {
    const ids = [
      ...new Set(movementGroups.flat().flatMap((m) => (m.rawMaterialId ? [m.rawMaterialId] : []))),
    ] as string[];
    if (ids.length === 0) return new Map();

    const lots = await this.prisma.stockLot.findMany({
      where: { rawMaterialId: { in: ids } },
      orderBy: { receivedAt: 'desc' },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = new Map<string, any[]>();
    for (const lot of lots) {
      const list = map.get(lot.rawMaterialId as string) ?? [];
      list.push(lot);
      map.set(lot.rawMaterialId as string, list);
    }
    return map;
  }

  /** Build the traceability sheet for a produced (or in-progress) task. */
  /**
   * Scaled material requirements for a task: per ingredient, the scaled amount
   * needed, the current physical stock, and the stock remaining after the task
   * is produced. The `needed` value matches what `reserveForTask` deducts.
   */
  async getMaterialRequirements(id: string): Promise<TaskMaterialRequirementDto[]> {
    const requirements = await this.stockReservation.previewForTask(id);
    return requirements.map((r) => new TaskMaterialRequirementDto(r));
  }

  /**
   * Scaled material requirements for a recipe at a target quantity, before a
   * task exists. Powers the task-create form: recompute stock live as the user
   * edits the quantity and warn when stock is insufficient.
   */
  async previewMaterialRequirements(
    recipeId: string,
    targetQuantity: number,
    targetUnit: UnitType,
    locationId?: string,
  ): Promise<TaskMaterialRequirementDto[]> {
    const requirements = await this.stockReservation.previewRequirements(
      recipeId,
      targetQuantity,
      targetUnit,
      locationId,
    );
    return requirements.map((r) => new TaskMaterialRequirementDto(r));
  }

  async getTraceability(id: string): Promise<TaskTraceabilityDto> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        ...TasksService.TRACE_INCLUDE,
        statusHistory: {
          include: { changedBy: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        subtasks: { include: TasksService.TRACE_INCLUDE },
      },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    const [lotsByMaterial, consumptionsByTask] = await Promise.all([
      this.loadTraceLots([
        task.stockMovements,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...task.subtasks.map((st: any) => st.stockMovements),
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.loadLotConsumptions([task.id, ...task.subtasks.map((st: any) => st.id)]),
    ]);

    return new TaskTraceabilityDto({
      taskId: task.id,
      recipeName: task.recipe.name,
      recipeType: task.recipe.type,
      status: task.status,
      targetQuantity: Number(task.targetQuantity),
      targetUnit: task.targetUnit,
      actualYield: task.actualYield != null ? Number(task.actualYield) : null,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      createdByName: `${task.createdBy.firstName} ${task.createdBy.lastName}`,
      assignedToName: task.assignedTo
        ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}`
        : null,
      notes: task.notes,
      ingredients: this.mapTraceIngredients(
        task.stockMovements,
        task.id,
        consumptionsByTask,
        lotsByMaterial,
      ),
      subtasks: task.subtasks.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (st: any) =>
          new TraceabilitySubtaskDto({
            taskId: st.id,
            recipeName: st.recipe.name,
            quantity: Number(st.targetQuantity),
            unit: st.targetUnit,
            completedAt: st.completedAt,
            ingredients: this.mapTraceIngredients(
              st.stockMovements,
              st.id,
              consumptionsByTask,
              lotsByMaterial,
            ),
          }),
      ),
      history: task.statusHistory.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (h: any) =>
          new TraceabilityHistoryDto({
            fromStatus: h.fromStatus,
            toStatus: h.toStatus,
            byName: `${h.changedBy.firstName} ${h.changedBy.lastName}`,
            reason: h.reason,
            at: h.createdAt,
          }),
      ),
    });
  }

  /**
   * Auto-create subtasks for semipreparate ingredients in the recipe.
   * Each semipreparate ingredient becomes a child task with calculated quantities.
   */
  /**
   * Resolve the production location for a task: the user's primary location
   * (falls back to any assigned location), else the admin-configured org
   * default (Organization.defaultLocationId, if active), else the legacy
   * heuristic (first active LABORATOR, else first active location). Null if
   * none exists.
   */
  private async resolveDefaultLocationId(userId: string): Promise<string | null> {
    const userLocation = await this.prisma.userLocation.findFirst({
      where: { userId },
      orderBy: { isPrimary: 'desc' },
    });
    if (userLocation) return userLocation.locationId;

    // Admin-configurable org default (Organization.defaultLocationId) wins
    // over the LABORATOR heuristic when set and still active.
    const orgId = getCurrentTenantId();
    if (orgId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { defaultLocationId: true },
      });
      if (org?.defaultLocationId) {
        const configured = await this.prisma.location.findFirst({
          where: { id: org.defaultLocationId, isActive: true },
        });
        if (configured) return configured.id;
      }
    }

    const fallback = await this.prisma.location.findFirst({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });
    // Prefer a LABORATOR if present.
    const lab = await this.prisma.location.findFirst({
      where: { isActive: true, type: 'LABORATOR' },
      orderBy: { createdAt: 'asc' },
    });
    return lab?.id ?? fallback?.id ?? null;
  }

  private async createSemipreparateSubtasks(
    parentTaskId: string,
    recipeId: string,
    parentScaleFactor: number,
    parentDto: CreateTaskDto,
    userId: string,
    locationId: string | null,
    group?: TaskGroupOptions,
  ): Promise<void> {
    const recipeWithComponents = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        components: {
          include: {
            ingredients: {
              where: { semipreparatRecipeId: { not: null } },
              include: {
                semipreparatRecipe: true,
              },
            },
          },
        },
      },
    });

    if (!recipeWithComponents) return;

    for (const component of recipeWithComponents.components) {
      for (const ingredient of component.ingredients) {
        if (!ingredient.semipreparatRecipeId || !ingredient.semipreparatRecipe) continue;

        const semiRecipe = ingredient.semipreparatRecipe;
        const neededQuantity = parentScaleFactor * Number(ingredient.quantity);
        const availableStock = (semiRecipe.stockCount ?? 0) - (semiRecipe.reservedCount ?? 0);

        if (availableStock >= neededQuantity) {
          this.logger.log(
            `Semipreparate "${semiRecipe.name}" has sufficient stock (${availableStock} >= ${neededQuantity}), skipping subtask`,
          );
          continue;
        }

        const deficit = neededQuantity - Math.max(0, availableStock);
        const subtaskScaleFactor = await this.recipeResolution.scaleFactorFor(
          semiRecipe,
          deficit,
          ingredient.unit,
        );

        const subtask = await this.prisma.task.create({
          data: {
            recipeId: semiRecipe.id,
            parentTaskId,
            locationId,
            scaleFactor: subtaskScaleFactor,
            targetQuantity: deficit,
            targetUnit: ingredient.unit,
            priority: parentDto.priority ?? 0,
            plannedDate: parentDto.plannedDate ? new Date(parentDto.plannedDate) : null,
            dueDate: parentDto.dueDate ? new Date(parentDto.dueDate) : null,
            createdById: userId,
            groupId: group?.groupId ?? null,
            groupLabel: group?.groupLabel ?? null,
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: TaskStatus.DE_FACUT,
                changedById: userId,
              },
            },
          },
        });

        this.logger.log(
          `Created subtask for semipreparate "${semiRecipe.name}" (${subtask.id}) under parent ${parentTaskId}, deficit=${deficit}`,
        );
      }
    }
  }

  /**
   * Check whether a state transition is valid per the state machine.
   */
  /**
   * After a subtask credits its output, re-check a BLOCAT parent: when every
   * requirement is now covered it goes back to DE_FACUT (shortages cleared,
   * history row) so it can be started; otherwise its stored shortages are
   * refreshed so the shopping list stops asking for what was just produced.
   * Never starts the parent — starting (and reserving) stays a user action.
   * Best-effort: a failure here must not undo the subtask's finish.
   */
  private async reevaluateBlockedParent(parentId: string, userId: string): Promise<void> {
    try {
      const parent = await this.prisma.task.findUnique({ where: { id: parentId } });
      if (!parent || parent.status !== TaskStatus.BLOCAT) return;

      const requirements = await this.stockReservation.previewForTask(parentId);
      const missing = requirements.filter((r) => !r.sufficient);

      if (missing.length === 0) {
        const unblocked = await this.prisma.task.update({
          where: { id: parentId },
          data: {
            status: TaskStatus.DE_FACUT,
            shortages: Prisma.DbNull,
            statusHistory: {
              create: {
                fromStatus: TaskStatus.BLOCAT,
                toStatus: TaskStatus.DE_FACUT,
                changedById: userId,
                reason: 'Stoc disponibil după finalizarea subtask-ului',
              },
            },
          },
          include: TASK_INCLUDE,
        });
        this.ws.emitTaskUpdate({
          taskId: unblocked.id,
          taskTitle: taskDisplayName(unblocked),
          newStatus: unblocked.status,
          assignedToId: unblocked.assignedToId ?? '',
        });
        this.ws.emitActivity({
          type: 'STOCK_AVAILABLE',
          title: `Stoc disponibil: ${taskDisplayName(unblocked)}`,
          description: 'Subtask-ul a fost finalizat — taskul poate fi început',
          metadata: { taskId: unblocked.id, userId },
        });
        return;
      }

      await this.prisma.task.update({
        where: { id: parentId },
        data: {
          shortages: missing.map((r) => ({
            ...(r.rawMaterialId
              ? { rawMaterialId: r.rawMaterialId, rawMaterialTitle: r.title }
              : { recipeId: r.recipeId, recipeName: r.title }),
            needed: r.needed,
            available: r.available,
            unit: r.unit,
          })),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to re-evaluate blocked parent task ${parentId}: ${(error as Error).message}`,
      );
    }
  }

  private validateTransition(fromStatus: TaskStatus, toStatus: TaskStatus): boolean {
    return VALID_TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
  }

  /**
   * Check whether the given user is allowed to perform the transition.
   *
   * - Users with 'manage Task' can always transition
   * - DE_FACUT -> IN_LUCRU: assigned user
   * - IN_LUCRU -> FINALIZAT: assigned user
   * - Any -> ANULAT: creator
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async canUserTransition(
    user: JwtPayload,
    task: any,
    toStatus: TaskStatus,
  ): Promise<boolean> {
    const ability = await this.caslAbilityFactory.createForUser({
      id: user.userId,
      role: user.role,
      organizationId: user.organizationId,
    });
    if (ability.can('manage', 'Task')) {
      return true;
    }

    if (toStatus === TaskStatus.ANULAT) {
      // Creator can cancel
      return task.createdById === user.userId;
    }

    if (toStatus === TaskStatus.IN_LUCRU || toStatus === TaskStatus.FINALIZAT) {
      // Assigned user can start/complete
      return task.assignedToId === user.userId;
    }

    return false;
  }

  /**
   * Convert a Prisma task record (with relations) to a response DTO.
   * Handles Decimal → Number conversion.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(task: any): TaskResponseDto {
    return new TaskResponseDto({
      id: task.id,
      recipeId: task.recipeId,
      scaleFactor: Number(task.scaleFactor),
      targetQuantity: Number(task.targetQuantity),
      targetUnit: task.targetUnit,
      status: task.status,
      priority: task.priority,
      plannedDate: task.plannedDate,
      dueDate: task.dueDate,
      notes: task.notes,
      createdById: task.createdById,
      assignedToId: task.assignedToId,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      cancelledAt: task.cancelledAt,
      cancelReason: task.cancelReason,
      shortages: (task.shortages as any[]) ?? null,
      actualYield: task.actualYield != null ? Number(task.actualYield) : null,
      varianceAbsolute: task.varianceAbsolute != null ? Number(task.varianceAbsolute) : null,
      variancePercent: task.variancePercent != null ? Number(task.variancePercent) : null,
      parentTaskId: task.parentTaskId ?? null,
      groupId: task.groupId ?? null,
      groupLabel: task.groupLabel ?? null,
      recipeName: task.recipe?.name ?? '',
      title: task.title ?? null,
      displayName: task.title?.trim() || task.recipe?.name || '',
      visibility: task.visibility ?? 'ASSIGNED',
      visibleToIds: task.visibleToIds ?? [],
      locationId: task.locationId ?? null,
      locationName: task.location?.name ?? null,
      createdBy: task.createdBy,
      assignedTo: task.assignedTo ?? null,
      subtasks: (task.subtasks ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) =>
          new SubtaskSummaryDto({
            id: s.id,
            recipeId: s.recipeId,
            recipeName: s.recipe?.name ?? '',
            title: s.title ?? null,
            displayName: s.title?.trim() || s.recipe?.name || '',
            targetQuantity: Number(s.targetQuantity),
            targetUnit: s.targetUnit,
            status: s.status,
            assignedTo: s.assignedTo ?? null,
          }),
      ),
      statusHistory: (task.statusHistory ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (h: any) => ({
          id: h.id,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          changedBy: h.changedBy,
          reason: h.reason,
          createdAt: h.createdAt,
        }),
      ),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  }
}
