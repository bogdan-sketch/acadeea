import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createReadStream, promises as fs } from 'fs';
import type { ReadStream } from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

import { PrismaService } from '@/prisma/prisma.service';
import {
  RESTORE_DELETE_ORDER,
  RESTORE_INSERT_ORDER,
  SNAPSHOT_MODELS,
  SnapshotModelDef,
  deserializeRow,
  serializeRow,
} from './snapshot-models';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/** createMany batch size — keeps every INSERT well under bind-param limits. */
const INSERT_CHUNK = 500;
/** Auto snapshots kept per org by the nightly retention. */
export const AUTO_RETENTION = 30;
/** Restore must be confirmed with this exact string. */
export const RESTORE_CONFIRMATION = 'RESTAUREAZA';
/** Fallback when BACKUP_ADMIN_EMAILS is not configured. */
const DEFAULT_BACKUP_ADMIN_EMAILS = 'admin@acadeea.ro,sergiu@tigan.dev';

/** Minimal structural view over a Prisma model delegate (client or tx). */
interface ModelDelegate {
  findMany(args?: unknown): Promise<Array<Record<string, unknown>>>;
  deleteMany(args?: unknown): Promise<{ count: number }>;
  createMany(args?: unknown): Promise<{ count: number }>;
}

interface SnapshotPayload {
  version: number;
  organizationId: string;
  createdAt: string;
  tables: Record<string, Array<Record<string, unknown>>>;
}

export interface SnapshotListItem {
  id: string;
  label: string | null;
  auto: boolean;
  /** BigInt → string: JSON.stringify cannot serialize BigInt. */
  sizeBytes: string;
  summary: Prisma.JsonValue | null;
  createdAt: Date;
  createdBy: string | null;
}

/**
 * Org snapshots ("Salvează starea") — logical, per-tenant backups.
 *
 * A snapshot is a gzipped JSON dump of EVERY org-scoped table (see
 * snapshot-models.ts), stored on the shared backups volume (`BACKUP_DIR`,
 * same volume the platform-level pg_dump backups use — the API has no S3
 * client despite the S3_* envs, invoices live as Bytes in Postgres) under
 * `org-snapshots/<orgId>/<timestamp>.json.gz`; OrgSnapshot.storageKey holds
 * that relative key so the storage backend can later move to S3/MinIO
 * without a schema change.
 *
 * Restore is all-or-nothing (one interactive transaction): delete the org's
 * rows children-first, re-insert the snapshot rows parents-first WITH THEIR
 * ORIGINAL IDS. Users and Roles are synced (upsert + delete-missing) instead
 * of wiped so their auth side-tables (UserAuthProvider, PasswordHistory,
 * DeviceToken, …) survive for accounts that still exist. All refresh tokens
 * of the org's users are revoked at the end → every session re-logs in.
 */
