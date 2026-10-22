import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { ParseUUIDPipe } from '@/common/pipes';
import { PaginatedDto } from '@/common/dto';
import {
  CreateTaskDto,
  CreateMultiTaskDto,
  MultiTaskResponseDto,
  UpdateTaskDto,
  TransitionTaskDto,
  TaskResponseDto,
  TaskQueryDto,
  TaskTraceabilityDto,
  TaskMaterialRequirementDto,
  PreviewRequirementsQueryDto,
} from './dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'Task'))
  @ApiOperation({
    summary: 'List all tasks',
    description:
      'Returns a paginated list of tasks with optional search and filters. AJUTOR_COFETAR users only see tasks assigned to them.',
  })
  @ApiOkResponse({ description: 'Paginated list of tasks' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findAll(
    @Query() query: TaskQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedDto<TaskResponseDto>> {
    return this.tasksService.findAll(query, user);
  }

  @Get('calendar')
  @CheckPolicies((ability) => ability.can('read', 'Task'))
  @ApiOperation({ summary: 'Get tasks grouped by due date' })
  @ApiOkResponse({ description: 'Calendar map of date -> tasks' })
  async getCalendar(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<Record<string, TaskResponseDto[]>> {
    return this.tasksService.getCalendar(from, to, user);
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can('read', 'Task'))
  @ApiOperation({ summary: 'Get task statistics' })
  @ApiOkResponse({ description: 'Task status counts and total' })
  async getStats() {
    return this.tasksService.getStats();
  }

  @Get('shopping-list')
  @CheckPolicies((ability) => ability.can('read', 'Task'))
  @ApiOperation({
    summary: 'Get shopping list',
    description:
      'Aggregates shortages from all BLOCAT tasks into a shopping list of materials needed.',
  })
  @ApiOkResponse({ description: 'Shopping list' })
  async getShoppingList() {
    return this.tasksService.getShoppingList();
  }

  @Get('preview-requirements')
  @CheckPolicies((ability) => ability.can('read', 'Task'))
  @ApiOperation({
    summary: 'Preview scaled material requirements for a recipe',
    description:
      'Recompute, before a task exists, the scaled needs + current stock + stock-after for a ' +
      'recipe at a target quantity. Powers the task-create form (live recalc + insufficient-stock warning).',
  })
  @ApiOkResponse({ description: 'Material requirements', type: [TaskMaterialRequirementDto] })
  async previewRequirements(
    @Query() query: PreviewRequirementsQueryDto,
  ): Promise<TaskMaterialRequirementDto[]> {
    return this.tasksService.previewMaterialRequirements(
      query.recipeId,
      query.targetQuantity,
      query.targetUnit,
      query.locationId,
    );
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'Task'))
  @ApiOperation({
    summary: 'Get task by ID',
    description: 'Returns a single task by its UUID with all relations.',
  })
  @ApiOkResponse({ description: 'Task found', type: TaskResponseDto })
  @ApiNotFoundResponse({ description: 'Task not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskResponseDto> {
    return this.tasksService.findById(id, user);
  }

  @Get(':id/material-requirements')
  @CheckPolicies((ability) => ability.can('read', 'Task'))
  @ApiOperation({
    summary: 'Scaled material requirements for a task',
    description:
      'Per ingredient: the scaled amount needed for the task target quantity, ' +
      'current physical stock, and stock remaining after production.',
  })
  @ApiOkResponse({ description: 'Material requirements', type: [TaskMaterialRequirementDto] })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async getMaterialRequirements(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TaskMaterialRequirementDto[]> {
    return this.tasksService.getMaterialRequirements(id);
  }

  @Get(':id/traceability')
  @CheckPolicies((ability) => ability.can('read', 'Task'))
  @ApiOperation({
    summary: 'Traceability sheet for a task',
    description: 'Produced product/semipreparat, consumed ingredients (with lots), and history.',
  })
  @ApiOkResponse({ description: 'Traceability sheet', type: TaskTraceabilityDto })
  @ApiNotFoundResponse({ description: 'Task not found' })
  async getTraceability(@Param('id', ParseUUIDPipe) id: string): Promise<TaskTraceabilityDto> {
    return this.tasksService.getTraceability(id);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'Task'))
  @ApiOperation({
    summary: 'Create a new task',
    description: 'Creates a new production task with an initial DE_FACUT status.',
  })
  @ApiCreatedResponse({ description: 'Task created successfully', type: TaskResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async create(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskResponseDto> {
    return this.tasksService.create(dto, user.userId);
  }

  @Post('multi')
  @CheckPolicies((ability) => ability.can('create', 'Task'))
  @ApiOperation({
    summary: 'Create multiple tasks as a family',
    description:
      'Creates one task per item, all sharing a generated groupId and the optional groupLabel. ' +
      "With includeSemipreparate=true, each final recipe's SEMIPREPARAT components also get a " +
      'task (scaled quantity) linked via parentTaskId and stamped with the same group.',
  })
  @ApiCreatedResponse({ description: 'Tasks created successfully', type: MultiTaskResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async createMulti(
    @Body() dto: CreateMultiTaskDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MultiTaskResponseDto> {
    return this.tasksService.createMulti(dto, user.userId);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', 'Task'))
  @ApiOperation({
    summary: 'Update a task',
    description:
      'Partially updates task scalar fields. Does not allow status changes — use the transition endpoint instead.',
  })
  @ApiOkResponse({ description: 'Task updated successfully', type: TaskResponseDto })
  @ApiNotFoundResponse({ description: 'Task not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskResponseDto> {
    return this.tasksService.update(id, dto, user.userId);
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('update', 'Task'))
  @ApiOperation({
    summary: 'Transition task status',
    description:
      'Transitions the task to a new status following the state machine. Validates permissions per role and assignment.',
  })
  @ApiOkResponse({ description: 'Task transitioned successfully', type: TaskResponseDto })
  @ApiNotFoundResponse({ description: 'Task not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions for this transition' })
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionTaskDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskResponseDto> {
    return this.tasksService.transition(id, dto, user);
  }

  @Patch(':id/assign')
  @CheckPolicies((ability) => ability.can('update', 'Task'))
  @ApiOperation({
    summary: 'Reassign a task',
    description:
      'Reassigns a task to a different user. Only COFETAR, PATISER, and ADMINISTRATOR can reassign.',
  })
  @ApiOkResponse({ description: 'Task reassigned successfully', type: TaskResponseDto })
  @ApiNotFoundResponse({ description: 'Task not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('assignedToId', ParseUUIDPipe) assignedToId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskResponseDto> {
    return this.tasksService.assignTask(id, assignedToId, user);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', 'Task'))
  @ApiOperation({
    summary: 'Delete a task',
    description: 'Permanently removes a task from the database.',
  })
  @ApiOkResponse({ description: 'Task deleted successfully', type: TaskResponseDto })
  @ApiNotFoundResponse({ description: 'Task not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TaskResponseDto> {
    return this.tasksService.remove(id, user.userId);
  }
}
