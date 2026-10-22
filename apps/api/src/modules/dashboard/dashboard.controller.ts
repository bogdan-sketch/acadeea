import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { DashboardStatsResponseDto } from './dto';

@ApiTags('dashboard')
@Controller('api/v1/dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get consolidated dashboard statistics' })
  @ApiQuery({ name: 'locationId', required: false, description: 'Filter stats by location' })
  @ApiOkResponse({ type: DashboardStatsResponseDto })
  async getStats(@Query('locationId') locationId?: string): Promise<DashboardStatsResponseDto> {
    return this.dashboardService.getStats(locationId);
  }
}
