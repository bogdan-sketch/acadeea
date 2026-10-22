import posthog from 'posthog-js';

// PostHog is opt-in: with no key set, every helper here is a no-op so the app
// builds and runs identically with empty env vars.
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

export function isPosthogEnabled(): boolean {
  return Boolean(POSTHOG_KEY);
}

export function initPosthog(): void {
  if (typeof window === 'undefined' || !POSTHOG_KEY) return;
  if (posthog.__loaded) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // We capture $pageview manually on App Router route changes.
    capture_pageview: false,
    capture_pageleave: true,
  });
}

export { posthog };
