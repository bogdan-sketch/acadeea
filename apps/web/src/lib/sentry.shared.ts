// Shared Sentry options. Sentry is fully opt-in: with no DSN set, init is a
// no-op (Sentry's SDK does nothing when `dsn` is undefined), so the app builds
// and runs identically with empty env vars.
export const SENTRY_TRACES_SAMPLE_RATE = 0.1;
