import { createHmac, timingSafeEqual } from 'crypto';

/**
 * WooCommerce webhook authentication.
 *
 * Woo signs every webhook delivery with `X-WC-Webhook-Signature`:
 * base64(HMAC-SHA256(rawBody, secret)), where `secret` is the value entered in
 * WooCommerce › Settings › Advanced › Webhooks › Secret. The same value is
 * stored on the Horae integration as `config.webhookSecret`
 * (PATCH /api/v1/integrations/:id { config: { ..., webhookSecret } }).
 *
 * The HMAC must be computed over the EXACT bytes Woo sent — never over a
 * re-serialised JSON body (key order / escaping would differ).
 */

/** The webhook secret stored on an integration's config, or null if none. */
export function wooWebhookSecret(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null;
  const raw = (config as Record<string, unknown>)['webhookSecret'];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Constant-time check of `X-WC-Webhook-Signature` against the raw body. */
export function verifyWooSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let given: Buffer;
  try {
    given = Buffer.from(signature.trim(), 'base64');
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
