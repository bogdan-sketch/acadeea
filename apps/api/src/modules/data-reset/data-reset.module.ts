import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { BackupsModule } from '@/modules/backups/backups.module';
import { DataResetController } from './data-reset.controller';
import { DataResetService } from './data-reset.service';

/**
 * Resetare date — selective per-org wipe (production, stock, transfers,
 * orders, sales, notifications; recipes / raw materials opt-in). Takes an
 * org snapshot first (BackupsModule) so the wipe is reversible.
 */
@Module({
  imports: [PrismaModule, CaslModule, BackupsModule],
  controllers: [DataResetController],
  providers: [DataResetService],
})
export class DataResetModule {}
