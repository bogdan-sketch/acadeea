import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { SalesDeductionsFeatureGuard } from '@/modules/sales-deductions/sales-deductions.feature';
import { BulkDeleteService } from './bulk-delete.service';
import { BulkActionService } from './bulk-action.service';
import {
  BulkActionRequestDto,
  BulkActionResultDto,
  BulkDeletePreviewDto,
  BulkDeletePreviewRequestDto,
  BulkDeleteRequestDto,
  BulkDeleteResultDto,
} from './dto';

const DESCRIPTION =
  'Deletes every id independently; per-row failures are reported in `failed` instead of aborting. ' +
  'Without `cascade: true` a row that has dependents (see the preview) is refused with a reason; ' +
  'with it, dependents are removed/unlinked so the delete always goes through.';

const ACTION_DESCRIPTION =
  'Applies one action (see `action` keys) to every id independently, reusing the single-row rules of ' +
  'the resource; per-row failures are reported in `failed` instead of aborting.';

function actorOf(user: JwtPayload) {
  return { userId: user.userId, email: user.email, organizationId: user.organizationId };
}

/**
 * "Selectează și șterge" — multi-select delete for list screens. Policies
 * mirror the single-row DELETE of each resource. Registered before the
 * resource controllers so these literal paths beat their `:id` routes.
 */
@ApiTags('Bulk Delete')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1')
export class BulkActionsController {
  constructor(
    private readonly service: BulkDeleteService,
    private readonly actions: BulkActionService,
  ) {}

  // ---- tasks ----

