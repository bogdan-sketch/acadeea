import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

import { PrismaService } from '@/prisma/prisma.service';

const execFileAsync = promisify(execFile);

/** Hard ceiling for pg_dump/pg_restore runs. */
const PG_TOOL_TIMEOUT_MS = 10 * 60 * 1000;

export interface BackupInfo {
  name: string;
  createdAt: string;
  sizeBytes: number;
}

/**
 * PostgreSQL backups via pg_dump/pg_restore (custom format).
 *
 * - Daily automatic backup at 03:00 UTC into BACKUP_DIR (docker volume),
 *   named auto-YYYY-MM-DD.dump; only the newest RETENTION files are kept.
 *   If the container was down at 03:00, a missing today-backup is created
 *   at boot (catch-up).
 * - Manual export (download a fresh dump) and import (upload + restore).
 * - Restore is defensive: a safety dump of the CURRENT state is taken first,
 *   the API's own Prisma pool is disconnected, other connections are
 *   terminated, and pg_restore runs with --single-transaction so a failed
 *   restore rolls back instead of leaving a half-dropped database. After a
 *   successful restore the Prisma schema is re-synced (db push) because the
 *   dump may predate the running code's schema.
 * - All operations are serialized behind an in-process mutex (concurrent
 *   dumps to the same file / concurrent restores corrupt data).
 *
 * Requires the postgresql client tools in the runtime image (Dockerfile
 * installs postgresql16-client to match the postgres:16 server).
 */
