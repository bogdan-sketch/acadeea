import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '@/prisma/prisma.service';
import { runAsOrg, runWithoutTenant } from '@/prisma/tenant-context';
import { SystemLogsService } from '@/modules/system-logs/system-logs.service';
import { AUTO_RETENTION, BackupsService } from './backups.service';

/**
 * Nightly org snapshots at 01:30: one automatic snapshot per ACTIVE
 * organization, then retention — only the newest AUTO_RETENTION (30) auto
 * snapshots per org are kept (file + OrgSnapshot row removed together).
 * Multi-tenant pattern: `runWithoutTenant` to list orgs, `runAsOrg` per org
 * — same as OrderArchiveJob / WooPollJob.
 */
@Injectable()
export class BackupsJob {
  private readonly logger = new Logger(BackupsJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly backups: BackupsService,
    private readonly logs: SystemLogsService,
  ) {}

  @Cron('30 1 * * *')
  async run(): Promise<void> {
    const orgs = await runWithoutTenant(async () =>
      this.prisma.organization.findMany({
        where: { isActive: true },
        select: { id: true, slug: true },
      }),
    );

    for (const org of orgs) {
      try {
        await this.logs.trackJob(
          'job.backup',
          () =>
            runAsOrg(org.id, async () => {
              await this.backups.createSnapshot(org.id, { auto: true });
              await this.backups.pruneAutoSnapshots(org.id, AUTO_RETENTION);
            }),
          () => 'Backup automat creat',
          org.id,
        );
      } catch (error) {
        // One org's failure must not abort the others.
        this.logger.warn(
          `Nightly snapshot failed for org ${org.slug}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }
}
