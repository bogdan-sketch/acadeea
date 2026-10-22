/** Shared constants for the e2e suite (kept free of Playwright imports). */
export const STORAGE_STATE = 'e2e/.auth/user.json';
export const API_URL = process.env.E2E_API_URL ?? 'https://api-test.horae.ca';
// Credentials come from the environment only (apps/web/.env.e2e, git-ignored).
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name} (see apps/web/e2e/README or .env.e2e.example)`);
  return v;
}
export const CREDENTIALS = {
  get email() {
    return process.env.E2E_EMAIL ?? 'claude-verify@horae.ca';
  },
  get password() {
    return required('E2E_PASSWORD');
  },
};
/** Every record the suite creates starts with this. */
export const QA_PREFIX = 'QA-E2E-';
