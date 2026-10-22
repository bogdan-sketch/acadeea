import { Logger, Module, OnModuleInit } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { runWithoutTenant } from '@/prisma/tenant-context';
import { CaslModule } from '@/modules/auth/casl';
import { UnitConversionsController } from './unit-conversions.controller';
import { UnitConversionsService } from './unit-conversions.service';

@Module({
  imports: [PrismaModule, CaslModule],
  controllers: [UnitConversionsController],
  providers: [UnitConversionsService],
  exports: [UnitConversionsService],
})
export class UnitConversionsModule implements OnModuleInit {
  private readonly logger = new Logger(UnitConversionsModule.name);

  constructor(private readonly unitConversionsService: UnitConversionsService) {}

  async onModuleInit() {
    try {
      // Startup job iterating every organization — explicit tenant bypass.
      await runWithoutTenant(() => this.unitConversionsService.seedStandardConversions());
    } catch (error) {
      this.logger.error('Failed to seed standard unit conversions', error);
    }
  }
}
