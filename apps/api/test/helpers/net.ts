import { randomInt } from 'crypto';

/**
 * A fresh fake client IP per call. `trust proxy` is on (like main.ts), so the
 * throttler keys on X-Forwarded-For — tests that exercise many logins use a
 * distinct IP each so the 10/min auth throttle only bites where a test asks it to.
 */
export function freshIp(): { 'X-Forwarded-For': string } {
  return { 'X-Forwarded-For': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` };
}
