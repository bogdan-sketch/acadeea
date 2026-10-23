import {
  BadRequestException,
  Body,
  Patch,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { ParseUUIDPipe } from '@/common/pipes';
import { PaginatedDto } from '@/common/dto';
import {
  CreateStockMovementDto,
  StockMovementResponseDto,
  StockMovementQueryDto,
  RecipeStockQueryDto,
  RecipeStockResponseDto,
  RecipeLotResponseDto,
  CreateRecipeMovementDto,
  BatchReceiveDto,
  StockLotResponseDto,
  SetLotHoldDto,
  LowStockItemDto,
  ExpiringItemDto,
  RequirementsPlanDto,
  RequirementsPlanResponseDto,
  ItemAvailabilityQueryDto,
  StockItemAvailabilityDto,
  TestConsumptionDto,
  StockImportResultDto,
} from './dto';
import { StockService } from './stock.service';
import { RequirementsPlanService } from './services/requirements-plan.service';
import { StockImportExportService } from './services/stock-import-export.service';
import { StockReviewService } from './services/stock-review.service';
import { StockReviewResultDto } from './dto/stock-review.dto';
import { StockTraceabilityService } from './services/stock-traceability.service';
import { StockTraceabilityDto, StockTraceabilityQueryDto } from './dto/stock-traceability.dto';

@ApiTags('Stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/stock')
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly requirementsPlan: RequirementsPlanService,
    private readonly importExport: StockImportExportService,
    private readonly review: StockReviewService,
    private readonly traceability: StockTraceabilityService,
  ) {}

  @Post('test-consumption')
  // A test bake consumes raw materials OR consumables — allow either update.
  @CheckPolicies(
    (ability) => ability.can('update', 'RawMaterial') || ability.can('update', 'Consumable'),
  )
  @ApiOperation({
    summary: 'Consume stock for tests / R&D',
    description:
      'Decrements stock exactly like production consumption (per-location stock, ' +
      'global count resync, FIFO on lots) but without a task or recipe output. ' +
      'Creates one IESIRE_TESTE movement per item. Exactly one of ' +
      'rawMaterialId or consumableId must be provided per item.',
  })
  @ApiCreatedResponse({ type: [StockMovementResponseDto] })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async testConsumption(
    @Body() dto: TestConsumptionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<StockMovementResponseDto[]> {
    return this.stockService.testConsumption(dto, user.userId);
  }

  @Get('export')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({
    summary: 'Export the full stock as .xlsx (admin only)',
    description:
      'Two sheets — "Materii prime" and "Consumabile" — one row per item. ' +
      'The ID column is the strict match key for re-import.',
  })
  async exportStock(@Res() res: Response): Promise<void> {
    const buffer = await this.importExport.exportXlsx();
    const date = new Date().toISOString().slice(0, 10);
    res.status(HttpStatus.OK);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="stoc-${date}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('review/export')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({
    summary: 'Revizie stocuri: every stock row per lot as .xlsx (admin only)',
    description:
      'Four sheets — Materii prime, Consumabile, Semipreparate, Produse finite — one row per lot ' +
      '(name, supplier, expiry, purchase price, quantity) plus a STOC row for stock without lots. ' +
      'Edit Cantitate / Preț / Data expirare / Furnizor and send it back to POST stock/review/import.',
  })
  async exportStockReview(@Res() res: Response): Promise<void> {
    const buffer = await this.review.exportXlsx();
    const date = new Date().toISOString().slice(0, 10);
    res.status(HttpStatus.OK);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="revizie-stocuri-${date}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post('review/import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({
    summary: 'Revizie stocuri: apply an edited (possibly partial) review sheet (admin only)',
    description:
      'Rows are matched on the ID column; only rows present in the file are touched, rows that no ' +
      'longer exist are reported as unknown. dryRun=true (default) returns the changes without ' +
      'writing; dryRun=false applies them in one transaction, every quantity change logged as an ' +
      'AJUSTARE "Revizie stocuri".',
  })
  async importStockReview(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Query('dryRun') dryRun: string | undefined,
    @CurrentUser() user: JwtPayload,
  ): Promise<StockReviewResultDto> {
    if (!file?.buffer) throw new BadRequestException('Lipsește fișierul .xlsx.');
    return this.review.importXlsx(file.buffer, dryRun !== 'false', user.userId);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({
    summary: 'Import an (edited) stock export .xlsx (admin only)',
    description:
      'Rows are matched strictly on the ID column; only Cantitate, Preț achiziție ' +
      'and Stoc minim are compared/applied. dryRun=true (default) returns the diff ' +
      'without writing; dryRun=false applies it in one transaction with AJUSTARE ' +
      'movements for every quantity change.',
  })
  @ApiQuery({ name: 'dryRun', required: false, enum: ['true', 'false'] })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: StockImportResultDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async importStock(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
    @CurrentUser() user: JwtPayload,
    @Query('dryRun') dryRun?: string,
  ): Promise<StockImportResultDto> {
    if (!file?.buffer) {
      throw new BadRequestException('Niciun fișier încărcat. Trimite câmpul "file".');
    }
    return this.importExport.importXlsx(file.buffer, dryRun !== 'false', user.userId);
  }

  @Post('requirements-plan')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('read', 'RawMaterial'))
  @ApiOperation({
    summary: 'Compute raw-material requirements for a production plan',
    description:
      'Given a list of products (recipe + quantity), resolves every recipe tree ' +
      '(semipreparate expanded down to raw materials) and returns the aggregated ' +
      'raw-material needs with supplier, current stock, and purchase deficit.',
  })
  @ApiOkResponse({ type: RequirementsPlanResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async computeRequirementsPlan(
    @Body() dto: RequirementsPlanDto,
  ): Promise<RequirementsPlanResponseDto> {
    return this.requirementsPlan.plan(dto);
  }

  @Post('requirements-plan/export')
  // 200, not Nest's POST-default 201 — it's a download, and clients (iOS)
  // validate the exact status.
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('read', 'RawMaterial'))
  @ApiOperation({ summary: 'Export the raw-material requirements plan as an .xlsx file' })
  async exportRequirementsPlan(
    @Body() dto: RequirementsPlanDto,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.requirementsPlan.exportXlsx(dto);
    res.status(HttpStatus.OK);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="necesar-mp.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post('movements')
  @CheckPolicies((ability) => ability.can('create', 'StockMovement'))
  @ApiOperation({
    summary: 'Create a manual stock movement',
    description:
      'Creates a new stock entry (INTRARE) or adjustment (AJUSTARE). ' +
      'Exactly one of rawMaterialId or consumableId must be provided.',
  })
  @ApiCreatedResponse({
    description: 'Stock movement created successfully',
    type: StockMovementResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async createMovement(
    @Body() dto: CreateStockMovementDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<StockMovementResponseDto> {
    return this.stockService.createMovement(dto, user.userId);
  }

  @Get('movements')
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({
    summary: 'List stock movements',
    description: 'Returns a paginated list of stock movements with optional filters.',
  })
  @ApiOkResponse({ description: 'Paginated list of stock movements' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findMovements(
    @Query() query: StockMovementQueryDto,
  ): Promise<PaginatedDto<StockMovementResponseDto>> {
    return this.stockService.findMovements(query);
  }

  @Get('movements/export')
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({
    summary: 'Stock movements log as .xlsx',
    description:
      'Same filters as GET movements (from/to/movementType/search/locationId/item ids). ' +
      'Without from/to it covers the last 30 days. Newest first, max 20 000 rows.',
  })
  async exportMovements(
    @Query() query: StockMovementQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.stockService.exportMovementsXlsx(query);
    const date = new Date().toISOString().slice(0, 10);
    res.status(HttpStatus.OK);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="miscari-stoc-${date}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('item-availability')
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({
    summary: 'Availability snapshot for one stock item',
    description:
      'Per-location quantities, active task reservations, and pending transfers for a raw ' +
      'material, consumable, or produced recipe (exactly one ID must be provided). Powers the ' +
      'item quick actions: transfer preselection and the reservation warning before zeroing.',
  })
  @ApiOkResponse({ type: StockItemAvailabilityDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Item not found' })
  async getItemAvailability(
    @Query() query: ItemAvailabilityQueryDto,
  ): Promise<StockItemAvailabilityDto> {
    return this.stockService.getItemAvailability(query);
  }

  @Get('traceability')
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({
    summary: 'Product traceability — every task that used (or produced) one stock item',
    description:
      'Exactly one of rawMaterialId / consumableId / recipeId. Rows: CONSUMED (finalized tasks, ' +
      'with FIFO intake lots for raw materials), RESERVED (tasks not finalized yet) and, for ' +
      'recipes, PRODUCED. Optional from/to (ISO) filter the row date. Newest first.',
  })
  @ApiOkResponse({ type: StockTraceabilityDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Item not found' })
  async getTraceability(@Query() query: StockTraceabilityQueryDto): Promise<StockTraceabilityDto> {
    return this.traceability.getTraceability(query);
  }

  @Get('recipes')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({
    summary: 'List recipe stock',
    description: 'Returns paginated recipe stock info, filterable by type, category, and search.',
  })
  @ApiOkResponse({ description: 'Paginated list of recipe stock' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findRecipeStock(
    @Query() query: RecipeStockQueryDto,
  ): Promise<PaginatedDto<RecipeStockResponseDto>> {
    return this.stockService.findRecipeStock(query);
  }

  @Get('recipes/:recipeId/lots')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({
    summary: 'List production lots for a recipe',
    description:
      'Returns the production batches (lots) with remaining quantity > 0 for a recipe, ' +
      'optionally filtered by location. FIFO order: earliest expiry first, then oldest production.',
  })
  @ApiOkResponse({ type: [RecipeLotResponseDto] })
  @ApiNotFoundResponse({ description: 'Recipe not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findRecipeLots(
    @Param('recipeId', ParseUUIDPipe) recipeId: string,
    @Query('locationId') locationId?: string,
  ): Promise<RecipeLotResponseDto[]> {
    return this.stockService.findRecipeLots(recipeId, locationId);
  }

  @Post('recipe-movements')
  @CheckPolicies((ability) => ability.can('create', 'StockMovement'))
  @ApiOperation({
    summary: 'Create a manual recipe stock movement',
    description: 'Creates a stock entry (INTRARE) or adjustment (AJUSTARE) for a recipe.',
  })
  @ApiCreatedResponse({
    description: 'Recipe stock movement created',
    type: StockMovementResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async createRecipeMovement(
    @Body() dto: CreateRecipeMovementDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<StockMovementResponseDto> {
    return this.stockService.createRecipeMovement(dto, user.userId);
  }

  @Post('movements/batch')
  @CheckPolicies((ability) => ability.can('create', 'StockMovement'))
  @ApiOperation({ summary: 'Batch receive multiple materials at once' })
  @ApiCreatedResponse({ type: [StockMovementResponseDto] })
  async batchReceive(
    @Body() dto: BatchReceiveDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<StockMovementResponseDto[]> {
    return this.stockService.batchReceive(dto, user.userId);
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({ summary: 'Get stock statistics' })
  @ApiOkResponse({ description: 'Material status counts and total' })
  async getStats() {
    return this.stockService.getStats();
  }

  @Get('low-stock')
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({ summary: 'List all materials below minimum stock' })
  @ApiOkResponse({ type: [LowStockItemDto] })
  async findLowStock(): Promise<LowStockItemDto[]> {
    return this.stockService.findLowStock();
  }

  @Get('expiring')
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({ summary: 'List materials expiring within N days' })
  @ApiOkResponse({ type: [ExpiringItemDto] })
  async findExpiring(@Query('days') days?: string): Promise<ExpiringItemDto[]> {
    // A non-numeric ?days used to become NaN → Invalid Date → Prisma 500.
    const parsed = days ? parseInt(days, 10) : NaN;
    return this.stockService.findExpiring(Number.isFinite(parsed) ? parsed : 30);
  }

  @Get('lots')
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({ summary: 'List stock lots' })
  @ApiOkResponse({ type: [StockLotResponseDto] })
  async findLots(
    @Query('rawMaterialId') rawMaterialId?: string,
    @Query('consumableId') consumableId?: string,
  ): Promise<StockLotResponseDto[]> {
    return this.stockService.findLots(rawMaterialId, consumableId);
  }

  @Patch('lots/:id/hold')
  // A lot may belong to a raw material OR a consumable — allow either update.
  @CheckPolicies(
    (ability) => ability.can('update', 'RawMaterial') || ability.can('update', 'Consumable'),
  )
  @ApiOperation({
    summary: 'Hold/release a stock lot for FIFO',
    description:
      'Held lots are consumed LAST by production — every other lot is used first. ' +
      'Body: {onHold: boolean}.',
  })
  @ApiOkResponse({ type: StockLotResponseDto })
  async setLotHold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetLotHoldDto,
  ): Promise<StockLotResponseDto> {
    return this.stockService.setLotHold(id, body.onHold);
  }

  @Get('movements/:id')
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({
    summary: 'Get stock movement by ID',
    description: 'Returns a single stock movement by its UUID.',
  })
  @ApiOkResponse({
    description: 'Stock movement found',
    type: StockMovementResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Stock movement not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findMovementById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StockMovementResponseDto> {
    return this.stockService.findMovementById(id);
  }
}