@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly baseDir: string;
  /** Per-org mutex — a snapshot and a restore must never interleave. */
  private readonly busyOrgs = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.baseDir = this.config.get<string>('BACKUP_DIR') ?? '/app/backups';
  }

  // ------------------------------------------------------------------
  // Listing
  // ------------------------------------------------------------------

  async list(organizationId: string): Promise<SnapshotListItem[]> {
    const rows = await this.prisma.orgSnapshot.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    return rows.map((row) => this.toListItem(row));
  }

  private toListItem(row: {
    id: string;
    label: string | null;
    auto: boolean;
    sizeBytes: bigint;
    summary: Prisma.JsonValue | null;
    createdAt: Date;
    createdBy?: { firstName: string; lastName: string } | null;
  }): SnapshotListItem {
    return {
      id: row.id,
      label: row.label,
      auto: row.auto,
      sizeBytes: row.sizeBytes.toString(),
      summary: row.summary ?? null,
      createdAt: row.createdAt,
      createdBy: row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : null,
    };
  }

  // ------------------------------------------------------------------
  // Snapshot creation
  // ------------------------------------------------------------------

  async createSnapshot(
    organizationId: string,
    opts: { label?: string; auto?: boolean; createdById?: string } = {},
  ): Promise<SnapshotListItem> {
    this.acquire(organizationId);
    try {
      const tables: Record<string, Array<Record<string, unknown>>> = {};
      const summary: Record<string, number> = {};

      // One REPEATABLE READ transaction → a consistent cross-table snapshot.
      await this.prisma.$transaction(
        async (tx) => {
          for (const model of SNAPSHOT_MODELS) {
            const rows = await this.delegate(tx, model).findMany({
              where: model.where(organizationId),
            });
            tables[model.name] = rows.map((row) => serializeRow(model.name, row));
            summary[model.name] = rows.length;
          }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          timeout: 5 * 60_000,
          maxWait: 30_000,
        },
      );

      const payload: SnapshotPayload = {
        version: 1,
        organizationId,
        createdAt: new Date().toISOString(),
        tables,
      };
      const compressed = await gzip(Buffer.from(JSON.stringify(payload), 'utf8'));

      const stamp = payload.createdAt.replace(/[:.]/g, '-');
      const storageKey = `org-snapshots/${organizationId}/${stamp}.json.gz`;
      await this.writeFile(storageKey, compressed);

      try {
        const row = await this.prisma.orgSnapshot.create({
          data: {
            organizationId,
            label: opts.label ?? null,
            auto: opts.auto ?? false,
            storageKey,
            sizeBytes: BigInt(compressed.length),
            summary,
            createdById: opts.createdById ?? null,
          },
          include: { createdBy: { select: { firstName: true, lastName: true } } },
        });
        this.logger.log(
          `Snapshot ${row.id} created for org ${organizationId} (${compressed.length} bytes, auto=${row.auto})`,
        );
        return this.toListItem(row);
      } catch (err) {
        // Never leave an orphan file behind a failed DB insert.
        await fs.rm(this.filePath(storageKey), { force: true });
        throw err;
      }
    } finally {
      this.release(organizationId);
    }
  }

  // ------------------------------------------------------------------
  // Restore
  // ------------------------------------------------------------------

  async restoreSnapshot(
    organizationId: string,
    snapshotId: string,
    confirm: string,
  ): Promise<Record<string, number>> {
    if (confirm !== RESTORE_CONFIRMATION) {
      throw new BadRequestException(
        `Confirmare invalidă — trimite confirm: '${RESTORE_CONFIRMATION}' pentru a restaura`,
      );
    }
    const snapshot = await this.findOwnedSnapshot(organizationId, snapshotId);

    this.acquire(organizationId);
    try {
      const payload = await this.readPayload(snapshot.storageKey);
      if (payload.version !== 1 || payload.organizationId !== organizationId) {
        throw new BadRequestException('Snapshot invalid sau aparținând altei organizații');
      }
      const tables = payload.tables ?? {};
      const rowsOf = (model: string): Array<Record<string, unknown>> =>
        (tables[model] ?? []).map((row) => deserializeRow(model, row));

      const restored = await this.prisma.$transaction(
        async (tx) => this.runRestore(tx, organizationId, rowsOf),
        { timeout: 10 * 60_000, maxWait: 30_000 },
      );

      this.logger.warn(
        `Org ${organizationId} restored from snapshot ${snapshotId} (${snapshot.storageKey})`,
      );
      return restored;
    } finally {
      this.release(organizationId);
    }
  }

  /**
   * The restore transaction body. Order is load-bearing:
   *
   *  1. DELETE every restorable table children-first (RESTORE_DELETE_ORDER =
   *     exact reverse of the insert order) — Users/Roles excluded (synced).
   *  2. Detach OrgSnapshot.createdById from users about to disappear
   *     (OrgSnapshot rows are never restored — they are the backups).
   *  3. Revoke ALL refresh tokens of the org's users (forces re-login and
   *     unblocks deleting removed users — RefreshToken has no cascade).
   *  4. Upsert snapshot Roles (users still reference the current roles, so
   *     roles can only be added/updated here, deleted later).
   *  5. Sync Users: delete org users missing from the snapshot (cascades wipe
   *     their auth side-tables), then upsert every snapshot user with its
   *     original id.
   *  6. Delete org roles missing from the snapshot (no user references them
   *     anymore after step 5).
   *  7. Recreate RolePermissions (wiped in step 1).
   *  8. Insert everything else in FK-safe order (SNAPSHOT_MODELS order),
   *     self-referential models (RecipeCategoryConfig.parentId,
   *     Recipe.sourceRecipeId, Task.parentTaskId) level-by-level.
   */
  private async runRestore(
    tx: unknown,
    organizationId: string,
    rowsOf: (model: string) => Array<Record<string, unknown>>,
  ): Promise<Record<string, number>> {
    const client = tx as PrismaService;
    const restored: Record<string, number> = {};

    // 1. Wipe restorable tables, children first.
    for (const model of RESTORE_DELETE_ORDER) {
      await this.delegate(tx, model).deleteMany({ where: model.where(organizationId) });
    }

    const roleRows = rowsOf('Role');
    const userRows = rowsOf('User');
    const snapshotUserIds = userRows.map((row) => row.id as string);
    const snapshotRoleIds = roleRows.map((row) => row.id as string);

    // 2. Keep OrgSnapshot rows valid when their creator is about to be deleted.
    await client.orgSnapshot.updateMany({
      where: { organizationId, createdById: { notIn: snapshotUserIds } },
      data: { createdById: null },
    });

    // 3. Revoke every session of the org's users (always — see contract).
    await client.refreshToken.deleteMany({ where: { user: { organizationId } } });

    // 4. Roles: upsert with original ids.
    for (const role of roleRows) {
      const update = { ...role };
      delete update.id;
      delete update.organizationId;
      await client.role.upsert({
        where: { id: role.id as string },
        create: role as unknown as Prisma.RoleUncheckedCreateInput,
        update: update as unknown as Prisma.RoleUncheckedUpdateInput,
      });
    }
    restored.Role = roleRows.length;

    // 5. Users: drop the ones missing from the snapshot, then upsert the rest.
    await client.user.deleteMany({
      where: { organizationId, id: { notIn: snapshotUserIds } },
    });
    for (const user of userRows) {
      const update = { ...user };
      delete update.id;
      delete update.organizationId;
      await client.user.upsert({
        where: { id: user.id as string },
        create: user as unknown as Prisma.UserUncheckedCreateInput,
        update: update as unknown as Prisma.UserUncheckedUpdateInput,
      });
    }
    restored.User = userRows.length;

    // 6. Roles that no longer exist in the snapshot.
    await client.role.deleteMany({
      where: { organizationId, id: { notIn: snapshotRoleIds } },
    });

    // 7. Role permissions (deleted in step 1, roles now final).
    const permissionRows = rowsOf('RolePermission');
    await this.insertChunked(this.delegateByName(tx, 'rolePermission'), permissionRows);
    restored.RolePermission = permissionRows.length;

    // 8. Everything else, parents before children.
    for (const model of RESTORE_INSERT_ORDER) {
      const rows = rowsOf(model.name);
      if (model.selfRef) {
        await this.insertLevelOrdered(this.delegate(tx, model), rows, model.selfRef);
      } else {
        await this.insertChunked(this.delegate(tx, model), rows);
      }
      restored[model.name] = rows.length;
    }

    return restored;
  }

  private async insertChunked(
    delegate: ModelDelegate,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await delegate.createMany({ data: rows.slice(i, i + INSERT_CHUNK) });
    }
  }

  /**
   * Insert rows of a self-referential model level-by-level: first the rows
   * with no parent, then rows whose parent is already inserted, and so on.
   * Guards against createMany chunking splitting a parent and its child
   * across INSERT statements. A cycle (shouldn't exist) falls back to a
   * single batch and lets the DB's statement-end FK check decide.
   */
  private async insertLevelOrdered(
    delegate: ModelDelegate,
    rows: Array<Record<string, unknown>>,
    selfRef: string,
  ): Promise<void> {
    const inserted = new Set<string>();
    let pending = rows;
    while (pending.length > 0) {
      let batch = pending.filter((row) => {
        const parentId = row[selfRef];
        return parentId == null || inserted.has(parentId as string);
      });
      if (batch.length === 0) batch = pending; // cycle fallback
      await this.insertChunked(delegate, batch);
      const batchIds = new Set(batch.map((row) => row.id as string));
      for (const id of batchIds) inserted.add(id);
      pending = pending.filter((row) => !batchIds.has(row.id as string));
    }
  }

  // ------------------------------------------------------------------
  // Download & delete
  // ------------------------------------------------------------------

  /**
   * Downloading raw dumps is extra-gated beyond `manage all`: the caller's
   * DB email must be listed in BACKUP_ADMIN_EMAILS (comma-separated;
   * defaults to the platform operators when unset).
   */
  async assertDownloadAllowed(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const allowed = (
      this.config.get<string>('BACKUP_ADMIN_EMAILS')?.trim() || DEFAULT_BACKUP_ADMIN_EMAILS
    )
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (!user || !allowed.includes(user.email.toLowerCase())) {
      throw new ForbiddenException('Nu ai permisiunea de a descărca snapshot-uri');
    }
  }

  async openDownload(
    organizationId: string,
    snapshotId: string,
  ): Promise<{ stream: ReadStream; fileName: string; sizeBytes: string }> {
    const snapshot = await this.findOwnedSnapshot(organizationId, snapshotId);
    const filePath = this.filePath(snapshot.storageKey);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('Fișierul snapshot-ului nu mai există în storage');
    }
    return {
      stream: createReadStream(filePath),
      fileName: path.basename(snapshot.storageKey),
      sizeBytes: snapshot.sizeBytes.toString(),
    };
  }

  async deleteSnapshot(organizationId: string, snapshotId: string): Promise<void> {
    const snapshot = await this.findOwnedSnapshot(organizationId, snapshotId);
    await fs.rm(this.filePath(snapshot.storageKey), { force: true });
    await this.prisma.orgSnapshot.delete({ where: { id: snapshot.id } });
    this.logger.log(`Snapshot ${snapshotId} deleted for org ${organizationId}`);
  }

  // ------------------------------------------------------------------
  // Retention (nightly job)
  // ------------------------------------------------------------------

  /** Keep the newest `keep` AUTO snapshots of the org; delete the rest. */
  async pruneAutoSnapshots(organizationId: string, keep = AUTO_RETENTION): Promise<number> {
    const stale = await this.prisma.orgSnapshot.findMany({
      where: { organizationId, auto: true },
      orderBy: { createdAt: 'desc' },
      skip: keep,
      select: { id: true, storageKey: true },
    });
    for (const snapshot of stale) {
      await fs.rm(this.filePath(snapshot.storageKey), { force: true });
      await this.prisma.orgSnapshot.delete({ where: { id: snapshot.id } });
    }
    if (stale.length > 0) {
      this.logger.log(`Pruned ${stale.length} auto snapshots for org ${organizationId}`);
    }
    return stale.length;
  }

  // ------------------------------------------------------------------
  // Plumbing
  // ------------------------------------------------------------------

  private async findOwnedSnapshot(organizationId: string, snapshotId: string) {
    const snapshot = await this.prisma.orgSnapshot.findFirst({
      where: { id: snapshotId, organizationId },
    });
    if (!snapshot) {
      throw new NotFoundException('Snapshot-ul nu există');
    }
    return snapshot;
  }

  private async readPayload(storageKey: string): Promise<SnapshotPayload> {
    let compressed: Buffer;
    try {
      compressed = await fs.readFile(this.filePath(storageKey));
    } catch {
      throw new NotFoundException('Fișierul snapshot-ului nu mai există în storage');
    }
    const raw = await gunzip(compressed);
    return JSON.parse(raw.toString('utf8')) as SnapshotPayload;
  }

  private filePath(storageKey: string): string {
    return path.join(this.baseDir, storageKey);
  }

  private async writeFile(storageKey: string, data: Buffer): Promise<void> {
    const target = this.filePath(storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // tmp + rename: a crash mid-write must never leave a truncated .json.gz
    // that looks like a valid snapshot.
    const tmp = `${target}.tmp`;
    try {
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, target);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  private delegate(client: unknown, model: SnapshotModelDef): ModelDelegate {
    return this.delegateByName(client, model.delegate);
  }

  private delegateByName(client: unknown, delegate: string): ModelDelegate {
    const found = (client as Record<string, ModelDelegate | undefined>)[delegate];
    if (!found) {
      throw new Error(`Unknown Prisma delegate "${delegate}" — snapshot registry out of sync`);
    }
    return found;
  }

  /**
   * Run `fn` holding this org's snapshot/restore mutex — used by DataReset so
   * a wipe never overlaps a snapshot or restore of the same organization.
   */
  async withOrgLock<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
    this.acquire(organizationId);
    try {
      return await fn();
    } finally {
      this.release(organizationId);
    }
  }

  private acquire(organizationId: string): void {
    if (this.busyOrgs.has(organizationId)) {
      throw new BadRequestException(
        'O operațiune de snapshot/restaurare este deja în curs pentru această organizație',
      );
    }
    this.busyOrgs.add(organizationId);
  }

  private release(organizationId: string): void {
    this.busyOrgs.delete(organizationId);
  }
}