  @Post('tasks/bulk-action')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('update', 'Task'))
  @ApiOperation({
    summary: 'Bulk action (tasks)',
    description: ACTION_DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkActionResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  actionTasks(
    @Body() dto: BulkActionRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkActionResultDto> {
    return this.actions.run('tasks', dto.ids, dto.action, dto.params, user);
  }

  @Post('tasks/bulk-delete/preview')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'Task'))
  @ApiOperation({ summary: 'Preview bulk delete (tasks): what else would be touched' })
  @ApiOkResponse({ type: BulkDeletePreviewDto })
  previewTasks(@Body() dto: BulkDeletePreviewRequestDto): Promise<BulkDeletePreviewDto> {
    return this.service.preview('tasks', dto.ids);
  }

  @Post('tasks/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'Task'))
  @ApiOperation({
    summary: 'Bulk delete (tasks)',
    description: DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkDeleteResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  deleteTasks(
    @Body() dto: BulkDeleteRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkDeleteResultDto> {
    return this.service.run('tasks', dto.ids, dto.cascade === true, actorOf(user));
  }

  // ---- orders ----

  @Post('orders/bulk-action')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  @ApiOperation({
    summary: 'Bulk action (orders)',
    description: ACTION_DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkActionResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  actionOrders(
    @Body() dto: BulkActionRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkActionResultDto> {
    return this.actions.run('orders', dto.ids, dto.action, dto.params, user);
  }

  @Post('orders/bulk-delete/preview')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'Order'))
  @ApiOperation({ summary: 'Preview bulk delete (orders): what else would be touched' })
  @ApiOkResponse({ type: BulkDeletePreviewDto })
  previewOrders(@Body() dto: BulkDeletePreviewRequestDto): Promise<BulkDeletePreviewDto> {
    return this.service.preview('orders', dto.ids);
  }

  @Post('orders/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'Order'))
  @ApiOperation({
    summary: 'Bulk delete (orders)',
    description: DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkDeleteResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  deleteOrders(
    @Body() dto: BulkDeleteRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkDeleteResultDto> {
    return this.service.run('orders', dto.ids, dto.cascade === true, actorOf(user));
  }

  // ---- transfers ----

  @Post('stock/transfers/bulk-action')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('update', 'StockTransfer'))
  @ApiOperation({
    summary: 'Bulk action (transfers)',
    description: ACTION_DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkActionResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  actionTransfers(
    @Body() dto: BulkActionRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkActionResultDto> {
    return this.actions.run('transfers', dto.ids, dto.action, dto.params, user);
  }

  @Post('stock/transfers/bulk-delete/preview')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'StockTransfer'))
  @ApiOperation({ summary: 'Preview bulk delete (transfers): what else would be touched' })
  @ApiOkResponse({ type: BulkDeletePreviewDto })
  previewTransfers(@Body() dto: BulkDeletePreviewRequestDto): Promise<BulkDeletePreviewDto> {
    return this.service.preview('transfers', dto.ids);
  }

  @Post('stock/transfers/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'StockTransfer'))
  @ApiOperation({
    summary: 'Bulk delete (transfers)',
    description: DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkDeleteResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  deleteTransfers(
    @Body() dto: BulkDeleteRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkDeleteResultDto> {
    return this.service.run('transfers', dto.ids, dto.cascade === true, actorOf(user));
  }

  // ---- raw-materials ----

  @Post('raw-materials/bulk-action')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('update', 'RawMaterial'))
  @ApiOperation({
    summary: 'Bulk action (raw-materials)',
    description: ACTION_DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkActionResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  actionRawMaterials(
    @Body() dto: BulkActionRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkActionResultDto> {
    return this.actions.run('raw-materials', dto.ids, dto.action, dto.params, user);
  }

  @Post('raw-materials/bulk-delete/preview')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'RawMaterial'))
  @ApiOperation({ summary: 'Preview bulk delete (raw-materials): what else would be touched' })
  @ApiOkResponse({ type: BulkDeletePreviewDto })
  previewRawMaterials(@Body() dto: BulkDeletePreviewRequestDto): Promise<BulkDeletePreviewDto> {
    return this.service.preview('raw-materials', dto.ids);
  }

  @Post('raw-materials/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'RawMaterial'))
  @ApiOperation({
    summary: 'Bulk delete (raw-materials)',
    description: DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkDeleteResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  deleteRawMaterials(
    @Body() dto: BulkDeleteRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkDeleteResultDto> {
    return this.service.run('raw-materials', dto.ids, dto.cascade === true, actorOf(user));
  }

  // ---- consumables ----

  @Post('consumables/bulk-action')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('update', 'Consumable'))
  @ApiOperation({
    summary: 'Bulk action (consumables)',
    description: ACTION_DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkActionResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  actionConsumables(
    @Body() dto: BulkActionRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkActionResultDto> {
    return this.actions.run('consumables', dto.ids, dto.action, dto.params, user);
  }

  @Post('consumables/bulk-delete/preview')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'Consumable'))
  @ApiOperation({ summary: 'Preview bulk delete (consumables): what else would be touched' })
  @ApiOkResponse({ type: BulkDeletePreviewDto })
  previewConsumables(@Body() dto: BulkDeletePreviewRequestDto): Promise<BulkDeletePreviewDto> {
    return this.service.preview('consumables', dto.ids);
  }

  @Post('consumables/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'Consumable'))
  @ApiOperation({
    summary: 'Bulk delete (consumables)',
    description: DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkDeleteResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  deleteConsumables(
    @Body() dto: BulkDeleteRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkDeleteResultDto> {
    return this.service.run('consumables', dto.ids, dto.cascade === true, actorOf(user));
  }

  // ---- recipes ----

  @Post('recipes/bulk-action')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('update', 'Recipe'))
  @ApiOperation({
    summary: 'Bulk action (recipes)',
    description: ACTION_DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkActionResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  actionRecipes(
    @Body() dto: BulkActionRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkActionResultDto> {
    return this.actions.run('recipes', dto.ids, dto.action, dto.params, user);
  }

  @Post('recipes/bulk-delete/preview')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'Recipe'))
  @ApiOperation({ summary: 'Preview bulk delete (recipes): what else would be touched' })
  @ApiOkResponse({ type: BulkDeletePreviewDto })
  previewRecipes(@Body() dto: BulkDeletePreviewRequestDto): Promise<BulkDeletePreviewDto> {
    return this.service.preview('recipes', dto.ids);
  }

  @Post('recipes/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('delete', 'Recipe'))
  @ApiOperation({
    summary: 'Bulk delete (recipes)',
    description: DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkDeleteResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  deleteRecipes(
    @Body() dto: BulkDeleteRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkDeleteResultDto> {
    return this.service.run('recipes', dto.ids, dto.cascade === true, actorOf(user));
  }

  // ---- sales-deductions ----

  @Post('sales-deductions/bulk-action')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('create', 'StockMovement'))
  @ApiOperation({
    summary: 'Bulk action (sales-deductions)',
    description: ACTION_DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkActionResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  actionSalesDeductions(
    @Body() dto: BulkActionRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkActionResultDto> {
    return this.actions.run('sales-deductions', dto.ids, dto.action, dto.params, user);
  }

  @Post('sales-deductions/bulk-delete/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('delete', 'StockMovement'))
  @ApiOperation({ summary: 'Preview bulk delete (sales-deductions): what else would be touched' })
  @ApiOkResponse({ type: BulkDeletePreviewDto })
  previewSalesDeductions(@Body() dto: BulkDeletePreviewRequestDto): Promise<BulkDeletePreviewDto> {
    return this.service.preview('sales-deductions', dto.ids);
  }

  @Post('sales-deductions/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('delete', 'StockMovement'))
  @ApiOperation({
    summary: 'Bulk delete (sales-deductions)',
    description: DESCRIPTION,
  })
  @ApiOkResponse({ type: BulkDeleteResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  deleteSalesDeductions(
    @Body() dto: BulkDeleteRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<BulkDeleteResultDto> {
    return this.service.run('sales-deductions', dto.ids, dto.cascade === true, actorOf(user));
  }
}
