/**
 * CORS origin matcher shared by the HTTP server (main.ts) and the Socket.IO
 * gateway. CORS_ORIGINS is a comma-separated list where entries may contain a
 * `*` wildcard in the subdomain position, e.g.:
 *
 *   CORS_ORIGINS=https://horae.ca,https://*.horae.ca,https://*.test.horae.ca,https://app.acadeea.ro
 *
 * `*` alone keeps the permissive legacy behaviour (all origins).
 */

type OriginCallback = (err: Error | null, allow?: boolean) => void;

export function buildCorsOrigin(
  corsOrigins: string,
): boolean | ((origin: string | undefined, cb: OriginCallback) => void) {
  if (corsOrigins === '*') {
    return (_origin, cb) => cb(null, true);
  }

  const entries = corsOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const exact = new Set(entries.filter((e) => !e.includes('*')));
  const patterns = entries
    .filter((e) => e.includes('*'))
    .map(
      (e) =>
        new RegExp(
          // `*` matches one OR MORE labels: https://*.horae.ca must cover both
          // acadeea.horae.ca and acadeea.test.horae.ca (multi-level tenants).
          '^' + e.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9.-]+') + '$',
          'i',
        ),
    );

  return (origin, cb) => {
    // Non-browser clients (no Origin header) are allowed — auth still applies.
    if (!origin) return cb(null, true);
    if (exact.has(origin) || patterns.some((p) => p.test(origin))) {
      return cb(null, true);
    }
    return cb(null, false);
  };
}
