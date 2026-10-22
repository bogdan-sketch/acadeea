import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from './platform-admin.guard';
import { OrganizationsAdminService } from './organizations-admin.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

/**
 * Platform-operator endpoints (PLATFORM_ADMIN_EMAILS env) — provisioning and
 * listing tenant organizations. Not exposed in any client UI.
 */
@ApiTags('organizations-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@Controller('api/v1/organizations')
export class OrganizationsAdminController {
  constructor(private readonly service: OrganizationsAdminService) {}

  @Get()
  @ApiOperation({ summary: 'List all organizations (platform admin only)' })
  async list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({
    summary:
      'Provision a new organization: clones the standard role set, seeds defaults, and emails the first admin an invitation (platform admin only)',
  })
  async create(@Body() dto: CreateOrganizationDto) {
    return this.service.create(dto);
  }
}
