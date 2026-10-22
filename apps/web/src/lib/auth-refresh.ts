/**
 * Access-token refresh, shared by every API call (same contract as the iOS
 * `AuthInterceptor` and the Android `AuthInterceptor`):
 *
 * - Single flight: the server ROTATES the refresh token (revokes the old one) on
 *   every refresh, so a burst of concurrent 401s must share ONE refresh — the
 *   others would send a revoked token and force a logout.
 * - A late 401 for a request sent with an access token that has since been
 *   rotated does not refresh again; the caller just retries with the new token.
 * - The session ends ONLY when the refresh endpoint itself answers 401/403
 *   (`rejected`) or there is no refresh token. 429 (shared shop IP), 5xx,
 *   offline or a captive-portal page are `unavailable`: tokens stay, the user
 *   stays signed in and the next request tries again.
 */
export type RefreshOutcome = 'refreshed' | 'rejected' | 'unavailable';

interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createTokenRefresher(opts: {
  refreshUrl: string;
  fetch: typeof fetch;
  storage: TokenStorage;
}): (rejectedAccessToken?: string | null) => Promise<RefreshOutcome> {
  let inFlight: Promise<RefreshOutcome> | null = null;

  const run = async (): Promise<RefreshOutcome> => {
    const refreshToken = opts.storage.getItem('refreshToken');
    if (!refreshToken) return 'rejected';
    let res: Response;
    try {
      res = await opts.fetch(opts.refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      return 'unavailable';
    }
    if (res.status === 401 || res.status === 403) return 'rejected';
    if (!res.ok) return 'unavailable';
    try {
      const data = (await res.json()) as { accessToken?: unknown; refreshToken?: unknown };
      if (typeof data.accessToken !== 'string' || typeof data.refreshToken !== 'string') {
        return 'unavailable';
      }
      opts.storage.setItem('accessToken', data.accessToken);
      opts.storage.setItem('refreshToken', data.refreshToken);
      return 'refreshed';
    } catch {
      return 'unavailable';
    }
  };

  return (rejectedAccessToken) => {
    if (inFlight) return inFlight;
    const current = opts.storage.getItem('accessToken');
    if (rejectedAccessToken && current && current !== rejectedAccessToken) {
      return Promise.resolve('refreshed');
    }
    inFlight = run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
