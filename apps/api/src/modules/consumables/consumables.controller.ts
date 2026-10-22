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
import { ParseUUIDPipe } from '@/common/pipes';
import { PaginatedDto } from '@/common/dto';
import {
  ConsumableQueryDto,
  ConsumableResponseDto,
  CreateConsumableDto,
  UpdateConsumableDto,
} from './dto';
import { ConsumablesService } from './consumables.service';

@ApiTags('consumables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/consumables')
export class ConsumablesController {
  constructor(private readonly consumablesService: ConsumablesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'Consumable'))
  @ApiOperation({
    summary: 'List all consumables',
    description: 'Returns a paginated, searchable, and filterable list of consumables.',
  })
  @ApiOkResponse({ description: 'Paginated list of consumables' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findAll(@Query() query: ConsumableQueryDto): Promise<PaginatedDto<ConsumableResponseDto>> {
    return this.consumablesService.findAll(query);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'Consumable'))
  @ApiOperation({
    summary: 'Get consumable by ID',
    description: 'Returns a single consumable by its UUID.',
  })
  @ApiOkResponse({ description: 'Consumable found', type: ConsumableResponseDto })
  @ApiNotFoundResponse({ description: 'Consumable not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<ConsumableResponseDto> {
    return this.consumablesService.findById(id);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'Consumable'))
  @ApiOperation({
    summary: 'Create a new consumable',
    description: 'Creates a new consumable item in inventory.',
  })
  @ApiCreatedResponse({
    description: 'Consumable created successfully',
    type: ConsumableResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async create(@Body() dto: CreateConsumableDto): Promise<ConsumableResponseDto> {
    return this.consumablesService.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', 'Consumable'))
  @ApiOperation({
    summary: 'Update a consumable',
    description: 'Partially updates a consumable. Only provided fields are changed.',
  })
  @ApiOkResponse({ description: 'Consumable updated successfully', type: ConsumableResponseDto })
  @ApiNotFoundResponse({ description: 'Consumable not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConsumableDto,
  ): Promise<ConsumableResponseDto> {
    return this.consumablesService.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('delete', 'Consumable'))
  @ApiOperation({
    summary: 'Discontinue a consumable',
    description: 'Soft-deletes the consumable by setting its status to DISCONTINUED.',
  })
  @ApiOkResponse({
    description: 'Consumable discontinued successfully',
    type: ConsumableResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Consumable not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<ConsumableResponseDto> {
    return this.consumablesService.remove(id);
  }
}
