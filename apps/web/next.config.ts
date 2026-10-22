import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  transpilePackages: ['@horae/shared-types'],
};

// withSentryConfig is safe with no DSN/auth token: source-map upload only runs
// when SENTRY_AUTH_TOKEN + org/project are present, so the build works offline.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // No auth token in the repo → skip source-map upload, keep the build quiet.
  silent: !process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Tunnel Sentry requests through the app to dodge ad-blockers (no-op offline).
  tunnelRoute: '/monitoring',
});
