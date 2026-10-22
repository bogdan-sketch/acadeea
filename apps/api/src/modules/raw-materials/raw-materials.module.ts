import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { WebsocketModule } from '@/modules/websocket';
import { RawMaterialsController } from './raw-materials.controller';
import { RawMaterialsService } from './raw-materials.service';

@Module({
  imports: [PrismaModule, CaslModule, WebsocketModule],
  controllers: [RawMaterialsController],
  providers: [RawMaterialsService],
  exports: [RawMaterialsService],
})
export class RawMaterialsModule {}
