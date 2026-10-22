import type { Response } from 'express';
import {
  BadRequestException,
  Body,
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
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
  ConfirmSalesDeductionDto,
  CreateManualSalesDeductionDto,
  CreateWooSalesDeductionDto,
  SalesDeductionResponseDto,
  SalesProductOptionDto,
} from './dto/sales-deduction.dto';
import { SalesDeductionsFeatureGuard, salesDeductionsEnabled } from './sales-deductions.feature';
import { SalesDeductionsService } from './sales-deductions.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Scădere stoc din vânzări — DRAFT (from Excel / manual / WooCommerce) →
 * review → bulk confirm. Reads need `read StockMovement`, writes need
 * `create StockMovement` (same gate as manual recipe stock movements).
 * Test-environment only for now (SalesDeductionsFeatureGuard).
 */
@ApiTags('Sales deductions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/sales-deductions')
export class SalesDeductionsController {
  constructor(private readonly service: SalesDeductionsService) {}

  @Get('feature')
  @ApiOperation({ summary: 'Whether sales deductions are enabled on this environment' })
  feature(): { enabled: boolean } {
    return { enabled: salesDeductionsEnabled() };
  }

  @Get('template')
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({
    summary: 'CSV template for a manual deduction: every sellable product, quantity left blank',
    description:
      'Columns Denumire;Cantitate;U.M. (semicolon-separated, UTF-8 with BOM so Excel opens it). ' +
      'Fill in Cantitate for the sold products, delete the rest or leave them blank, then ' +
      'upload the file with POST /excel.',
  })
  async template(@Query('locationId') locationId: string, @Res() res: Response): Promise<void> {
    if (!locationId || !UUID_RE.test(locationId)) {
      throw new BadRequestException('locationId invalid.');
    }
    const csv = await this.service.buildTemplateCsv(locationId);
    const date = new Date().toISOString().slice(0, 10);
    res.status(HttpStatus.OK);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="scadere-stoc-${date}.csv"`,
    });
    res.end(csv);
  }

  @Get('products')
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({ summary: 'Sellable products with their stock at a location (picker)' })
  @ApiQuery({ name: 'locationId', required: true })
  @ApiOkResponse({ type: [SalesProductOptionDto] })
  products(@Query('locationId') locationId: string): Promise<SalesProductOptionDto[]> {
    if (!locationId || !UUID_RE.test(locationId)) {
      throw new BadRequestException('locationId invalid.');
    }
    return this.service.listProducts(locationId);
  }

  @Get()
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOperation({ summary: 'Log of sales deductions (confirmed / reverted / open drafts)' })
  list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ): Promise<PaginatedDto<SalesDeductionResponseDto>> {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    return this.service.findAll(p, l);
  }

  @Post('excel')
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('create', 'StockMovement'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Parse a POS sales export (eBriza .xlsx / .csv) into a DRAFT',
    description:
      'Header-driven parser (Denumire/Produs + Cantitate [+ U.M.]); products are matched ' +
      'by name (learned aliases → exact → containment → fuzzy). Nothing touches stock ' +
      'until POST /:id/confirm.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        locationId: { type: 'string', format: 'uuid' },
      },
      required: ['file', 'locationId'],
    },
  })
  fromExcel(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body('locationId') locationId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SalesDeductionResponseDto> {
    if (!locationId || !UUID_RE.test(locationId)) {
      throw new BadRequestException('Alege locația de unde se scade stocul.');
    }
    return this.service.createFromExcel(file, locationId, user.userId);
  }

  @Post('manual')
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('create', 'StockMovement'))
  @ApiOperation({ summary: 'Start an empty DRAFT for manual entry' })
  manual(
    @Body() dto: CreateManualSalesDeductionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SalesDeductionResponseDto> {
    return this.service.createManual(dto.locationId, user.userId);
  }

  @Post('woocommerce')
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('create', 'StockMovement'))
  @ApiOperation({ summary: 'DRAFT from WooCommerce orders placed in [from, to]' })
  fromWoo(
    @Body() dto: CreateWooSalesDeductionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SalesDeductionResponseDto> {
    return this.service.createFromWoo(dto.locationId, dto.from, dto.to, user.userId);
  }

  @Get(':id')
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('read', 'StockMovement'))
  @ApiOkResponse({ type: SalesDeductionResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SalesDeductionResponseDto> {
    return this.service.findOne(id);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('create', 'StockMovement'))
  @ApiOperation({
    summary: 'Apply the reviewed lines to stock in one transaction',
    description:
      'The body is authoritative (lines omitted are dropped). Selling more than on hand ' +
      'returns 409 SALES_001 with the list unless each such line has acceptShortfall ' +
      '(stock clamped to 0) or stockOverride. Sends ONE summary notification.',
  })
  @ApiOkResponse({ type: SalesDeductionResponseDto })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmSalesDeductionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SalesDeductionResponseDto> {
    return this.service.confirm(id, dto, user.userId);
  }

  @Post(':id/discard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('create', 'StockMovement'))
  @ApiOperation({ summary: 'Drop an unconfirmed DRAFT' })
  discard(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.discard(id);
  }

  @Post(':id/revert')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SalesDeductionsFeatureGuard)
  @CheckPolicies((ability) => ability.can('create', 'StockMovement'))
  @ApiOperation({ summary: 'Undo a CONFIRMED deduction (puts the stock back)' })
  @ApiOkResponse({ type: SalesDeductionResponseDto })
  revert(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SalesDeductionResponseDto> {
    return this.service.revert(id, user.userId);
  }
}
