import { defineConfig, devices } from '@playwright/test';
import { API_URL, STORAGE_STATE } from './e2e/constants';

/**
 * Horae web end-to-end suite. Runs against the TEST environment only
 * (https://acadeea.test.horae.ca, API https://api-test.horae.ca).
 *
 *   pnpm --filter web test:e2e
 *   E2E_BASE_URL=http://localhost:3000 pnpm --filter web test:e2e
 *
 * Every record the suite creates starts with `QA-E2E-` and is removed (or,
 * for recipes referenced by orders/tasks, archived) in `afterAll`.
 */
// Local credentials (git-ignored): apps/web/.env.e2e — see .env.e2e.example.
try {
  process.loadEnvFile('.env.e2e');
} catch {
  // CI passes E2E_* through the environment instead.
}

const baseURL = process.env.E2E_BASE_URL ?? 'https://acadeea.test.horae.ca';

// Hard guard: never point this suite at production.
for (const url of [baseURL, API_URL]) {
  const host = new URL(url).hostname;
  if (host.endsWith('horae.ca') && !/(^|\.)test\.horae\.ca$|^api-test\.horae\.ca$/.test(host)) {
    throw new Error(`Refusing to run e2e against a non-test host: ${url}`);
  }
}

export default defineConfig({
  testDir: './e2e',
  // The API throttles at 600 req/min per IP — keep concurrency modest.
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 3,
  fullyParallel: false,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    locale: 'ro-RO',
    timezoneId: 'Europe/Bucharest',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Reuse a cached Chromium when the default one is not downloaded.
    launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {},
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, teardown: 'cleanup' },
    { name: 'cleanup', testMatch: /global\.teardown\.ts/, use: { storageState: STORAGE_STATE } },
    {
      name: 'desktop',
      testIgnore: /auth\.setup\.ts|global\.teardown\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: STORAGE_STATE,
      },
    },
    {
      name: 'iphone',
      testIgnore: /auth\.setup\.ts|global\.teardown\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['iPhone 13'],
        // Chromium with an iPhone viewport/UA; WebKit is not required.
        browserName: 'chromium',
        defaultBrowserType: 'chromium',
        viewport: { width: 390, height: 844 },
        storageState: STORAGE_STATE,
      },
    },
  ],
});
