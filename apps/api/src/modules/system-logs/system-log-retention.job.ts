import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '@/prisma/prisma.service';
import { runWithoutTenant } from '@/prisma/tenant-context';
import { SystemLogsService } from './system-logs.service';

/** Daily purge of SystemLog rows older than SYSTEM_LOG_RETENTION_DAYS (default 90). */
@Injectable()
export class SystemLogRetentionJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logs: SystemLogsService,
  ) {}

  @Cron('30 3 * * *', { timeZone: 'Europe/Bucharest' })
  async purge(): Promise<void> {
    const days = Number(this.config.get('SYSTEM_LOG_RETENTION_DAYS', 90)) || 90;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    await this.logs
      .trackJob(
        'job.system-log-retention',
        () =>
          runWithoutTenant(() =>
            this.prisma.systemLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
          ),
        (r) => `${r.count} intrări mai vechi de ${days} zile șterse`,
      )
      .catch(() => undefined);
  }
}
