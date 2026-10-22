import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({
  imports: [PrismaModule, CaslModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
