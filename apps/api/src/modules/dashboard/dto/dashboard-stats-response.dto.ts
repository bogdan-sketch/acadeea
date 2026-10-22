import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class LowStockMaterialDto {
  @ApiProperty()
  id: string;

  /** Legacy alias of `title` — the service emits both (older clients read `name`). */
  @ApiProperty({ description: 'Material title (legacy alias of title)' })
  name: string;

  @ApiProperty({ description: 'Material title' })
  title: string;

  @ApiProperty({ enum: ['LOW_STOCK', 'OUT_OF_STOCK'] })
  status: string;

  @ApiProperty()
  currentStock: number;

  @ApiProperty()
  minimumStock: number;

  @ApiProperty({ description: 'Stock unit (UnitType) for currentStock/minimumStock' })
  unit: string;
}

class RecentTaskDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  recipeName: string;

  @ApiProperty({ description: 'Custom task name when set, else the recipe name' })
  displayName: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  targetQuantity: number;

  @ApiProperty()
  targetUnit: string;

  @ApiPropertyOptional()
  assignedToName?: string;

  @ApiProperty()
  createdAt: Date;
}

export class DashboardStatsResponseDto {
  @ApiProperty({ description: 'Task counts by status', example: { DE_FACUT: 5, IN_LUCRU: 2 } })
  taskCounts: Record<string, number>;

  @ApiProperty({
    description: 'Order counts by status',
    example: { NOUA: 3, IN_PREGATIRE: 1 },
  })
  orderCounts: Record<string, number>;

  @ApiProperty({ description: 'Materials with low or zero stock', type: [LowStockMaterialDto] })
  lowStockMaterials: LowStockMaterialDto[];

  @ApiProperty({ description: 'Recent tasks (last 5)', type: [RecentTaskDto] })
  recentTasks: RecentTaskDto[];

  @ApiProperty({ description: 'Tasks due today' })
  todayTasksDue: number;

  @ApiProperty({ description: 'Orders due today' })
  todayOrdersDue: number;

  @ApiProperty({ description: 'Total sales amount for today (RON)' })
  todaySalesAmount: number;

  @ApiProperty({ description: 'Number of delivery orders due today' })
  todayDeliveries: number;

  @ApiProperty({ description: 'Number of pickup orders due today' })
  todayPickups: number;

  @ApiProperty({
    description:
      'Total materials with LOW_STOCK (uncapped — lowStockMaterials is truncated to 10 for display)',
  })
  lowStockCount: number;

  @ApiProperty({ description: 'Total materials with OUT_OF_STOCK (uncapped)' })
  outOfStockCount: number;
}
