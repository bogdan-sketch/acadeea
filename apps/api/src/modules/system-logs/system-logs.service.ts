import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma, SystemLogLevel } from '@prisma/client';

import { PrismaService } from '@/prisma/prisma.service';
import { getCurrentTenantId, runWithoutTenant } from '@/prisma/tenant-context';
import { CHANGELOG } from '@/modules/changelog/changelog.data';

export type SystemLogCategory = 'HTTP' | 'AUTH' | 'EMAIL' | 'JOB' | 'INTEGRATION' | 'SYSTEM';

export interface SystemLogEntry {
  category: SystemLogCategory;
  action: string;
  message: string;
  level?: SystemLogLevel;
  /** Explicit org; omitted ⇒ the current tenant context (if any); null ⇒ system-wide. */
  organizationId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  correlationId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY =
  /pass|token|secret|signature|authorization|cookie|api_?key|^code$|handoffcode|idtoken/i;
const MAX_STRING = 300;
const MAX_METADATA_CHARS = 4000;

/**
 * Deep-copies a value for the log: drops secrets (password/token/signature…),
 * truncates long strings (base64 images, notes) and caps the total size.
 */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length})` : value;
  }
  if (depth > 4) return '[…]';
  if (Array.isArray(value)) {
    const items = value.slice(0, 50).map((v) => sanitizeForLog(v, depth + 1));
    if (value.length > 50) items.push(`… +${value.length - 50}`);
    return items;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : sanitizeForLog(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * Writes the durable "Jurnal sistem" (SystemLog table). Fire-and-forget by
 * design: `log()` never throws and never blocks the caller beyond a
 * microtask — a logging failure must not break the request/job it describes.
 * Every entry is mirrored to the process logger (pino → docker/journald).
 */
@Injectable()
export class SystemLogsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('SystemLog');

  constructor(private readonly prisma: PrismaService) {}

  /** One row per boot — makes deploys/restarts (and crash loops) visible. */
  onApplicationBootstrap(): void {
    this.log({
      category: 'SYSTEM',
      action: 'system.start',
      organizationId: null,
      message: `API pornit (v${CHANGELOG[0]?.version ?? '?'})`,
      metadata: { nodeEnv: process.env.NODE_ENV, pid: process.pid },
    });
  }

  log(entry: SystemLogEntry): void {
    const level = entry.level ?? SystemLogLevel.INFO;
    const line = `[${entry.category}] ${entry.action} — ${entry.message}`;
    if (level === SystemLogLevel.ERROR) this.logger.error(line);
    else if (level === SystemLogLevel.WARN) this.logger.warn(line);
    else this.logger.log(line);

    const organizationId =
      entry.organizationId !== undefined ? entry.organizationId : (getCurrentTenantId() ?? null);

    let metadata: Prisma.InputJsonValue | undefined;
    if (entry.metadata) {
      const clean = sanitizeForLog(entry.metadata);
      const json = JSON.stringify(clean);
      metadata = (
        json.length > MAX_METADATA_CHARS ? { truncated: json.slice(0, MAX_METADATA_CHARS) } : clean
      ) as Prisma.InputJsonValue;
    }

    void runWithoutTenant(async () => {
      // Unauthenticated auth events (login, forgot-password…) carry only an
      // email — attribute them to that user's org so org admins see them.
      let orgId = organizationId;
      let userId = entry.userId ?? null;
      if (!orgId && entry.userEmail && entry.category === 'AUTH') {
        const u = await this.prisma.user.findFirst({
          where: { email: entry.userEmail.toLowerCase() },
          select: { id: true, organizationId: true },
        });
        if (u) {
          orgId = u.organizationId;
          userId = userId ?? u.id;
        }
      }
      await this.prisma.systemLog.create({
        data: {
          organizationId: orgId,
          level,
          category: entry.category,
          action: entry.action.slice(0, 200),
          message: entry.message.slice(0, 2000),
          userId,
          userEmail: entry.userEmail ?? null,
          method: entry.method ?? null,
          path: entry.path?.slice(0, 500) ?? null,
          statusCode: entry.statusCode ?? null,
          durationMs: entry.durationMs ?? null,
          correlationId: entry.correlationId ?? null,
          ip: entry.ip ?? null,
          metadata,
        },
      });
    }).catch((err: unknown) => {
      this.logger.warn(`Could not persist system log: ${String(err)}`);
    });
  }

  /** Convenience for background jobs: logs start→finish/failure with duration. */
  async trackJob<T>(
    action: string,
    fn: () => Promise<T>,
    describe?: (result: T) => string,
    organizationId: string | null = null,
  ): Promise<T> {
    const started = Date.now();
    try {
      const result = await fn();
      this.log({
        category: 'JOB',
        action,
        organizationId,
        message: describe ? describe(result) : 'Finalizat',
        durationMs: Date.now() - started,
      });
      return result;
    } catch (err) {
      this.log({
        category: 'JOB',
        action,
        organizationId,
        level: SystemLogLevel.ERROR,
        message: `Eșuat: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - started,
      });
      throw err;
    }
  }
}
