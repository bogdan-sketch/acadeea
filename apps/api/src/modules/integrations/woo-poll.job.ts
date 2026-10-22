import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IntegrationProvider, SystemLogLevel } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { runAsOrg, runWithoutTenant } from '@/prisma/tenant-context';
import { SystemLogsService } from '@/modules/system-logs/system-logs.service';
import { IntegrationsService } from './integrations.service';
import {
  IMPORTABLE_WOO_STATUS_FILTER,
  parseWooConfig,
  WooCommerceClient,
} from './woocommerce.client';

/** How far back to look on the first sync of an integration (no lastSyncAt). */
const INITIAL_LOOKBACK_DAYS = 7;
/** WooCommerce max is 100 per page. */
const PER_PAGE = 100;
/** Safety cap so a misbehaving store can't spin the job forever. */
const MAX_PAGES = 50;
const MS_DAY = 86_400_000;

/**
 * Every 15 minutes, pull new orders from each ACTIVE WooCommerce integration,
 * store them as `ExternalOrderSource` rows, then run the existing sync path
 * (maps them to real Orders via ProductMapping). Multi-tenant: lists
 * integrations across orgs with `runWithoutTenant`, then does each integration's
 * work inside `runAsOrg(org.id, …)` so every scoped query is org-filtered — the
 * same pattern as ExpiryNotificationJob. A bad/missing config just logs a
 * warning and skips that integration; nothing throws out of the cron.
 */
@Injectable()
export class WooPollJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly logs: SystemLogsService,
  ) {}

  @Cron('*/15 * * * *')
  async run(): Promise<void> {
    const active = await runWithoutTenant(async () =>
      this.prisma.integration.findMany({
        where: { provider: IntegrationProvider.WOOCOMMERCE, status: 'ACTIVE' },
        select: { id: true, organizationId: true, config: true, lastSyncAt: true },
      }),
    );

    for (const integration of active) {
      try {
        await runAsOrg(integration.organizationId, () => this.pollIntegration(integration));
      } catch (error) {
        // One integration's failure must not abort the others.
        this.logs.log({
          category: 'INTEGRATION',
          action: 'job.woo-poll',
          level: SystemLogLevel.ERROR,
          organizationId: integration.organizationId,
          message: `Sincronizarea WooCommerce a eșuat: ${
            error instanceof Error ? error.message : String(error)
          }`,
          metadata: { integrationId: integration.id },
        });
      }
    }
  }

  private async pollIntegration(integration: {
    id: string;
    organizationId: string;
    config: unknown;
    lastSyncAt: Date | null;
  }): Promise<void> {
    let client: WooCommerceClient;
    try {
      client = new WooCommerceClient(parseWooConfig(integration.config));
    } catch (error) {
      // Invalid/missing config is an operator problem, not a runtime failure —
      // warn and skip so the cron keeps serving other integrations.
      this.logs.log({
        category: 'INTEGRATION',
        action: 'job.woo-poll',
        level: SystemLogLevel.WARN,
        organizationId: integration.organizationId,
        message: `Integrare WooCommerce sărită — configurație invalidă: ${
          error instanceof Error ? error.message : String(error)
        }`,
        metadata: { integrationId: integration.id },
      });
      return;
    }

    const runStartedAt = new Date();
    const after = (
      integration.lastSyncAt ?? new Date(Date.now() - INITIAL_LOOKBACK_DAYS * MS_DAY)
    ).toISOString();

    let stored = 0;
    let page = 1;
    let totalPages = 1;
    do {
      const { orders, totalPages: tp } = await client.fetchOrders({
        after,
        // Only paid/fulfilled orders — `pending` checkouts must not be imported.
        status: IMPORTABLE_WOO_STATUS_FILTER,
        page,
        perPage: PER_PAGE,
      });
      totalPages = tp;
      for (const order of orders) {
        if (await this.integrations.upsertWooExternalOrder(integration.id, order)) stored++;
      }
      page++;
    } while (page <= totalPages && page <= MAX_PAGES);

    // Map the freshly stored (PENDING) external orders into real Orders.
    const result = await this.integrations.triggerSync(integration.id);

    // Advance the watermark to when this run started (not "now") so orders
    // created mid-run are still picked up next time.
    await this.prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: runStartedAt },
    });

    if (stored > 0 || result.synced > 0 || result.failed > 0) {
      this.logs.log({
        category: 'INTEGRATION',
        action: 'job.woo-poll',
        level: result.failed > 0 ? SystemLogLevel.WARN : SystemLogLevel.INFO,
        organizationId: integration.organizationId,
        message: `WooCommerce: ${stored} comenzi noi preluate, ${result.synced} create în Horae, ${result.failed} eșuate`,
        metadata: { integrationId: integration.id, stored, ...result },
      });
    }
  }
}
