import {
  Body,
  Controller,
  Delete,
  Get,
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
  CreateRawMaterialDto,
  UpdateRawMaterialDto,
  RawMaterialResponseDto,
  RawMaterialQueryDto,
} from './dto';
import { RawMaterialsService } from './raw-materials.service';

@ApiTags('raw-materials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/raw-materials')
export class RawMaterialsController {
  constructor(private readonly rawMaterialsService: RawMaterialsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'RawMaterial'))
  @ApiOperation({
    summary: 'List all raw materials',
    description: 'Returns a paginated list of raw materials with optional search and filters.',
  })
  @ApiOkResponse({ description: 'Paginated list of raw materials' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findAll(
    @Query() query: RawMaterialQueryDto,
  ): Promise<PaginatedDto<RawMaterialResponseDto>> {
    return this.rawMaterialsService.findAll(query);
  }

  @Get(':id/price-history')
  @CheckPolicies((ability) => ability.can('read', 'RawMaterial'))
  @ApiOperation({
    summary: 'Get price history for a raw material',
    description: 'Returns the purchase price change history for a raw material, newest first.',
  })
  @ApiOkResponse({ description: 'Price history list' })
  @ApiNotFoundResponse({ description: 'Raw material not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async getPriceHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.rawMaterialsService.getPriceHistory(id);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'RawMaterial'))
  @ApiOperation({
    summary: 'Get raw material by ID',
    description: 'Returns a single raw material by its UUID.',
  })
  @ApiOkResponse({ description: 'Raw material found', type: RawMaterialResponseDto })
  @ApiNotFoundResponse({ description: 'Raw material not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<RawMaterialResponseDto> {
    return this.rawMaterialsService.findById(id);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'RawMaterial'))
  @ApiOperation({
    summary: 'Create a new raw material',
    description: 'Creates a new raw material entry in the inventory.',
  })
  @ApiCreatedResponse({
    description: 'Raw material created successfully',
    type: RawMaterialResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async create(@Body() dto: CreateRawMaterialDto): Promise<RawMaterialResponseDto> {
    return this.rawMaterialsService.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', 'RawMaterial'))
  @ApiOperation({
    summary: 'Update a raw material',
    description: 'Partially updates a raw material. Only provided fields are changed.',
  })
  @ApiOkResponse({ description: 'Raw material updated successfully', type: RawMaterialResponseDto })
  @ApiNotFoundResponse({ description: 'Raw material not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRawMaterialDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RawMaterialResponseDto> {
    return this.rawMaterialsService.update(id, dto, user.userId);
  }

  @Get(':id/delete-info')
  @CheckPolicies((ability) => ability.can('delete', 'RawMaterial'))
  @ApiOperation({
    summary: 'Pre-delete check for a raw material',
    description:
      'Returns whether the material can be hard-deleted (stock 0 and no transfer in flight), ' +
      'whether it was ever used (recipes / production / transfer history) and how many live ' +
      'transfers carry it, so clients can build the confirm dialog.',
  })
  @ApiNotFoundResponse({ description: 'Raw material not found' })
  async deleteInfo(@Param('id', ParseUUIDPipe) id: string): Promise<{
    currentStock: number;
    canDelete: boolean;
    everUsed: boolean;
    activeTransfers: number;
  }> {
    return this.rawMaterialsService.deleteInfo(id);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', 'RawMaterial'))
  @ApiOperation({
    summary: 'Discontinue or permanently delete a raw material',
    description:
      'Default: soft-deletes by setting status to DISCONTINUED. With ?hard=true it deletes ' +
      'the material permanently — only allowed when stock is 0; removes all its history ' +
      '(movements, lots, traceability, recipe ingredient rows, price history).',
  })
  @ApiOkResponse({
    description: 'Raw material discontinued/deleted successfully',
  })
  @ApiNotFoundResponse({ description: 'Raw material not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('hard') hard?: string,
  ): Promise<RawMaterialResponseDto | { deleted: true }> {
    if (hard === 'true') {
      await this.rawMaterialsService.hardDelete(id);
      return { deleted: true };
    }
    return this.rawMaterialsService.remove(id);
  }
}
