import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { BackupService } from './backup.service';
import { BackupController } from './backup.controller';

@Module({
  imports: [PrismaModule, CaslModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
