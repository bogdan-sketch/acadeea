import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { AnalyticsService } from './analytics.service';
import {
  ProductionAnalyticsDto,
  StockAnalyticsDto,
  OrderAnalyticsDto,
  UserProductivityDto,
  AnalyticsSummaryDto,
} from './dto';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('production')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'Get production analytics' })
  @ApiOkResponse({ type: ProductionAnalyticsDto })
  async getProductionAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ProductionAnalyticsDto> {
    return this.analyticsService.getProductionAnalytics(from, to);
  }

  @Get('stock')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'Get stock consumption analytics' })
  @ApiOkResponse({ type: StockAnalyticsDto })
  async getStockAnalytics(): Promise<StockAnalyticsDto> {
    return this.analyticsService.getStockAnalytics();
  }

  @Get('orders')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'Get order analytics' })
  @ApiOkResponse({ type: OrderAnalyticsDto })
  async getOrderAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<OrderAnalyticsDto> {
    return this.analyticsService.getOrderAnalytics(from, to);
  }

  @Get('users')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'Get user productivity analytics' })
  @ApiOkResponse({ type: [UserProductivityDto] })
  async getUserProductivity(): Promise<UserProductivityDto[]> {
    return this.analyticsService.getUserProductivity();
  }

  @Get('summary')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'Get high-level analytics summary' })
  @ApiOkResponse({ type: AnalyticsSummaryDto })
  async getSummary(): Promise<AnalyticsSummaryDto> {
    return this.analyticsService.getSummary();
  }
}
