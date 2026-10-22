/**
 * Host classification for Horae multi-tenancy. Pure and edge-safe — used by
 * BOTH the proxy (src/proxy.ts) and client components.
 *
 * Hosts:
 *   horae.ca (apex)            → marketing landing + generic login
 *   <slug>.horae.ca            → that organization's app
 *   app.acadeea.ro (legacy)    → aliased to an org via NEXT_PUBLIC_LEGACY_HOSTS
 *   localhost / 127.0.0.1      → apex (dev)
 *   <slug>.localhost, <slug>.lvh.me → org (dev; *.localhost resolves natively)
 *   *.vercel.app (previews)    → org from ?org= cookie / NEXT_PUBLIC_DEFAULT_ORG_SLUG
 *   standalone build           → every host is NEXT_PUBLIC_STANDALONE_ORG (lib/brand.ts)
 */

import { STANDALONE_ORG } from './brand';

export type HostKind = { type: 'apex' } | { type: 'org'; slug: string } | { type: 'preview' };

/** Root domain of this deployment: 'horae.ca' (prod), 'test.horae.ca' (test), '' (local). */
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || '';

/** 'app.acadeea.ro:acadeea,other.host:slug' → Map(host → slug). */
function parseLegacyHosts(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of (raw ?? '').split(',')) {
    const [host, slug] = entry.split(':').map((s) => s?.trim());
    if (host && slug) map.set(host.toLowerCase(), slug);
  }
  return map;
}
const LEGACY = parseLegacyHosts(process.env.NEXT_PUBLIC_LEGACY_HOSTS);

/** Subdomain labels that are never organization slugs. */
const RESERVED = new Set(['www', 'api', 'app', 'admin', 'mail', 'status']);

export function classifyHost(hostWithPort: string): HostKind {
  if (STANDALONE_ORG) return { type: 'org', slug: STANDALONE_ORG };

  const host = hostWithPort.split(':')[0].toLowerCase();

  const legacySlug = LEGACY.get(host);
  if (legacySlug) return { type: 'org', slug: legacySlug };

  if (ROOT) {
    if (host === ROOT || host === `www.${ROOT}`) return { type: 'apex' };
    if (host.endsWith(`.${ROOT}`)) {
      const label = host.slice(0, -(ROOT.length + 1));
      if (!label.includes('.') && !RESERVED.has(label)) {
        return { type: 'org', slug: label };
      }
      return { type: 'apex' };
    }
  }

  if (host === 'localhost' || host === '127.0.0.1') return { type: 'apex' };
  if (host.endsWith('.localhost') || host.endsWith('.lvh.me')) {
    const label = host.split('.')[0];
    if (label && !RESERVED.has(label)) return { type: 'org', slug: label };
  }

  if (host.endsWith('.vercel.app')) return { type: 'preview' };

  return { type: 'apex' };
}

/** Whether this host is a legacy alias (app.acadeea.ro) — drives the migration banner. */
export function isLegacyHost(hostWithPort: string): boolean {
  if (STANDALONE_ORG) return false;
  return LEGACY.has(hostWithPort.split(':')[0].toLowerCase());
}

/** Client-only: the current org slug, or null on the apex/marketing host. */
export function getOrgSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const kind = classifyHost(window.location.host);
  if (kind.type === 'org') return kind.slug;
  if (kind.type === 'preview') {
    const fromCookie = document.cookie
      .split('; ')
      .find((c) => c.startsWith('preview-org='))
      ?.split('=')[1];
    return fromCookie || process.env.NEXT_PUBLIC_DEFAULT_ORG_SLUG || null;
  }
  return null;
}

/** Client-only convenience. */
export function isApexHost(): boolean {
  if (typeof window === 'undefined') return false;
  return classifyHost(window.location.host).type === 'apex';
}

/** Absolute URL of an organization's app for the current environment. */
export function orgUrl(slug: string, path = '/'): string {
  // Standalone: the one org lives on this very origin.
  if (STANDALONE_ORG) return typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
  if (ROOT) return `https://${slug}.${ROOT}${path}`;
  if (typeof window !== 'undefined') {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${window.location.protocol}//${slug}.localhost${port}${path}`;
  }
  return `http://${slug}.localhost:3000${path}`;
}
