import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PoliciesGuard, CheckPolicies } from '@/modules/auth/casl';
import { CurrentUser, JwtPayload } from '@/modules/auth/decorators/current-user.decorator';
import { ParseUUIDPipe } from '@/common/pipes';
import { PricingService } from './pricing.service';
import {
  RecipeMarginResponseDto,
  PriceHistoryResponseDto,
  SetSellingPriceDto,
  SetManualCostDto,
} from './dto';

@ApiTags('pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller('api/v1')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('recipes/:id/margin')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'Get recipe margin' })
  @ApiOkResponse({ description: 'Recipe margin data' })
  async getRecipeMargin(@Param('id', ParseUUIDPipe) id: string): Promise<RecipeMarginResponseDto> {
    return this.pricingService.getRecipeMargin(id);
  }

  @Patch('recipes/:id/selling-price')
  @CheckPolicies((ability) => ability.can('update', 'Recipe'))
  @ApiOperation({ summary: 'Set recipe selling price' })
  @ApiOkResponse({ description: 'Updated recipe margin' })
  async setSellingPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSellingPriceDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RecipeMarginResponseDto> {
    return this.pricingService.setSellingPrice(id, dto.sellingPrice, user.userId);
  }

  @Patch('recipes/:id/manual-cost')
  @CheckPolicies((ability) => ability.can('update', 'Recipe'))
  @ApiOperation({ summary: 'Set or clear (null) the manual cost override' })
  @ApiOkResponse({ description: 'Updated recipe margin' })
  async setManualCost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetManualCostDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RecipeMarginResponseDto> {
    return this.pricingService.setManualCost(id, dto.manualCost ?? null, user.userId);
  }

  @Get('pricing/history')
  @CheckPolicies((ability) => ability.can('read', 'Recipe'))
  @ApiOperation({ summary: 'Get price change history' })
  @ApiOkResponse({ description: 'Price history records' })
  async getPriceHistory(
    @Query('rawMaterialId') rawMaterialId?: string,
    @Query('consumableId') consumableId?: string,
    @Query('recipeId') recipeId?: string,
  ): Promise<PriceHistoryResponseDto[]> {
    return this.pricingService.getPriceHistory({ rawMaterialId, consumableId, recipeId });
  }

  @Get('orders/:id/revenue')
  @CheckPolicies((ability) => ability.can('read', 'Order'))
  @ApiOperation({ summary: 'Get order revenue' })
  @ApiOkResponse({ description: 'Order revenue total' })
  async getOrderRevenue(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ orderId: string; totalRevenue: number | null }> {
    return this.pricingService.getOrderRevenue(id);
  }
}
