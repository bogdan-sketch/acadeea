import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================================================
// Nested helper DTOs
// ============================================================================

export class ConsumedMaterialDto {
  @ApiProperty() name: string;
  @ApiProperty() totalConsumed: number;
  @ApiProperty() unit: string;

  constructor(partial: Partial<ConsumedMaterialDto>) {
    Object.assign(this, partial);
  }
}

export class PopularProductDto {
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;

  constructor(partial: Partial<PopularProductDto>) {
    Object.assign(this, partial);
  }
}

// ============================================================================
// Response DTOs
// ============================================================================

export class ProductionAnalyticsDto {
  @ApiProperty() period: { from: string; to: string };
  @ApiProperty() totalTasksCompleted: number;
  @ApiProperty() totalTasksCancelled: number;
  @ApiPropertyOptional() averageCompletionHours: number | null;
  @ApiPropertyOptional() yieldVarianceAvg: number | null;

  constructor(partial: Partial<ProductionAnalyticsDto>) {
    Object.assign(this, partial);
  }
}

export class StockAnalyticsDto {
  @ApiProperty({ type: [ConsumedMaterialDto] })
  topConsumedMaterials: ConsumedMaterialDto[];

  @ApiProperty() lowStockCount: number;
  @ApiProperty() totalMovements: number;

  constructor(partial: Partial<StockAnalyticsDto>) {
    Object.assign(this, partial);
  }
}

export class OrderAnalyticsDto {
  @ApiProperty() totalOrders: number;
  @ApiProperty() ordersByStatus: Record<string, number>;
  @ApiPropertyOptional() onTimeRate: number | null;
  @ApiProperty({ type: [PopularProductDto] })
  popularProducts: PopularProductDto[];

  constructor(partial: Partial<OrderAnalyticsDto>) {
    Object.assign(this, partial);
  }
}

export class UserProductivityDto {
  @ApiProperty() userId: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() tasksCompleted: number;
  @ApiPropertyOptional() avgCompletionHours: number | null;

  constructor(partial: Partial<UserProductivityDto>) {
    Object.assign(this, partial);
  }
}

export class AnalyticsSummaryDto {
  @ApiProperty() tasksCompletedToday: number;
  @ApiProperty() ordersToday: number;
  @ApiProperty() lowStockItems: number;
  @ApiProperty() activeUsers: number;

  constructor(partial: Partial<AnalyticsSummaryDto>) {
    Object.assign(this, partial);
  }
}
