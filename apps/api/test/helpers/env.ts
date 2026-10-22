/**
 * Jest setupFile for the e2e suite — runs before any spec imports AppModule.
 *
 * Defaults every required env var to the LOCAL disposable stack
 * (test/e2e-db.sh: docker postgres on 127.0.0.1:5455, redis on :6390)
 * and refuses to run against anything that is not a local database, so the
 * suite can never touch prod or the shared test environment.
 */
import * as os from 'os';
import * as path from 'path';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://horae:horae_e2e@127.0.0.1:5455/horae_e2e?schema=public',
  REDIS_URL: 'redis://127.0.0.1:6390',
  JWT_PRIVATE_KEY_PATH: path.join(__dirname, '..', '..', 'keys', 'jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: path.join(__dirname, '..', '..', 'keys', 'jwt-public.pem'),
  JWT_ACCESS_EXPIRY: '15m',
  JWT_REFRESH_EXPIRY: '7d',
  S3_ENDPOINT: 'http://127.0.0.1:9',
  S3_BUCKET: 'horae-e2e',
  S3_ACCESS_KEY: 'e2e',
  S3_SECRET_KEY: 'e2e',
  CORS_ORIGINS: '*',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '9',
  FEATURE_SALES_DEDUCTIONS: 'true',
  SENTRY_DSN: '',
  POSTHOG_API_KEY: '',
  LOG_LEVEL: 'silent',
  BACKUP_DIR: path.join(os.tmpdir(), 'horae-e2e-backups'),
  PLATFORM_ADMIN_EMAILS: '',
};

for (const [k, v] of Object.entries(defaults)) {
  if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
}

const dbHost = new URL(process.env.DATABASE_URL as string).hostname;
if (!LOCAL_HOSTS.has(dbHost)) {
  throw new Error(
    `[e2e] DATABASE_URL host "${dbHost}" is not local — refusing to run e2e tests against a shared/prod database.`,
  );
}
