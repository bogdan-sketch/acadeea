import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';
import { BackupsJob } from './backups.job';

/**
 * Org snapshots — per-tenant logical backups ("Salvează starea"):
 * gzipped JSON dumps of every org-scoped table, nightly auto snapshots with
 * retention, manual create/restore/download/delete. Not to be confused with
 * modules/backup (platform-level pg_dump of the whole database).
 */
@Module({
  imports: [PrismaModule, CaslModule],
  controllers: [BackupsController],
  providers: [BackupsService, BackupsJob],
  exports: [BackupsService],
})
export class BackupsModule {}
