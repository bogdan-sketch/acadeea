import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { PrismaModule } from '@/prisma/prisma.module';
import { CaslModule } from '@/modules/auth/casl';
import { RequestLogMiddleware } from './request-log.middleware';
import { SystemLogRetentionJob } from './system-log-retention.job';
import { SystemLogsController } from './system-logs.controller';
import { SystemLogsService } from './system-logs.service';

/**
 * "Jurnal sistem": durable activity/ops log. Global so any module (email,
 * jobs, integrations) can inject SystemLogsService without re-importing.
 */
@Global()
@Module({
  imports: [PrismaModule, CaslModule],
  controllers: [SystemLogsController],
  providers: [SystemLogsService, SystemLogRetentionJob, RequestLogMiddleware],
  exports: [SystemLogsService],
})
export class SystemLogsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLogMiddleware).forRoutes('*');
  }
}
