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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { ParseUUIDPipe } from '@/common/pipes';
import {
  CreateEquipmentDto,
  UpdateEquipmentDto,
  EquipmentResponseDto,
  EquipmentQueryDto,
  CreateMaintenanceLogDto,
  MaintenanceLogResponseDto,
} from './dto';
import { EquipmentService } from './equipment.service';

@ApiTags('Equipment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/equipment')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  // ========================================================================
  // Equipment CRUD
  // ========================================================================

  @Get()
  @CheckPolicies((ability) => ability.can('read', 'Location'))
  @ApiOperation({ summary: 'List all equipment' })
  @ApiOkResponse({ type: [EquipmentResponseDto] })
  async findAll(@Query() query: EquipmentQueryDto): Promise<EquipmentResponseDto[]> {
    return this.equipmentService.findAll(query);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('read', 'Location'))
  @ApiOperation({ summary: 'Get equipment by ID' })
  @ApiOkResponse({ type: EquipmentResponseDto })
  @ApiNotFoundResponse({ description: 'Equipment not found' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<EquipmentResponseDto> {
    return this.equipmentService.findById(id);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('create', 'Location'))
  @ApiOperation({ summary: 'Create new equipment' })
  @ApiCreatedResponse({ type: EquipmentResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async create(@Body() dto: CreateEquipmentDto): Promise<EquipmentResponseDto> {
    return this.equipmentService.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('update', 'Location'))
  @ApiOperation({ summary: 'Update equipment' })
  @ApiOkResponse({ type: EquipmentResponseDto })
  @ApiNotFoundResponse({ description: 'Equipment not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEquipmentDto,
  ): Promise<EquipmentResponseDto> {
    return this.equipmentService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @CheckPolicies((ability) => ability.can('delete', 'Location'))
  @ApiOperation({ summary: 'Delete equipment' })
  @ApiNoContentResponse({ description: 'Equipment deleted' })
  @ApiNotFoundResponse({ description: 'Equipment not found' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.equipmentService.delete(id);
  }

  // ========================================================================
  // Availability
  // ========================================================================

  @Get(':id/availability')
  @CheckPolicies((ability) => ability.can('read', 'Location'))
  @ApiOperation({ summary: 'Get equipment availability for next 30 days' })
  @ApiOkResponse({ type: EquipmentResponseDto })
  @ApiNotFoundResponse({ description: 'Equipment not found' })
  async getAvailability(@Param('id', ParseUUIDPipe) id: string): Promise<EquipmentResponseDto> {
    return this.equipmentService.getAvailability(id);
  }

  // ========================================================================
  // Maintenance Logs
  // ========================================================================

  @Get(':id/maintenance')
  @CheckPolicies((ability) => ability.can('read', 'Location'))
  @ApiOperation({ summary: 'List maintenance logs for equipment' })
  @ApiOkResponse({ type: [MaintenanceLogResponseDto] })
  @ApiNotFoundResponse({ description: 'Equipment not found' })
  async findMaintenanceLogs(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MaintenanceLogResponseDto[]> {
    return this.equipmentService.findMaintenanceLogs(id);
  }

  @Post(':id/maintenance')
  @CheckPolicies((ability) => ability.can('create', 'Location'))
  @ApiOperation({ summary: 'Add maintenance log entry' })
  @ApiCreatedResponse({ type: MaintenanceLogResponseDto })
  @ApiNotFoundResponse({ description: 'Equipment not found' })
  async addMaintenanceLog(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMaintenanceLogDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<MaintenanceLogResponseDto> {
    return this.equipmentService.addMaintenanceLog(id, dto, user.userId);
  }
}
