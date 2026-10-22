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
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
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
  CreateLocationDto,
  UpdateLocationDto,
  LocationResponseDto,
  LocationStockResponseDto,
  LocationRecipeStockResponseDto,
  CreateTransferDto,
  TransferResponseDto,
  TransferQueryDto,
  UpdateTransferStatusDto,
  SignTransferAvizDto,
  AssignUserLocationDto,
  UpdateTransferApprovalDto,
  LocationUserResponseDto,
  LocationDashboardResponseDto,
} from './dto';
import { LocationsService } from './locations.service';

@ApiTags('Locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  // ========================================================================
  // Locations
  // ========================================================================

  @Post('locations')
  @CheckPolicies((ability) => ability.can('create', 'Location'))
  @ApiOperation({ summary: 'Create a new location' })
  @ApiCreatedResponse({ type: LocationResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async createLocation(@Body() dto: CreateLocationDto): Promise<LocationResponseDto> {
    return this.locationsService.createLocation(dto);
  }

  @Get('locations')
  @CheckPolicies((ability) => ability.can('read', 'Location'))
  @ApiOperation({ summary: 'List all locations' })
  @ApiOkResponse({ type: [LocationResponseDto] })
  async findAllLocations(): Promise<LocationResponseDto[]> {
    return this.locationsService.findAllLocations();
  }

  @Get('locations/my-locations')
  @CheckPolicies((ability) => ability.can('read', 'Location'))
  @ApiOperation({ summary: 'List locations assigned to the current user' })
  @ApiOkResponse({ type: [LocationResponseDto] })
  async findMyLocations(@CurrentUser() user: JwtPayload): Promise<LocationResponseDto[]> {
    return this.locationsService.findMyLocations(user.userId);
  }

  @Get('locations/:id')
  @CheckPolicies((ability) => ability.can('read', 'Location'))
  @ApiOperation({ summary: 'Get location by ID' })
  @ApiOkResponse({ type: LocationResponseDto })
  @ApiNotFoundResponse({ description: 'Location not found' })
  async findLocationById(@Param('id', ParseUUIDPipe) id: string): Promise<LocationResponseDto> {
    return this.locationsService.findLocationById(id);
  }

  @Patch('locations/:id')
  @CheckPolicies((ability) => ability.can('update', 'Location'))
  @ApiOperation({ summary: 'Update a location' })
  @ApiOkResponse({ type: LocationResponseDto })
  @ApiNotFoundResponse({ description: 'Location not found' })
  async updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
  ): Promise<LocationResponseDto> {
    return this.locationsService.updateLocation(id, dto);
  }

  @Delete('locations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability) => ability.can('delete', 'Location'))
  @ApiOperation({ summary: 'Delete a location' })
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: "Also delete the location's transfers (active transfers return stock to source)",
  })
  @ApiNotFoundResponse({ description: 'Location not found' })
  async deleteLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('force') force?: string,
  ): Promise<void> {
    return this.locationsService.deleteLocation(id, force === 'true');
  }

  @Get('locations/:id/stock')
  @CheckPolicies((ability) => ability.can('read', 'Location'))
  @ApiOperation({ summary: 'Get stock at a specific location' })
  @ApiOkResponse({ type: [LocationStockResponseDto] })
  @ApiNotFoundResponse({ description: 'Location not found' })
  async findLocationStock(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LocationStockResponseDto[]> {
    return this.locationsService.findLocationStock(id);
  }

  @Get('locations/:id/recipe-stock')
  @CheckPolicies((ability) => ability.can('read', 'Location'))
  @ApiOperation({
    summary: 'Get produced-recipe stock (produse finite + semipreparate) at a location',
  })
  @ApiOkResponse({ type: [LocationRecipeStockResponseDto] })
  @ApiNotFoundResponse({ description: 'Location not found' })
  async findLocationRecipeStock(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LocationRecipeStockResponseDto[]> {
    return this.locationsService.findLocationRecipeStock(id);
  }

  // ========================================================================
  // Location Users
  // ========================================================================

  @Post('locations/:id/users')
  @CheckPolicies((ability) => ability.can('update', 'Location'))
  @ApiOperation({ summary: 'Assign a user to a location' })
  @ApiCreatedResponse({ type: LocationUserResponseDto })
  @ApiNotFoundResponse({ description: 'Location not found' })
  async assignUserToLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUserLocationDto,
  ): Promise<LocationUserResponseDto> {
    return this.locationsService.assignUserToLocation(id, dto);
  }

  @Delete('locations/:id/users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability) => ability.can('update', 'Location'))
  @ApiOperation({ summary: 'Remove a user from a location' })
  @ApiNotFoundResponse({ description: 'Assignment not found' })
  async removeUserFromLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.locationsService.removeUserFromLocation(id, userId);
  }

  @Get('locations/:id/users')
  @CheckPolicies((ability) => ability.can('read', 'Location'))
  @ApiOperation({ summary: 'List users assigned to a location' })
  @ApiOkResponse({ type: [LocationUserResponseDto] })
  @ApiNotFoundResponse({ description: 'Location not found' })
  async findLocationUsers(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LocationUserResponseDto[]> {
    return this.locationsService.findLocationUsers(id);
  }

  // ========================================================================
  // Location Dashboard
  // ========================================================================

  @Get('locations/:id/dashboard')
  @CheckPolicies((ability) => ability.can('read', 'Location'))
  @ApiOperation({ summary: 'Get location dashboard summary' })
  @ApiOkResponse({ type: LocationDashboardResponseDto })
  @ApiNotFoundResponse({ description: 'Location not found' })
  async getLocationDashboard(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LocationDashboardResponseDto> {
    return this.locationsService.getLocationDashboard(id);
  }

  // ========================================================================
  // Transfers
  // ========================================================================

  @Post('stock/transfers')
  @CheckPolicies((ability) => ability.can('create', 'StockTransfer'))
  @ApiOperation({ summary: 'Create a stock transfer between locations' })
  @ApiCreatedResponse({ type: TransferResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async createTransfer(
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TransferResponseDto> {
    return this.locationsService.createTransfer(dto, user.userId);
  }

  @Get('stock/transfers')
  @CheckPolicies((ability) => ability.can('read', 'StockTransfer'))
  @ApiOperation({ summary: 'List stock transfers' })
  @ApiOkResponse({ description: 'Paginated list of transfers' })
  async findTransfers(
    @Query() query: TransferQueryDto,
  ): Promise<PaginatedDto<TransferResponseDto>> {
    return this.locationsService.findTransfers(query);
  }

  @Get('stock/transfers/:id')
  @CheckPolicies((ability) => ability.can('read', 'StockTransfer'))
  @ApiOperation({ summary: 'Get transfer by ID' })
  @ApiOkResponse({ type: TransferResponseDto })
  @ApiNotFoundResponse({ description: 'Transfer not found' })
  async findTransferById(@Param('id', ParseUUIDPipe) id: string): Promise<TransferResponseDto> {
    return this.locationsService.findTransferById(id);
  }

  @Get('stock/transfers/:id/aviz')
  @CheckPolicies((ability) => ability.can('read', 'StockTransfer'))
  @ApiOperation({
    summary: 'Aviz de însoțire a mărfii for a transfer',
    description:
      'Returns the printable aviz payload (serie+număr assigned lazily on first call, ' +
      'supplier/buyer legal identity from the organization, goods with prices where known).',
  })
  @ApiNotFoundResponse({ description: 'Transfer not found' })
  async getTransferAviz(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.getTransferAviz(id);
  }

  @Get('stock/transfers/:id/conformity')
  @CheckPolicies((ability) => ability.can('read', 'StockTransfer'))
  @ApiOperation({
    summary: 'Declaratie de conformitate for a transfer',
    description:
      'Printable conformity declaration payload (serie CB persisted on first call; ' +
      'org legal identity from the organization settings).',
  })
  @ApiNotFoundResponse({ description: 'Transfer not found' })
  async getTransferConformity(@Param('id', ParseUUIDPipe) id: string) {
    return this.locationsService.getTransferConformity(id);
  }

  @Patch('stock/transfers/:id/aviz/sign')
  @CheckPolicies((ability) => ability.can('update', 'StockTransfer'))
  @UseInterceptors(FileInterceptor('signature'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sign the aviz on delivery (semnatura de primire)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        signature: { type: 'string', format: 'binary' },
        receiverName: { type: 'string' },
      },
      required: ['signature', 'receiverName'],
    },
  })
  @ApiOkResponse({ type: TransferResponseDto })
  @ApiNotFoundResponse({ description: 'Transfer not found' })
  async signTransferAviz(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() dto: SignTransferAvizDto,
  ): Promise<TransferResponseDto> {
    return this.locationsService.signTransferAviz(
      id,
      dto,
      file ? new Uint8Array(file.buffer) : undefined,
    );
  }

  @Get('stock/transfers/:id/aviz/signature')
  @CheckPolicies((ability) => ability.can('read', 'StockTransfer'))
  @ApiOperation({ summary: 'Get the aviz receipt signature image as PNG' })
  @ApiOkResponse({ description: 'Signature PNG image' })
  @ApiNotFoundResponse({ description: 'Signature not found' })
  async getTransferSignatureImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const image = await this.locationsService.getTransferSignatureImage(id);
    res.set({ 'Content-Type': 'image/png', 'Content-Length': image.length });
    res.send(image);
  }

  @Patch('stock/transfers/:id')
  @CheckPolicies((ability) => ability.can('update', 'StockTransfer'))
  @ApiOperation({ summary: 'Update transfer status (complete, cancel, mark in transit)' })
  @ApiOkResponse({ type: TransferResponseDto })
  @ApiNotFoundResponse({ description: 'Transfer not found' })
  async updateTransferStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransferStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TransferResponseDto> {
    return this.locationsService.updateTransferStatus(id, dto, user.userId);
  }

  @Patch('stock/transfers/:id/approval')
  @CheckPolicies((ability) => ability.can('update', 'StockTransfer'))
  @ApiOperation({ summary: 'Approve or reject a transfer' })
  @ApiOkResponse({ type: TransferResponseDto })
  @ApiNotFoundResponse({ description: 'Transfer not found' })
  async updateTransferApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransferApprovalDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<TransferResponseDto> {
    return this.locationsService.updateTransferApproval(id, dto, user.userId);
  }
}
