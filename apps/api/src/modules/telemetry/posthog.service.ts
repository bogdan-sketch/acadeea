import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PostHog } from 'posthog-node';

/**
 * Thin wrapper around the PostHog Node client for backend product analytics.
 *
 * No-op when POSTHOG_API_KEY is unset: the client is never created and every
 * method is safe to call (it just does nothing), so the app boots and runs
 * fine without PostHog configured. Inject this service anywhere and call
 * `capture(...)` to record backend events — endpoints are NOT auto-instrumented.
 */
@Injectable()
export class PostHogService implements OnModuleDestroy {
  private readonly logger = new Logger(PostHogService.name);
  private readonly client: PostHog | null;

  constructor() {
    const apiKey = process.env.POSTHOG_API_KEY;

    if (apiKey) {
      this.client = new PostHog(apiKey, {
        host: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
      });
      this.logger.log('PostHog analytics enabled');
    } else {
      this.client = null;
    }
  }

  /** Record a backend event for a given user. No-op when PostHog is disabled. */
  capture(distinctId: string, event: string, properties?: Record<string, unknown>): void {
    if (!this.client) {
      return;
    }
    try {
      this.client.capture({ distinctId, event, properties });
    } catch (error) {
      // Analytics must never break a request flow.
      this.logger.warn(`PostHog capture failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** Flush any queued events. No-op when PostHog is disabled. */
  async flush(): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.flush();
  }

  /** Flush + shut the client down (called automatically on module destroy). */
  async shutdown(): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.shutdown();
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }
}
