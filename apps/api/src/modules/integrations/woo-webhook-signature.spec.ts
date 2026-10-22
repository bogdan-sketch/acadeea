import { createHmac } from 'crypto';

import { verifyWooSignature, wooWebhookSecret } from './woo-webhook-signature';

const sign = (body: string, secret: string) =>
  createHmac('sha256', secret).update(body).digest('base64');

describe('WooCommerce webhook signature', () => {
  const body = '{"id":123,"status":"processing","line_items":[]}';
  const secret = 's3cr3t';

  it('accepts the base64 HMAC-SHA256 of the raw body', () => {
    expect(verifyWooSignature(Buffer.from(body), sign(body, secret), secret)).toBe(true);
  });

  it('rejects a wrong secret, a tampered body, or a missing header/body', () => {
    expect(verifyWooSignature(Buffer.from(body), sign(body, 'other'), secret)).toBe(false);
    expect(verifyWooSignature(Buffer.from(body + ' '), sign(body, secret), secret)).toBe(false);
    expect(verifyWooSignature(Buffer.from(body), undefined, secret)).toBe(false);
    expect(verifyWooSignature(undefined, sign(body, secret), secret)).toBe(false);
    expect(verifyWooSignature(Buffer.from(body), 'not-base64!!', secret)).toBe(false);
  });

  it('reads config.webhookSecret, ignoring blanks', () => {
    expect(wooWebhookSecret({ webhookSecret: ' abc ' })).toBe('abc');
    expect(wooWebhookSecret({ webhookSecret: '  ' })).toBeNull();
    expect(wooWebhookSecret({})).toBeNull();
    expect(wooWebhookSecret(null)).toBeNull();
  });
});
