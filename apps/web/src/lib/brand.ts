/**
 * Standalone (on-prem) builds: one organization on its own domain and server,
 * e.g. Acadeea on app.acadeea.ro / api.acadeea.ro. Set at build time:
 *   NEXT_PUBLIC_STANDALONE_ORG=acadeea   every host is that org — no apex
 *                                        landing, no handoff, direct login
 *   NEXT_PUBLIC_BRAND_NAME=Acadeea       replaces the "Horae" wordmark/copy
 * Both empty (default) = the multi-tenant Horae deployment.
 */
export const STANDALONE_ORG = process.env.NEXT_PUBLIC_STANDALONE_ORG || '';
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || 'Horae';
