/**
 * Feature gates for work rolled out to the TEST environment first. Same rule
 * as /changelog: a build is "test" when it talks to the test API. Local dev
 * against a localhost API also sees them. Prod (api.horae.ca) never does —
 * the API additionally 404s gated routes there (FEATURE_* env).
 */
const API = process.env.NEXT_PUBLIC_API_URL || '';

const IS_TEST_OR_LOCAL =
  API.includes('api-test') || API.includes('localhost') || API.includes('127.0.0.1');

/** Scădere stoc din vânzări (eBriza Excel / manual / WooCommerce) — live on prod since 1.33.0. */
export const SALES_DEDUCTIONS_ENABLED = true;

/**
 * Poze la rețete (upload, card, antet). Oprit pentru clienții actuali (owner
 * 17.10.2026); codul și API-ul rămân, se pornește când un client le vrea.
 */
export const RECIPE_PHOTOS_ENABLED = false;

/** Kept for the next test-first rollout. */
export const TEST_OR_LOCAL = IS_TEST_OR_LOCAL;
