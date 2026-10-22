import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { WebsocketModule } from '@/modules/websocket';
import { NotificationsModule } from '@/modules/notifications';
import { SalesDeductionsController } from './sales-deductions.controller';
import { SalesDeductionsService } from './sales-deductions.service';

@Module({
  imports: [PrismaModule, CaslModule, WebsocketModule, NotificationsModule],
  controllers: [SalesDeductionsController],
  providers: [SalesDeductionsService],
  exports: [SalesDeductionsService],
})
export class SalesDeductionsModule {}
