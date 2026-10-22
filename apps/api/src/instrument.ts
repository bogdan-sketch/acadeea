// Sentry must be initialised before any other import in main.ts so that the
// NestJS/Express auto-instrumentation can patch the runtime. This file is the
// very first import there.
//
// If SENTRY_DSN is empty/undefined, Sentry stays a complete no-op: we skip
// Sentry.init entirely, so the SDK does nothing and the app boots normally
// without any DSN configured.
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    // 10% of transactions sampled for performance monitoring.
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
    integrations: [nodeProfilingIntegration()],
  });
}