@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private readonly retention = 3;
  private readonly backupDir: string;
  private readonly databaseUrl: string;
  private timer: NodeJS.Timeout | null = null;
  /** In-process mutex: only one dump/restore at a time. */
  private busy = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.backupDir = this.config.get<string>('BACKUP_DIR') ?? '/app/backups';
    // Prisma URLs carry ?schema=public, which libpq rejects as an unknown
    // URI parameter — strip Prisma-specific params for the pg tools.
    this.databaseUrl = this.pgUrl(this.config.get<string>('DATABASE_URL') ?? '');
  }

  private pgUrl(prismaUrl: string): string {
    try {
      const u = new URL(prismaUrl);
      for (const param of ['schema', 'connection_limit', 'pool_timeout', 'pgbouncer']) {
        u.searchParams.delete(param);
      }
      return u.toString();
    } catch {
      return prismaUrl;
    }
  }

  async onModuleInit(): Promise<void> {
    // Best-effort: never block boot on backup plumbing (dir may be missing
    // locally / in CI, where no volume is mounted).
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      this.scheduleNextDaily();
      void this.catchUpIfMissed();
    } catch (err) {
      this.logger.warn(`Backup dir unavailable (${this.backupDir}): ${(err as Error).message}`);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  /** If the container slept through 03:00 UTC, create today's backup at boot. */
  private async catchUpIfMissed(): Promise<void> {
    const now = new Date();
    if (now.getUTCHours() < 3) return;
    const todayFile = path.join(this.backupDir, `auto-${now.toISOString().slice(0, 10)}.dump`);
    try {
      await fs.access(todayFile);
    } catch {
      this.logger.log('No backup for today yet — running catch-up backup');
      await this.runDailyBackup().catch((err) =>
        this.logger.error(`Catch-up backup failed: ${(err as Error).message}`),
      );
    }
  }

  /** Schedule the next 03:00 UTC run, then re-arm after each execution. */
  private scheduleNextDaily(): void {
    const now = new Date();
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0),
    );
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next.getTime() - now.getTime();

    this.timer = setTimeout(() => {
      void this.runDailyBackup()
        .catch((err) => this.logger.error(`Daily backup failed: ${(err as Error).message}`))
        .finally(() => this.scheduleNextDaily());
    }, delay);
    // Don't keep the process alive just for the timer (clean shutdowns/tests).
    this.timer.unref?.();
    this.logger.log(`Next automatic backup at ${next.toISOString()}`);
  }

  private acquire(): void {
    if (this.busy) {
      throw new BadRequestException('O operațiune de backup/restaurare este deja în curs');
    }
    this.busy = true;
  }

  /** Create/overwrite today's automatic backup and prune old ones. */
  async runDailyBackup(): Promise<BackupInfo> {
    this.acquire();
    try {
      const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const file = path.join(this.backupDir, `auto-${stamp}.dump`);
      await this.pgDump(file);
      await this.prune();
      const stat = await fs.stat(file);
      this.logger.log(`Automatic backup written: ${path.basename(file)} (${stat.size} bytes)`);
      return {
        name: path.basename(file),
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
      };
    } finally {
      this.busy = false;
    }
  }

  /** Keep only the newest `retention` automatic backups. */
  private async prune(): Promise<void> {
    const backups = await this.list();
    for (const old of backups.slice(this.retention)) {
      await fs.rm(path.join(this.backupDir, old.name), { force: true });
      this.logger.log(`Pruned old backup ${old.name}`);
    }
  }

  /** Automatic backups, newest first. */
  async list(): Promise<BackupInfo[]> {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(this.backupDir);
    } catch {
      return [];
    }
    const infos: BackupInfo[] = [];
    for (const name of entries.filter((n) => /^auto-\d{4}-\d{2}-\d{2}\.dump$/.test(n))) {
      const stat = await fs.stat(path.join(this.backupDir, name));
      infos.push({ name, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size });
    }
    return infos.sort((a, b) => b.name.localeCompare(a.name));
  }

  /** Restore one of the automatic backups (name validated against the list). */
  async restoreAutomatic(name: string): Promise<void> {
    if (!/^auto-\d{4}-\d{2}-\d{2}\.dump$/.test(name)) {
      throw new BadRequestException('Invalid backup name');
    }
    const file = path.join(this.backupDir, name);
    try {
      await fs.access(file);
    } catch {
      throw new BadRequestException(`Backup "${name}" not found`);
    }
    await this.restoreFromFile(file);
  }

  /** Fresh dump for manual download; caller must clean up the temp file. */
  async exportToTempFile(): Promise<{ filePath: string; fileName: string }> {
    this.acquire();
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(os.tmpdir(), `horae-backup-${stamp}.dump`);
      await this.pgDump(filePath);
      return { filePath, fileName: `horae-backup-${stamp}.dump` };
    } finally {
      this.busy = false;
    }
  }

  /** Restore from an uploaded dump (manual import). */
  async importAndRestore(buffer: Buffer): Promise<void> {
    if (!buffer || buffer.length < 100) {
      throw new BadRequestException('Fisierul de backup este gol sau invalid');
    }
    // pg_dump custom format magic bytes: "PGDMP"
    if (buffer.subarray(0, 5).toString('latin1') !== 'PGDMP') {
      throw new BadRequestException(
        'Fisier invalid — se accepta doar dump-uri PostgreSQL în format custom (.dump)',
      );
    }
    const tmp = path.join(os.tmpdir(), `horae-restore-${Date.now()}.dump`);
    await fs.writeFile(tmp, buffer);
    try {
      await this.restoreFromFile(tmp);
    } finally {
      await fs.rm(tmp, { force: true });
    }
  }

  // ------------------------------------------------------------------
  // pg_dump / pg_restore plumbing
  // ------------------------------------------------------------------

  /**
   * Dump to a temp path first and rename on success — a pg_dump that dies
   * midway must never leave a truncated file that looks like a valid backup.
   */
  private async pgDump(outFile: string): Promise<void> {
    const tmp = `${outFile}.tmp`;
    try {
      await execFileAsync(
        'pg_dump',
        ['--dbname', this.databaseUrl, '--format', 'custom', '--file', tmp],
        { maxBuffer: 16 * 1024 * 1024, timeout: PG_TOOL_TIMEOUT_MS },
      );
      await fs.rename(tmp, outFile);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      this.logger.error(`pg_dump failed: ${(err as Error).message}`);
      throw new BadRequestException('Backup-ul a esuat — verifica log-urile serverului');
    }
  }

  private async restoreFromFile(file: string): Promise<void> {
    this.acquire();
    try {
      // Safety net: dump the CURRENT state before touching anything, so even
      // a bad restore choice can be undone (kept out of the auto-* rotation).
      const safety = path.join(this.backupDir, 'pre-restore.dump');
      await this.pgDump(safety).catch((err) => {
        this.logger.warn(`Safety dump failed (continuing): ${(err as Error).message}`);
      });

      // Kick other connections so --clean can drop objects without lock
      // waits, then release our own pool — surviving pooled connections
      // would hold prepared statements against dropped objects.
      try {
        await this.prisma.$executeRawUnsafe(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
           WHERE datname = current_database() AND pid <> pg_backend_pid()`,
        );
      } catch (err) {
        this.logger.warn(`Could not terminate connections: ${(err as Error).message}`);
      }
      await this.prisma.$disconnect().catch(() => undefined);

      try {
        await execFileAsync(
          'pg_restore',
          [
            '--dbname',
            this.databaseUrl,
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-privileges',
            '--exit-on-error',
            // All-or-nothing: a failed restore rolls back instead of leaving
            // a half-dropped database.
            '--single-transaction',
            file,
          ],
          { maxBuffer: 16 * 1024 * 1024, timeout: PG_TOOL_TIMEOUT_MS },
        );
        this.logger.warn(`Database restored from ${path.basename(file)}`);
      } catch (err) {
        this.logger.error(`pg_restore failed (rolled back): ${(err as Error).message}`);
        throw new BadRequestException(
          'Restaurarea a esuat si a fost anulata — baza de date a ramas neschimbata',
        );
      } finally {
        await this.prisma.$connect().catch(() => undefined);
      }

      // The dump may predate the running code's schema (e.g. restoring
      // yesterday's backup after a deploy added columns). Re-sync best-effort.
      await this.syncSchema();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Best-effort `prisma migrate deploy` after a restore; log-only on failure.
   * (Was `db push --accept-data-loss`, which destructively reconciled the DB
   * to schema.prisma and silently dropped DB-only tenancy objects — never use
   * db push against a live database again.)
   */
  private async syncSchema(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const prismaBin = require.resolve('prisma/build/index.js');
      const schema = path.resolve(__dirname, '../../prisma/schema.prisma');
      const schemaExists = await fs
        .access(schema)
        .then(() => true)
        .catch(() => false);
      // Compiled layout: dist/modules/backup → dist/prisma/schema.prisma is
      // not shipped; fall back to the source schema path used by deploys.
      const schemaPath = schemaExists
        ? schema
        : path.resolve(process.cwd(), 'apps/api/src/prisma/schema.prisma');
      await execFileAsync(
        process.execPath,
        [prismaBin, 'migrate', 'deploy', '--schema', schemaPath],
        { maxBuffer: 16 * 1024 * 1024, timeout: PG_TOOL_TIMEOUT_MS },
      );
      this.logger.log('Schema re-synced after restore (prisma migrate deploy)');
    } catch (err) {
      this.logger.error(
        `Schema sync after restore failed — run a deploy or restart the container: ${(err as Error).message}`,
      );
    }
  }
}
