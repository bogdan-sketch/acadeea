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
  Put,
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
import { ParseUUIDPipe } from '@/common/pipes';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto, SetPermissionsDto, RoleResponseDto } from './dto';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('manage', 'Role'))
  @ApiOperation({ summary: 'List all roles with permissions' })
  @ApiOkResponse({ type: [RoleResponseDto] })
  async findAll(): Promise<RoleResponseDto[]> {
    return this.rolesService.findAll();
  }

  @Get('subjects')
  @CheckPolicies((ability) => ability.can('manage', 'Role'))
  @ApiOperation({ summary: 'Get available subjects and actions for permission grid' })
  @ApiOkResponse()
  getSubjects() {
    return this.rolesService.getSubjects();
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can('manage', 'Role'))
  @ApiOperation({ summary: 'Get role by ID' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse()
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<RoleResponseDto> {
    return this.rolesService.findById(id);
  }

  @Post()
  @CheckPolicies((ability) => ability.can('manage', 'Role'))
  @ApiOperation({ summary: 'Create a new role' })
  @ApiCreatedResponse({ type: RoleResponseDto })
  @ApiForbiddenResponse()
  async create(@Body() dto: CreateRoleDto): Promise<RoleResponseDto> {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can('manage', 'Role'))
  @ApiOperation({ summary: 'Update role name/description' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can('manage', 'Role'))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a role (fails if system role or has users)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.rolesService.remove(id);
  }

  @Put(':id/permissions')
  @CheckPolicies((ability) => ability.can('manage', 'Role'))
  @ApiOperation({ summary: 'Replace permissions for a role' })
  @ApiOkResponse({ type: RoleResponseDto })
  @ApiNotFoundResponse()
  async setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPermissionsDto,
  ): Promise<RoleResponseDto> {
    return this.rolesService.setPermissions(id, dto);
  }
}
