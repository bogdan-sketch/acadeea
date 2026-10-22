import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { ParseUUIDPipe } from '@/common/pipes';
import { UnitConversionsService } from './unit-conversions.service';
import { CreateUnitConversionDto } from './dto';

@ApiTags('unit-conversions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/unit-conversions')
export class UnitConversionsController {
  constructor(private readonly unitConversionsService: UnitConversionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List unit conversions',
    description:
      'Returns all unit conversions. Optionally filter by rawMaterialId to ' +
      'include both material-specific and universal conversions.',
  })
  @ApiQuery({
    name: 'rawMaterialId',
    required: false,
    type: String,
    description: 'Filter by raw material (includes universal conversions too)',
  })
  @ApiOkResponse({ description: 'List of unit conversions' })
  @CheckPolicies((ability) => ability.can('read', 'RawMaterial'))
  async findAll(@Query('rawMaterialId') rawMaterialId?: string) {
    return this.unitConversionsService.findAll(rawMaterialId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a unit conversion',
    description:
      'Creates a new conversion factor between two units. ' +
      'Optionally scoped to a specific raw material for density-based conversions.',
  })
  @ApiCreatedResponse({ description: 'Conversion created successfully' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async create(@Body() dto: CreateUnitConversionDto) {
    return this.unitConversionsService.create(dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a unit conversion',
    description: 'Removes a conversion factor by its ID.',
  })
  @ApiOkResponse({ description: 'Conversion deleted successfully' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.unitConversionsService.remove(id);
  }
}
