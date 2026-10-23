import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { WebsocketModule } from '@/modules/websocket';
import { RecipesModule } from '@/modules/recipes';
import { UnitConversionsModule } from '@/modules/unit-conversions';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { StockReservationService } from './services/stock-reservation.service';
import { RequirementsPlanService } from './services/requirements-plan.service';
import { StockImportExportService } from './services/stock-import-export.service';
import { StockTraceabilityService } from './services/stock-traceability.service';
import { StockReviewService } from './services/stock-review.service';

@Module({
  imports: [PrismaModule, CaslModule, WebsocketModule, RecipesModule, UnitConversionsModule],
  controllers: [StockController],
  providers: [
    StockService,
    StockReservationService,
    RequirementsPlanService,
    StockImportExportService,
    StockReviewService,
    StockTraceabilityService,
  ],
  exports: [StockService, StockReservationService, RequirementsPlanService],
})
export class StockModule {}
