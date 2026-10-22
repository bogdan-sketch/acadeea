import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { StockModule } from '@/modules/stock/stock.module';
import { SalesDeductionsModule } from '@/modules/sales-deductions/sales-deductions.module';
import { TasksModule } from '@/modules/tasks/tasks.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { LocationsModule } from '@/modules/locations/locations.module';
import { RawMaterialsModule } from '@/modules/raw-materials/raw-materials.module';
import { ConsumablesModule } from '@/modules/consumables/consumables.module';
import { RecipesModule } from '@/modules/recipes/recipes.module';
import { BulkActionsController } from './bulk-actions.controller';
import { BulkDeleteService } from './bulk-delete.service';
import { BulkActionService } from './bulk-action.service';

/**
 * "Selectează" — one place for every list screen's multi-select operations:
 * delete (preview + cascade) and the other bulk actions (status, assign, …).
 */
@Module({
  imports: [
    PrismaModule,
    CaslModule,
    StockModule,
    SalesDeductionsModule,
    TasksModule,
    OrdersModule,
    LocationsModule,
    RawMaterialsModule,
    ConsumablesModule,
    RecipesModule,
  ],
  controllers: [BulkActionsController],
  providers: [BulkDeleteService, BulkActionService],
})
export class BulkActionsModule {}
