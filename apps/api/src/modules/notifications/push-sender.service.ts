import { readFileSync } from 'fs';

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Notification, Provider, type ResponseFailure } from '@parse/node-apn';

import { PrismaService } from '@/prisma/prisma.service';

/**
 * APNs push delivery (token-based auth, HTTP/2 via `@parse/node-apn`).
 *
 * Follows the "empty config ⇒ safe no-op" pattern (like Sentry/PostHog): when
 * the APNs env is absent the service NO-OPS cleanly, so the app boots and every
 * call is safe. When credentials ARE present it builds a token-auth `Provider`
 * once and pushes to every iOS device token registered for the target user.
 *
 * Config (all from env; blank ⇒ disabled):
 *   - `APNS_KEY_ID`        Key ID of the .p8 auth key (e.g. `HLW2KVPK4Z`).
 *   - `APNS_TEAM_ID`       Apple Team ID (e.g. `2C3LQ6B4B4`).
 *   - `APNS_BUNDLE_ID`     APNs topic = the app bundle id (differs per env:
 *                          `ca.horae.app` prod, `ca.horae.app.test` test).
 *   - `APNS_ENV`           `production` (default) or `sandbox` — picks the APNs host.
 *   - `APNS_AUTH_KEY_PATH` PREFERRED: filesystem path to the mounted .p8 key
 *                          (chmod 600, mounted as a Docker secret file, never in
 *                          the image). Read once at boot.
 *   - `APNS_AUTH_KEY`      Fallback: the .p8 PEM contents inline (used only when
 *                          `APNS_AUTH_KEY_PATH` is not set).
 *
 * The single team key works for every Horae bundle; only the topic (bundle id)
 * and host (env) differ per environment.
 */
@Injectable()
export class PushSender implements OnModuleDestroy {
  private readonly logger = new Logger(PushSender.name);
  private readonly enabled: boolean;
  private readonly provider: Provider | null = null;
  private readonly topic: string | null = null;

  /** Apple error reasons that mean the token is dead and must be pruned. */
  private static readonly DEAD_TOKEN_REASONS = new Set([
    'BadDeviceToken',
    'Unregistered',
    'DeviceTokenNotForTopic',
  ]);

  constructor(private readonly prisma: PrismaService) {
    const keyId = process.env.APNS_KEY_ID?.trim();
    const teamId = process.env.APNS_TEAM_ID?.trim();
    const bundleId = process.env.APNS_BUNDLE_ID?.trim();
    const keyPath = process.env.APNS_AUTH_KEY_PATH?.trim();
    const keyInline = process.env.APNS_AUTH_KEY?.trim();

    if (!keyId || !teamId || !bundleId || (!keyPath && !keyInline)) {
      // Missing config ⇒ disabled ⇒ every push is a no-op. This is the default
      // and keeps a blank environment (local/dev/CI) booting cleanly.
      this.enabled = false;
      return;
    }

    // Prefer reading the key from a mounted file path (kept out of the image and
    // out of env vars); fall back to inline PEM only when no path is given.
    let key: Buffer | string | null = null;
    try {
      key = keyPath ? readFileSync(keyPath) : (keyInline as string);
    } catch (error) {
      this.logger.error(
        `APNs key unreadable at APNS_AUTH_KEY_PATH — push DISABLED: ${
          error instanceof Error ? error.message : error
        }`,
      );
      this.enabled = false;
      return;
    }

    // `production` picks api.push.apple.com; `sandbox` picks api.sandbox.push.apple.com.
    // Both accept the same team key — only the device-token audience differs.
    const production = (process.env.APNS_ENV?.trim().toLowerCase() ?? 'production') !== 'sandbox';

    try {
      this.provider = new Provider({ token: { key, keyId, teamId }, production });
      this.topic = bundleId;
      this.enabled = true;
      this.logger.log(
        `Push delivery enabled (APNs, topic=${bundleId}, env=${
          production ? 'production' : 'sandbox'
        }, keyId=${keyId})`,
      );
    } catch (error) {
      this.logger.error(
        `APNs provider init failed — push DISABLED: ${
          error instanceof Error ? error.message : error
        }`,
      );
      this.enabled = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Drain + close HTTP/2 connections so the process can exit cleanly.
    await this.provider?.shutdown().catch(() => undefined);
  }

  /**
   * Best-effort push to every iOS device registered for a user. Never throws:
   * push failures must not break the in-app notification write or the caller's
   * request flow. No-op when push is not configured.
   */
  async pushToUser(userId: string, title: string, body: string): Promise<void> {
    if (!this.enabled || !this.provider || !this.topic) {
      return;
    }

    try {
      const devices = await this.prisma.deviceToken.findMany({
        where: { userId, platform: 'ios' },
      });
      if (devices.length === 0) {
        return;
      }

      const tokens = devices.map((d) => d.token);

      const note = new Notification();
      note.topic = this.topic;
      note.alert = { title, body };
      note.sound = 'default';
      note.pushType = 'alert';
      note.priority = 10;

      const result = await this.provider.send(note, tokens);

      if (result.failed.length > 0) {
        await this.handleFailures(userId, result.failed);
      }
    } catch (error) {
      // A transport/HTTP2 error must never bubble up to the caller.
      this.logger.warn(
        `Push delivery failed for user ${userId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  /** Log failures (no secrets) and prune device tokens Apple reports as dead. */
  private async handleFailures(userId: string, failures: ResponseFailure[]): Promise<void> {
    const deadTokens: string[] = [];

    for (const f of failures) {
      const reason = f.response?.reason ?? (f.error ? f.error.message : `status ${f.status}`);
      this.logger.warn(`APNs rejected a token for user ${userId}: ${reason}`);
      if (f.response?.reason && PushSender.DEAD_TOKEN_REASONS.has(f.response.reason)) {
        deadTokens.push(f.device);
      }
    }

    if (deadTokens.length > 0) {
      // Prune globally by token value — a stale token is dead for every user.
      const { count } = await this.prisma.deviceToken.deleteMany({
        where: { token: { in: deadTokens } },
      });
      this.logger.log(`Pruned ${count} dead device token(s) for user ${userId}`);
    }
  }
}
