'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { organization as orgApi } from '@/lib/api';
import { getOrgSlug } from '@/lib/tenant';
import type { OrgBranding } from '@/lib/types';

/**
 * Org branding on its subdomain, reduced on 17.10.2026 to what is not a theme:
 *   - logo → favicon (logoLightUrl → appLogoLightUrl → logoUrl; none → Horae).
 *   - name/logo cached per slug in localStorage for the splash and sidebar.
 * Colours and fonts come from the six designed schemes only
 * (color-scheme-provider + globals.css); a stylesheet injected by an older
 * build (`#org-theme`) is removed on mount.
 */

/**
 * Point the browser tab at the org logo (or the default Horae icon).
 *
 * CRITICAL: never remove the `<link rel="icon">` nodes Next renders from the
 * app/icon convention — they belong to React's head reconciliation, and deleting
 * them makes React throw "Cannot read properties of null (reading 'removeChild')"
 * on the next navigation, which tears down the whole client tree (frozen nav,
 * stuck handoff). Instead own a SINGLE dedicated link by id and only update its
 * href; appended last, the browser prefers it over Next's default.
 */
function applyFavicon(href: string | null) {
  const id = 'org-favicon';
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'icon';
  }
  link.href = href ?? '/horae-icon.png';
  // Re-append our OWN node so it sits last — browsers prefer the last icon link,
  // so the org logo wins over Next's default. Moving our node is safe; we never
  // touch React-managed icon links.
  document.head.appendChild(link);
}

/**
 * Which CSS custom properties each web branding token drives. This is the
 * web token → variable contract (also documented on the Branding settings
 * page): everything the branding should visibly re-skin reads one of these.
 * Status colors (--st-*) are never listed here — they stay fixed.
 */
/** Remove the per-tenant stylesheet older builds injected. */
function applyThemeCss(css: string) {
  const el = document.getElementById('org-theme');
  if (!css) {
    el?.remove();
    return;
  }
  (el ?? Object.assign(document.createElement('style'), { id: 'org-theme' })).textContent = css;
}

/**
 * Apply branding to the live document + refresh the per-slug localStorage
 * cache. Exported so Settings can re-theme the app IMMEDIATELY after saving
 * new brand colors — without it the change only shows after a reload, which
 * reads as "the colors are hardcoded".
 */
export function applyBranding(
  branding: Pick<
    OrgBranding,
    | 'accentColor'
    | 'secondaryColor'
    | 'tertiaryColor'
    | 'brandingTokens'
    | 'fontFamily'
    | 'appLogoLightUrl'
    | 'logoLightUrl'
    | 'logoUrl'
  >,
) {
  // Older builds set these inline on <html> (inline beats any stylesheet) —
  // clear them so the per-scheme stylesheet below is authoritative.
  const root = document.documentElement;
  for (const cssVar of [
    '--primary',
    '--primary-pressed',
    '--primary-foreground',
    '--brand-secondary',
    '--brand-tertiary',
    '--radius',
    '--radius-sheet',
    '--font-sans',
    '--font-serif-stack',
  ]) {
    root.style.removeProperty(cssVar);
  }

  // Since 17.10.2026 the six designed colour schemes are the only themes:
  // tenant accent/secondary/tertiary colours, token overrides and display
  // fonts are no longer applied (owner: "6 teme standard, fără nimic loose";
  // a custom theme becomes a designed scheme if a client ever asks). Any
  // stylesheet injected by an older build is removed so the scheme wins.
  void branding;
  applyThemeCss('');
  // Simplified logo model: ONE logo per theme — logoLightUrl is the org logo;
  // appLogo*/logoUrl remain only as fallbacks for stale cached branding.
  applyFavicon(branding.logoLightUrl ?? branding.appLogoLightUrl ?? branding.logoUrl ?? null);
}

/**
 * The per-slug branding cache, read synchronously (no await, no flash). Used
 * by the splash and the sidebar so the org name/logo/accent are right on the
 * very first client frame; null on the apex host, with no cache, or on the
 * server.
 */
export function readCachedBranding(): OrgBranding | null {
  try {
    const slug = getOrgSlug();
    if (!slug) return null;
    const raw = localStorage.getItem(`org-branding:${slug}`);
    return raw ? (JSON.parse(raw) as OrgBranding) : null;
  } catch {
    return null;
  }
}

const OrgBrandingContext = createContext<OrgBranding | null>(null);

export function OrgThemeProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<OrgBranding | null>(null);

  useEffect(() => {
    // Settings → Branding dispatches this right after a successful save so
    // every useOrgBranding() consumer re-renders with the fresh values
    // (applyBranding + the localStorage cache are handled by the page).
    const onBrandingUpdated = (e: Event) => {
      const fresh = (e as CustomEvent<OrgBranding>).detail;
      if (fresh) setBranding((prev) => ({ ...prev, ...fresh }));
    };
    window.addEventListener('horae:branding-updated', onBrandingUpdated);

    const slug = getOrgSlug();
    if (!slug) {
      // apex/marketing host — default Horae brand
      return () => window.removeEventListener('horae:branding-updated', onBrandingUpdated);
    }

    const cacheKey = `org-branding:${slug}`;

    // 1. Synchronous cache hit — no accent/font flash on reload.
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as OrgBranding;
        applyBranding(parsed);
        setBranding(parsed);
      }
    } catch {
      // corrupt cache — ignore
    }

    // 2. Fresh fetch from the public endpoint.
    orgApi
      .getBySlug(slug)
      .then((fresh) => {
        applyBranding(fresh);
        setBranding(fresh);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(fresh));
        } catch {
          // storage full — ignore
        }
      })
      .catch(() => {
        // unknown/inactive org — keep defaults
      });

    return () => window.removeEventListener('horae:branding-updated', onBrandingUpdated);
  }, []);

  return <OrgBrandingContext.Provider value={branding}>{children}</OrgBrandingContext.Provider>;
}

/** The current org's public branding (null on apex or before it loads). */
export function useOrgBranding() {
  return useContext(OrgBrandingContext);
}
