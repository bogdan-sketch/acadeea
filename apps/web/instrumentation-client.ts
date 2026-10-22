import * as Sentry from '@sentry/nextjs';
import { SENTRY_TRACES_SAMPLE_RATE } from '@/lib/sentry.shared';

// Client-side Sentry init. No-op when NEXT_PUBLIC_SENTRY_DSN is empty.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  });
}

// Lets Sentry instrument App Router client-side navigations. Safe to export
// even when Sentry is disabled (it is a no-op without an active client).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
