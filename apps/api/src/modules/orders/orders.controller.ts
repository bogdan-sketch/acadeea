import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { OrderStatus } from '@prisma/client';
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
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { ParseUUIDPipe } from '@/common/pipes';
import { PaginatedDto } from '@/common/dto';
import {
  CreateOrderDto,
  UpdateOrderDto,
  AddOrderItemDto,
  UpdateOrderItemDto,
  OrderQueryDto,
  OrderResponseDto,
  SignDeliveryNoteDto,
  OrderStatsQueryDto,
  OrderStatsResponseDto,
  ArchiveOrderDto,
  DeliveryMethodSummaryDto,
  SetDeliveryMethodAliasDto,
} from './dto';
import { ORDER_VIEWS, OrderView } from './order-views';
import { OrdersService } from './orders.service';
import { CertificatePdfService } from './certificate-pdf.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly certificatePdfService: CertificatePdfService,
  ) {}

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'Order'))
  @ApiOperation({ summary: 'Create a new order with items' })
  @ApiCreatedResponse({ description: 'Order created' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.ordersService.create(dto, user);
  }

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'Order'))
  @ApiOperation({ summary: 'List orders with filters' })
  @ApiOkResponse({ description: 'Paginated list of orders' })
  async findAll(@Query() query: OrderQueryDto): Promise<PaginatedDto<OrderResponseDto>> {
    return this.ordersService.findAll(query);
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can('read', 'Order'))
  @ApiOperation({ summary: 'Get order statistics' })
  @ApiOkResponse({ type: OrderStatsResponseDto })
  async getStats(@Query() query: OrderStatsQueryDto): Promise<OrderStatsResponseDto> {
    return this.ordersService.getStats(query);
  }

  @Get('delivery-methods')
  @CheckPolicies((ability) => ability.can('read', 'Order'))
  @ApiOperation({
    summary: 'Shop delivery methods seen on orders, with their short names',
    description:
      'Distinct methods (Order.deliveryMethod parts) + admin short names; most used first. Powers the order filter and card labels.',
  })
  @ApiOkResponse({ type: [DeliveryMethodSummaryDto] })
  async getDeliveryMethods(): Promise<DeliveryMethodSummaryDto[]> {
    return this.ordersService.getDeliveryMethods();
  }

  @Put('delivery-methods/alias')
  // Org-wide naming — same gate as the organization settings (admin).
  @CheckPolicies((ability) => ability.can('manage', 'Organization'))
  @ApiOperation({
    summary: 'Set the short name and/or Ridicare/Livrare assignment of a shop delivery method',
    description:
      'Omitted fields stay; empty/null shortName = default label, null kind = auto-detected. Returns the updated method list.',
  })
  @ApiOkResponse({ type: [DeliveryMethodSummaryDto] })
  async setDeliveryMethodAlias(
    @Body() dto: SetDeliveryMethodAliasDto,
  ): Promise<DeliveryMethodSummaryDto[]> {
    return this.ordersService.setDeliveryMethodAlias(dto);
  }

  @Get('calendar')
  @CheckPolicies((ability) => ability.can('read', 'Order'))
  @ApiOperation({
    summary: 'Get orders grouped by day',
    description:
      'view=livrari (default): grouped by due day, undated orders on today. view=intrari: grouped by the day they were placed. Filter by date range, status and deliveryMethod.',
  })
  @ApiOkResponse({ description: 'Calendar map of date -> orders' })
  async getCalendar(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('view') view?: string,
    @Query('deliveryMethod') deliveryMethod?: string,
    @Query('deliveryKind') deliveryKind?: string,
  ): Promise<Record<string, OrderResponseDto[]>> {
    const statusList = status ? (status.split(',') as OrderStatus[]) : undefined;
    if (view !== undefined && !(ORDER_VIEWS as readonly string[]).includes(view)) {
      throw new BadRequestException(`view must be one of: ${ORDER_VIEWS.join(', ')}`);
    }
    if (deliveryKind !== undefined && deliveryKind !== 'PICKUP' && deliveryKind !== 'DELIVERY') {
      throw new BadRequestException('deliveryKind must be PICKUP or DELIVERY');
    }
    return this.ordersService.getCalendar(
      from,
      to,
      statusList,
      (view as OrderView | undefined) ?? 'livrari',
      deliveryMethod || undefined,
      (deliveryKind as 'PICKUP' | 'DELIVERY' | undefined) || undefined,
    );
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'Order'))
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiOkResponse({ description: 'Order detail' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponseDto> {
    return this.ordersService.findById(id);
  }

  @Get(':id/status-history')
  @CheckPolicies((ability) => ability.can('read', 'Order'))
  @ApiOperation({ summary: 'Get order status change history' })
  @ApiOkResponse({ description: 'Status history entries' })
  async getStatusHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.getStatusHistory(id);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  @ApiOperation({ summary: 'Update order status or fields' })
  @ApiOkResponse({ description: 'Updated order' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    return this.ordersService.update(id, dto, user);
  }

  @Patch(':id/archive')
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  @ApiOperation({
    summary: 'Archive / unarchive an order',
    description:
      'Archived orders keep their items, documents and status history but are hidden ' +
      'from default listings, stats and the calendar. Only LIVRATA/ANULATA orders can ' +
      'be archived. List them back with GET /orders?archived=true.',
  })
  @ApiOkResponse({ description: 'Order archive state updated' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  async setArchived(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveOrderDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.setArchived(id, dto.archived);
  }

  @Post('archive-completed')
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  @ApiOperation({
    summary: 'Bulk-archive all delivered/cancelled orders',
    description:
      'Archives every LIVRATA/ANULATA order in one go (the nightly job does the same ' +
      'automatically for orders closed more than 60 days ago).',
  })
  @ApiOkResponse({ description: 'Number of orders archived' })
  async archiveCompleted(): Promise<{ archived: number }> {
    return this.ordersService.archiveCompleted(0);
  }

  // ---- Items ----

  @Post(':id/items')
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  @ApiOperation({ summary: 'Add item to order' })
  @ApiCreatedResponse({ description: 'Item added' })
  async addItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOrderItemDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.addItem(id, dto);
  }

  @Patch(':id/items/:itemId')
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  @ApiOperation({ summary: 'Update order item' })
  @ApiOkResponse({ description: 'Item updated' })
  async updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateOrderItemDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  @ApiOperation({ summary: 'Remove item from order' })
  @ApiOkResponse({ description: 'Item removed' })
  async removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.removeItem(id, itemId);
  }

  // ---- Invoice ----

  @Post(':id/invoice')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  @ApiOperation({ summary: 'Upload invoice file for order' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ description: 'Invoice uploaded' })
  async uploadInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<OrderResponseDto> {
    if (!file) throw new BadRequestException('File is required');
    return this.ordersService.uploadInvoice(id, file);
  }

  @Get(':id/invoice')
  @CheckPolicies((ability) => ability.can('read', 'Order'))
  @ApiOperation({ summary: 'Download invoice file' })
  @ApiOkResponse({ description: 'Invoice file' })
  async getInvoice(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const invoice = await this.ordersService.getInvoice(id);
    res.set({
      'Content-Type': invoice.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(invoice.fileName)}"`,
      'Content-Length': invoice.data.length,
    });
    res.send(invoice.data);
  }

  @Delete(':id/invoice')
  @CheckPolicies((ability) => ability.can('update', 'Order'))
  @ApiOperation({ summary: 'Delete invoice from order' })
  @ApiOkResponse({ description: 'Invoice deleted' })
  async deleteInvoice(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponseDto> {
    return this.ordersService.deleteInvoice(id);
  }

  // ---- Delivery Note ----

  @Post(':id/delivery-note')
  @CheckPolicies((ability) => ability.can('create', 'DeliveryNote'))
  @ApiOperation({ summary: 'Generate delivery note for order' })
  @ApiCreatedResponse({ description: 'Delivery note created' })
  async createDeliveryNote(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponseDto> {
    return this.ordersService.createDeliveryNote(id);
  }

  @Post(':id/conformity-certificate')
  @CheckPolicies((ability) => ability.can('create', 'DeliveryNote'))
  @ApiOperation({ summary: 'Generate conformity certificate for order delivery note' })
  @ApiCreatedResponse({ description: 'Certificate created' })
  async createConformityCertificate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { notes?: string },
  ): Promise<OrderResponseDto> {
    return this.ordersService.createConformityCertificate(id, user.userId, body?.notes);
  }

  @Get(':id/conformity-certificate')
  @CheckPolicies((ability) => ability.can('read', 'DeliveryNote'))
  @ApiOperation({ summary: 'Get conformity certificate' })
  @ApiOkResponse({ description: 'Conformity certificate data' })
  async getConformityCertificate(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.getConformityCertificate(id);
  }

  @Get(':id/conformity-certificate/pdf')
  @CheckPolicies((ability) => ability.can('read', 'DeliveryNote'))
  @ApiOperation({ summary: 'Download conformity certificate as PDF' })
  @ApiOkResponse({ description: 'Conformity certificate PDF' })
  @ApiNotFoundResponse({ description: 'Certificate not found' })
  async getConformityCertificatePdf(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { buffer, fileName } =
      await this.certificatePdfService.generateConformityCertificatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Get(':id/delivery-note')
  @CheckPolicies((ability) => ability.can('read', 'DeliveryNote'))
  @ApiOperation({ summary: 'Get delivery note' })
  @ApiOkResponse({ description: 'Delivery note' })
  async getDeliveryNote(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.getDeliveryNote(id);
  }

  @Get(':id/delivery-note/signature')
  @CheckPolicies((ability) => ability.can('read', 'DeliveryNote'))
  @ApiOperation({ summary: 'Get signature image as PNG' })
  @ApiOkResponse({ description: 'Signature PNG image' })
  async getSignatureImage(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const imageBuffer = await this.ordersService.getSignatureImage(id);
    res.set({ 'Content-Type': 'image/png', 'Content-Length': imageBuffer.length });
    res.send(imageBuffer);
  }

  @Patch(':id/delivery-note/sign')
  @UseInterceptors(FileInterceptor('signature'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sign delivery note with signature image' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        signature: { type: 'string', format: 'binary' },
        signedByName: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['signature', 'signedByName'],
    },
  })
  @ApiOkResponse({ description: 'Delivery note signed' })
  async signDeliveryNote(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
    @Body() dto: SignDeliveryNoteDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    if (!file) {
      throw new Error('Signature image is required');
    }
    return this.ordersService.signDeliveryNote(id, dto, new Uint8Array(file.buffer), user);
  }
}
