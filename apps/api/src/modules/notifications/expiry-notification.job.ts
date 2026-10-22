import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '@/prisma/prisma.service';
import { getCurrentTenantId, runAsOrg, runWithoutTenant } from '@/prisma/tenant-context';
import { SystemLogsService } from '@/modules/system-logs/system-logs.service';
import { NotificationsService } from './notifications.service';

/** Fallback lead time (days) for materials with no per-material lead configured. */
const DEFAULT_LEAD_DAYS = 7;
/** Don't re-notify the same lot more often than this. */
const DEDUPE_WINDOW_DAYS = 7;
const NOTIFICATION_TYPE = 'STOCK_EXPIRING';

/**
 * Daily job (08:00) that scans each active organization's stock lots and warns
 * the org's administrators about lots approaching their expiry date. Runs
 * OUTSIDE any request: it lists orgs with `runWithoutTenant` and processes each
 * inside `runAsOrg(org.id, …)` so every scoped query is correctly org-filtered
 * (the proven organizations-admin pattern).
 */
@Injectable()
export class ExpiryNotificationJob {
  private readonly logger = new Logger(ExpiryNotificationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly logs: SystemLogsService,
  ) {}

  @Cron('0 8 * * *')
  async run(): Promise<void> {
    const orgs = await runWithoutTenant(async () =>
      this.prisma.organization.findMany({
        where: { isActive: true },
        select: { id: true },
      }),
    );

    let totalNotified = 0;
    for (const org of orgs) {
      try {
        totalNotified += await this.logs.trackJob(
          'job.expiry-scan',
          () => runAsOrg(org.id, async () => this.processOrg()),
          (n) => `${n} notificări de expirare trimise`,
          org.id,
        );
      } catch (error) {
        // One org's failure must not abort the others.
        this.logger.warn(
          `Expiry scan failed for org ${org.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    if (totalNotified > 0) {
      this.logger.log(
        `Expiry scan: sent ${totalNotified} notification(s) across ${orgs.length} org(s)`,
      );
    }
  }

  /** Process a single org (already inside its tenant scope). Returns count sent. */
  private async processOrg(): Promise<number> {
    // The widest window we ever care about — bounds the initial lot query so we
    // don't scan lots that can't be due under any material's lead time.
    const maxLead = await this.prisma.rawMaterial.aggregate({
      _max: { expiryNotifyLeadDays: true },
    });
    const windowDays = Math.max(DEFAULT_LEAD_DAYS, maxLead._max.expiryNotifyLeadDays ?? 0);

    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + windowDays);

    // Candidate lots: have an expiry, still hold quantity, and belong to a raw
    // material in THIS org. StockLot has no organizationId (not tenant-scoped),
    // so filter through the owning material's org explicitly — same guard as
    // StockService.findExpiring.
    const orgId = getCurrentTenantId();
    const lots = await this.prisma.stockLot.findMany({
      where: {
        expiryDate: { not: null, lte: horizon },
        remainingQuantity: { gt: 0 },
        rawMaterial: { is: { organizationId: orgId } },
      },
      include: {
        rawMaterial: { select: { id: true, title: true, expiryNotifyLeadDays: true } },
      },
    });

    if (lots.length === 0) {
      return 0;
    }

    const admins = await this.getAdminUserIds();
    if (admins.length === 0) {
      return 0;
    }

    const dedupeSince = new Date(now);
    dedupeSince.setDate(dedupeSince.getDate() - DEDUPE_WINDOW_DAYS);

    let sent = 0;
    for (const lot of lots) {
      if (!lot.rawMaterial || !lot.expiryDate) continue;

      const lead = lot.rawMaterial.expiryNotifyLeadDays ?? DEFAULT_LEAD_DAYS;
      const notifyFrom = new Date(lot.expiryDate);
      notifyFrom.setDate(notifyFrom.getDate() - lead);
      // Only alert once we're within this material's lead window.
      if (notifyFrom > now) continue;

      // De-dupe: skip if this lot was already notified in the recent window.
      const already = await this.prisma.notification.count({
        where: {
          type: NOTIFICATION_TYPE,
          createdAt: { gte: dedupeSince },
          data: { path: ['lotId'], equals: lot.id },
        },
      });
      if (already > 0) continue;

      const title = 'Material aproape de expirare';
      const expiryStr = lot.expiryDate.toISOString().slice(0, 10);
      const body = `${lot.rawMaterial.title} — expiră la ${expiryStr}`;

      for (const userId of admins) {
        await this.notifications.notifyUser(userId, {
          type: NOTIFICATION_TYPE,
          title,
          body,
          data: { lotId: lot.id, rawMaterialId: lot.rawMaterial.id },
        });
        sent++;
      }
    }

    return sent;
  }

  /** Active users holding the org's `administrator` role. */
  private async getAdminUserIds(): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        dynamicRole: { is: { slug: 'administrator' } },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
}
