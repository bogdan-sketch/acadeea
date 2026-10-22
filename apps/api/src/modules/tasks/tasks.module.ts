import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { WebsocketModule } from '@/modules/websocket';
import { StockModule } from '@/modules/stock';
import { NotificationsModule } from '@/modules/notifications';
import { RecipesModule } from '@/modules/recipes';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    PrismaModule,
    CaslModule,
    WebsocketModule,
    StockModule,
    NotificationsModule,
    RecipesModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
