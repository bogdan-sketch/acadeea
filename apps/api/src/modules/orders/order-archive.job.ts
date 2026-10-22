import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '@/prisma/prisma.service';
import { runAsOrg, runWithoutTenant } from '@/prisma/tenant-context';
import { SystemLogsService } from '@/modules/system-logs/system-logs.service';
import { OrdersService } from './orders.service';

/** Days after delivery/cancellation before an order is auto-archived. */
const AUTO_ARCHIVE_AFTER_DAYS = 60;

/**
 * Nightly auto-archive: every LIVRATA/ANULATA order closed more than 60 days
 * ago is moved to the archive so active listings never grow unbounded.
 * Multi-tenant: lists active organizations with `runWithoutTenant`, then runs
 * each org's bulk archive inside `runAsOrg(org.id, …)` — same pattern as
 * WooPollJob / ExpiryNotificationJob.
 */
@Injectable()
export class OrderArchiveJob {
  private readonly logger = new Logger(OrderArchiveJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly logs: SystemLogsService,
  ) {}

  @Cron('30 3 * * *')
  async run(): Promise<void> {
    const orgs = await runWithoutTenant(async () =>
      this.prisma.organization.findMany({
        where: { isActive: true },
        select: { id: true, slug: true },
      }),
    );

    for (const org of orgs) {
      try {
        const { archived } = await this.logs.trackJob(
          'job.order-archive',
          () => runAsOrg(org.id, () => this.orders.archiveCompleted(AUTO_ARCHIVE_AFTER_DAYS)),
          (r) => `${r.archived} comenzi închise arhivate automat`,
          org.id,
        );
        if (archived > 0) {
          this.logger.log(`Auto-archived ${archived} closed orders for org ${org.slug}`);
        }
      } catch (error) {
        // One org's failure must not abort the others.
        this.logger.warn(
          `Order auto-archive failed for org ${org.slug}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }
}
