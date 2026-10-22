import { describe, expect, it, vi } from 'vitest';
import { createTokenRefresher } from './auth-refresh';

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

const okTokens = () =>
  new Response(JSON.stringify({ accessToken: 'access-2', refreshToken: 'refresh-2' }), {
    status: 200,
  });

function setup(fetchImpl: () => Promise<Response>) {
  const storage = memoryStorage({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  const fetchMock = vi.fn(fetchImpl);
  const refresh = createTokenRefresher({
    refreshUrl: 'https://api.test/api/v1/auth/refresh',
    fetch: fetchMock as unknown as typeof fetch,
    storage,
  });
  return { storage, fetchMock, refresh };
}

describe('createTokenRefresher', () => {
  it('refreshes once for a burst of concurrent 401s and rotates both tokens', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { storage, fetchMock, refresh } = setup(async () => {
      await gate;
      return okTokens();
    });

    const all = Promise.all(Array.from({ length: 5 }, () => refresh('access-1')));
    release();
    expect(await all).toEqual(Array(5).fill('refreshed'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.data.get('accessToken')).toBe('access-2');
    expect(storage.data.get('refreshToken')).toBe('refresh-2');
  });

  it('does not refresh again for a late 401 sent with the already-rotated token', async () => {
    const { fetchMock, refresh } = setup(async () => okTokens());
    expect(await refresh('access-1')).toBe('refreshed');
    expect(await refresh('access-1')).toBe('refreshed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('runs a new refresh once the previous one has finished', async () => {
    const { fetchMock, refresh } = setup(async () => okTokens());
    expect(await refresh('access-1')).toBe('refreshed');
    expect(await refresh('access-2')).toBe('refreshed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])('ends the session only when refresh answers %i', async (status) => {
    const { refresh } = setup(async () => new Response('{}', { status }));
    expect(await refresh('access-1')).toBe('rejected');
  });

  it.each([429, 500, 502, 503])('keeps the user signed in on %i', async (status) => {
    const { storage, refresh } = setup(async () => new Response('{}', { status }));
    expect(await refresh('access-1')).toBe('unavailable');
    expect(storage.data.get('accessToken')).toBe('access-1');
    expect(storage.data.get('refreshToken')).toBe('refresh-1');
  });

  it('keeps the user signed in when offline', async () => {
    const { storage, refresh } = setup(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await refresh('access-1')).toBe('unavailable');
    expect(storage.data.get('refreshToken')).toBe('refresh-1');
  });

  it('keeps the user signed in when the refresh body is not tokens (captive portal)', async () => {
    const { storage, refresh } = setup(async () => new Response('<html>', { status: 200 }));
    expect(await refresh('access-1')).toBe('unavailable');
    expect(storage.data.get('refreshToken')).toBe('refresh-1');
  });

  it('every concurrent caller sees the same failure', async () => {
    const { fetchMock, refresh } = setup(async () => new Response('{}', { status: 503 }));
    const out = await Promise.all([refresh('access-1'), refresh('access-1'), refresh('access-1')]);
    expect(out).toEqual(['unavailable', 'unavailable', 'unavailable']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is rejected without a refresh token', async () => {
    const storage = memoryStorage({ accessToken: 'access-1' });
    const fetchMock = vi.fn();
    const refresh = createTokenRefresher({
      refreshUrl: 'x',
      fetch: fetchMock as unknown as typeof fetch,
      storage,
    });
    expect(await refresh('access-1')).toBe('rejected');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
