import { NextResponse, type NextRequest } from 'next/server';

import { classifyHost } from '@/lib/tenant';

/**
 * Host-based routing (Next 16 proxy — the middleware.ts successor):
 *   - apex (horae.ca): `/` is rewritten to the marketing landing (/landing);
 *     a direct /landing hit 308s back to the canonical `/`.
 *   - org subdomains pass through untouched — the existing route tree serves
 *     them ((dashboard)/page.tsx keeps owning `/`).
 *   - Vercel previews: `?org=<slug>` is persisted in a cookie so getOrgSlug()
 *     can resolve a tenant without a real subdomain.
 */
export function proxy(req: NextRequest) {
  const kind = classifyHost(req.headers.get('host') ?? '');
  const { pathname, searchParams } = req.nextUrl;

  if (kind.type === 'apex') {
    if (pathname === '/') {
      return NextResponse.rewrite(new URL('/landing', req.url));
    }
    if (pathname === '/landing') {
      return NextResponse.redirect(new URL('/', req.url), 308);
    }
  }

  if (kind.type === 'preview' && searchParams.has('org')) {
    const res = NextResponse.next();
    res.cookies.set('preview-org', searchParams.get('org') ?? '', { path: '/' });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets, Next internals and the Sentry tunnel.
  matcher: ['/((?!_next|monitoring|favicon\\.ico|.*\\..*).*)'],
};
