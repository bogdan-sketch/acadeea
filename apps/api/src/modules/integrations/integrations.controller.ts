import {
  Body,
  Controller,
  Headers,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Patch,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IntegrationProvider } from '@prisma/client';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { ParseUUIDPipe } from '@/common/pipes';
import {
  CreateIntegrationDto,
  UpdateIntegrationDto,
  IntegrationResponseDto,
  CreateProductMappingDto,
  ProductMappingResponseDto,
  ExternalOrderResponseDto,
} from './dto';
import { IntegrationsService, WooBackfillResult } from './integrations.service';

// =============================================================================
// Admin controller — all endpoints require JWT + ADMINISTRATOR role
// =============================================================================

@ApiTags('Integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@CheckPolicies((ability) => ability.can('manage', 'all'))
@Controller('api/v1/integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  // ---- Integration CRUD ----

  @Get()
  @ApiOperation({ summary: 'List all integrations' })
  @ApiOkResponse({ type: [IntegrationResponseDto] })
  async findAll(): Promise<IntegrationResponseDto[]> {
    return this.integrationsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get integration by ID' })
  @ApiOkResponse({ type: IntegrationResponseDto })
  @ApiNotFoundResponse({ description: 'Integration not found' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<IntegrationResponseDto> {
    return this.integrationsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new integration' })
  @ApiCreatedResponse({ type: IntegrationResponseDto })
  async create(@Body() dto: CreateIntegrationDto): Promise<IntegrationResponseDto> {
    return this.integrationsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update integration' })
  @ApiOkResponse({ type: IntegrationResponseDto })
  @ApiNotFoundResponse({ description: 'Integration not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIntegrationDto,
  ): Promise<IntegrationResponseDto> {
    return this.integrationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete integration' })
  @ApiNoContentResponse({ description: 'Integration deleted' })
  @ApiNotFoundResponse({ description: 'Integration not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.integrationsService.remove(id);
  }

  // ---- Product Mappings ----

  @Get(':id/mappings')
  @ApiOperation({ summary: 'List product mappings for an integration' })
  @ApiOkResponse({ type: [ProductMappingResponseDto] })
  @ApiNotFoundResponse({ description: 'Integration not found' })
  async findMappings(@Param('id', ParseUUIDPipe) id: string): Promise<ProductMappingResponseDto[]> {
    return this.integrationsService.findMappings(id);
  }

  @Post(':id/mappings')
  @ApiOperation({ summary: 'Create product mapping' })
  @ApiCreatedResponse({ type: ProductMappingResponseDto })
  @ApiNotFoundResponse({ description: 'Integration or recipe not found' })
  async createMapping(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProductMappingDto,
  ): Promise<ProductMappingResponseDto> {
    return this.integrationsService.createMapping(id, dto);
  }

  @Delete(':id/mappings/:mappingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete product mapping' })
  @ApiNoContentResponse({ description: 'Mapping deleted' })
  @ApiNotFoundResponse({ description: 'Mapping not found' })
  async removeMapping(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mappingId', ParseUUIDPipe) mappingId: string,
  ): Promise<void> {
    return this.integrationsService.removeMapping(id, mappingId);
  }

  // ---- External Orders ----

  @Get(':id/orders')
  @ApiOperation({ summary: 'List external orders for an integration' })
  @ApiOkResponse({ type: [ExternalOrderResponseDto] })
  @ApiNotFoundResponse({ description: 'Integration not found' })
  async findExternalOrders(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExternalOrderResponseDto[]> {
    return this.integrationsService.findExternalOrders(id);
  }

  // ---- Sync ----

  @Post(':id/sync')
  @ApiOperation({ summary: 'Trigger manual sync of pending external orders' })
  @ApiOkResponse({
    description: 'Sync result',
    schema: {
      type: 'object',
      properties: {
        synced: { type: 'number' },
        failed: { type: 'number' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Integration not found' })
  async triggerSync(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ synced: number; failed: number }> {
    return this.integrationsService.triggerSync(id);
  }

  @Post(':id/woocommerce/backfill')
  @ApiOperation({
    summary:
      'Backfill WooCommerce orders from the last 90 days (processing/completed); only orders with a pickup deadline today or later are created — past-deadline ones are recorded as SKIPPED',
  })
  @ApiOkResponse({
    description: 'Backfill result',
    schema: {
      type: 'object',
      properties: {
        fetched: { type: 'number' },
        stored: { type: 'number' },
        skippedPast: { type: 'number' },
        synced: { type: 'number' },
        failed: { type: 'number' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Integration not found' })
  @HttpCode(HttpStatus.OK)
  async backfillWooCommerce(@Param('id', ParseUUIDPipe) id: string): Promise<WooBackfillResult> {
    return this.integrationsService.backfillWooCommerce(id);
  }
}

// =============================================================================
// Webhook controller — NO authentication required
// =============================================================================

@ApiTags('Integrations Webhooks')
@Controller('api/v1/integrations')
export class IntegrationsWebhookController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  // Per-integration webhook URLs (multi-tenant): the integration id in the
  // path resolves the organization. Configure THESE at the provider.

  @Post(':id/webhook/ebriza')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'eBriza webhook endpoint, per integration (no auth)' })
  @ApiOkResponse({ description: 'Webhook received' })
  async ebrizaWebhookForIntegration(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
  ): Promise<void> {
    await this.integrationsService.processWebhook(IntegrationProvider.EBRIZA, body, id);
  }

  @Post(':id/webhook/woocommerce')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'WooCommerce webhook endpoint, per integration (no auth)' })
  @ApiOkResponse({ description: 'Webhook received' })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid X-WC-Webhook-Signature, or no webhook secret configured',
  })
  async woocommerceWebhookForIntegration(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-wc-webhook-signature') signature?: string,
  ): Promise<void> {
    await this.integrationsService.processWebhook(IntegrationProvider.WOOCOMMERCE, body, id, {
      rawBody: req.rawBody,
      signature,
    });
  }

  // Legacy provider-only routes — unambiguous only while a single org has the
  // provider configured; kept for already-registered webhook URLs.

  @Post('ebriza/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'eBriza webhook endpoint (no auth, legacy single-org)' })
  @ApiOkResponse({ description: 'Webhook received' })
  async ebrizaWebhook(@Body() body: any): Promise<void> {
    await this.integrationsService.processWebhook(IntegrationProvider.EBRIZA, body);
  }

  @Post('woocommerce/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'WooCommerce webhook endpoint (no auth, legacy single-org)' })
  @ApiOkResponse({ description: 'Webhook received' })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid X-WC-Webhook-Signature, or no webhook secret configured',
  })
  async woocommerceWebhook(
    @Body() body: any,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-wc-webhook-signature') signature?: string,
  ): Promise<void> {
    await this.integrationsService.processWebhook(
      IntegrationProvider.WOOCOMMERCE,
      body,
      undefined,
      {
        rawBody: req.rawBody,
        signature,
      },
    );
  }
}
