import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { WebsocketModule } from '@/modules/websocket';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CertificatePdfService } from './certificate-pdf.service';
import { OrderArchiveJob } from './order-archive.job';

@Module({
  imports: [PrismaModule, CaslModule, WebsocketModule],
  controllers: [OrdersController],
  providers: [OrdersService, CertificatePdfService, OrderArchiveJob],
  exports: [OrdersService],
})
export class OrdersModule {}
