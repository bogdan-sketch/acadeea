import * as Sentry from '@sentry/nextjs';
import { SENTRY_TRACES_SAMPLE_RATE } from '@/lib/sentry.shared';

// Server + edge runtime Sentry init. No-op when SENTRY_DSN is empty.
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn,
      tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn,
      tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    });
  }
}

// Forwards server-side (Server Component / route / action) errors to Sentry.
// `captureRequestError` is a no-op when Sentry was never initialized.
export const onRequestError = Sentry.captureRequestError;
