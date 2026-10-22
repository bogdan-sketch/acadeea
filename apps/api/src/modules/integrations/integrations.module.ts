import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { IntegrationsController, IntegrationsWebhookController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { WooPollJob } from './woo-poll.job';
import { SalesDeductionsModule } from '@/modules/sales-deductions/sales-deductions.module';

@Module({
  imports: [PrismaModule, CaslModule, SalesDeductionsModule],
  controllers: [IntegrationsController, IntegrationsWebhookController],
  providers: [IntegrationsService, WooPollJob],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
