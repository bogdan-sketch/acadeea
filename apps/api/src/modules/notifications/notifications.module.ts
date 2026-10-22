import { Module } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushSender } from './push-sender.service';
import { ExpiryNotificationJob } from './expiry-notification.job';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushSender, ExpiryNotificationJob],
  exports: [NotificationsService],
})
export class NotificationsModule {}
