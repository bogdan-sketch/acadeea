'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { organization as orgApi, resolveApiUrl } from '@/lib/api';
import { readCachedBranding, useOrgBranding } from '@/components/org-theme-provider';
import type { Organization } from '@/lib/types';
import {
  LayoutDashboard,
  ClipboardList,
  ShoppingBag,
  Package,
  CookingPot,
  CalendarDays,
  TrendingUp,
  ClipboardCheck,
  BarChart3,
  Users,
  DollarSign,
  ChevronRight,
  GraduationCap,
  ReceiptText,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth, usePermissions } from '@/contexts/auth-context';
import { useTutorial } from '@/contexts/tutorial-context';
import { TutorialAnchor } from '@/components/tutorial-anchor';
import { SALES_DEDUCTIONS_ENABLED } from '@/lib/features';

// Grouped IA from the Claude Design web prototype (web/shell.js): daily
// operations, catalog, then stock & supply. Detail/sub-pages highlight their
// parent item (path prefixes below). User (Profil & setări) + logout live in the
// footer. Counts/search from the prototype are not wired yet.
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  subject: 'all' | 'Task' | 'Order' | 'Recipe' | 'RawMaterial' | 'StockMovement' | 'User';
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Zilnic',
    items: [
      { href: '/', label: 'Panou principal', icon: LayoutDashboard, subject: 'all' },
      { href: '/tasks', label: 'Producție', icon: ClipboardList, subject: 'Task' },
      { href: '/orders', label: 'Comenzi', icon: ShoppingBag, subject: 'Order' },
      { href: '/calendar', label: 'Calendar', icon: CalendarDays, subject: 'Order' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { href: '/recipes', label: 'Rețete', icon: CookingPot, subject: 'Recipe' },
      { href: '/pricing', label: 'Prețuri', icon: DollarSign, subject: 'Recipe' },
    ],
  },
  {
    label: 'Stoc',
    items: [
      { href: '/stock', label: 'Stoc', icon: Package, subject: 'RawMaterial' },
      { href: '/stock/movements', label: 'Mișcări', icon: TrendingUp, subject: 'StockMovement' },
      {
        href: '/stock/review',
        label: 'Revizie stocuri',
        icon: ClipboardCheck,
        subject: 'RawMaterial',
      },
      // Test-only rollout (lib/features.ts) — filtered out below when off.
      {
        href: '/stock/sales',
        label: 'Vânzări → stoc',
        icon: ReceiptText,
        subject: 'StockMovement',
      },
    ],
  },
  {
    label: 'Echipă',
    items: [
      { href: '/stats', label: 'Statistici', icon: BarChart3, subject: 'Task' },
      { href: '/users', label: 'Echipă & roluri', icon: Users, subject: 'User' },
    ],
  },
];

// /stock/* sub-pages that have their own menu item and must NOT light "Stoc".
// Transferuri, Necesar, Furnizori, Locații, Expirări etc. are no longer in the
// menu (reached from Stoc quick actions) and highlight "Stoc".
const STOCK_SIBLINGS = ['/stock/movements', '/stock/review', '/stock/sales'];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  // Pe mobil sheet-ul trebuie să se închidă imediat ce alegi o destinație.
  const { setOpenMobile } = useSidebar();
  const closeMobile = () => setOpenMobile(false);
  const { resolvedTheme } = useTheme();
  const [org, setOrg] = useState<Organization | null>(null);
  // Brand name/logo BEFORE the authenticated org call resolves (L-6): the
  // public branding is cached per slug in localStorage and read synchronously
  // on first render (the sidebar only ever mounts on the client, behind the
  // auth gate), then the live context value, then the full Organization.
  const liveBranding = useOrgBranding();
  const [cachedBranding] = useState(() => readCachedBranding());
  const brand = org ?? liveBranding ?? cachedBranding;

  useEffect(() => {
    orgApi
      .get()
      .then(setOrg)
      .catch(() => {});
  }, []);

  // ONE transparent PNG (Setări › Identitate) on every scheme; a dark-only
  // file from the old two-slot model still wins on dark schemes if present.
  const lightLogo = brand?.logoLightUrl || brand?.appLogoLightUrl;
  const appLogo =
    resolvedTheme === 'dark' ? brand?.logoDarkUrl || brand?.appLogoDarkUrl || lightLogo : lightLogo;
  const brandName = brand?.name ?? null;
  const { can } = usePermissions();

  const { enabled: tutorialEnabled } = useTutorial();
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (item) =>
        (item.href !== '/stock/sales' || SALES_DEDUCTIONS_ENABLED) &&
        (item.subject === 'all' || can('read', item.subject)),
    ),
  })).filter((g) => g.items.length > 0);
  // Only shown when an admin has turned tutorial mode on for the org.
  if (tutorialEnabled) {
    groups.push({
      label: 'Ajutor',
      items: [{ href: '/help', label: 'Centru de ajutor', icon: GraduationCap, subject: 'all' }],
    });
  }

  const initials = user
    ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase()
    : '?';

  const isItemActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/stock')
      return pathname.startsWith('/stock') && !STOCK_SIBLINGS.some((s) => pathname.startsWith(s));
    if (href === '/users') return pathname.startsWith('/users') || pathname.startsWith('/roles');
    if (href === '/orders')
      return pathname.startsWith('/orders') && !pathname.startsWith('/orders/calendar');
    if (href === '/calendar')
      return pathname.startsWith('/calendar') || pathname.startsWith('/orders/calendar');
    return pathname.startsWith(href);
  };

  return (
    <Sidebar>
      <SidebarHeader className="px-4 pb-1 pt-5">
        <Link href="/" prefetch={false} className="flex h-[30px] items-center gap-2.5 px-1">
          {appLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={appLogo}
              alt={brandName || 'Logo'}
              className="h-[26px] w-auto max-w-[150px] object-contain object-left"
            />
          ) : brandName ? (
            // Serif wordmark in the accent color (as on prod).
            <span className="font-serif text-[19px] font-bold text-primary-text">{brandName}</span>
          ) : (
            // Nothing cached yet: skeleton, never a wrong name that flips later.
            <span aria-hidden className="h-[19px] w-28 animate-pulse rounded-full bg-muted" />
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-0">
            <div className="px-2.5 pb-1 pt-3.5 text-[12px] font-bold uppercase tracking-[.6px] text-muted-foreground first:pt-1">
              {group.label}
            </div>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isItemActive(item.href)}
                      className="rounded-[10px] px-2.5 py-[9px] text-sm font-medium hover:bg-muted data-[active=true]:bg-accent data-[active=true]:font-bold data-[active=true]:text-primary-text"
                    >
                      {/* prefetch=false: the always-visible sidebar was
                          re-prefetching every route's ?_rsc payload on a short
                          TTL — pages are client-heavy, on-click fetch is cheap. */}
                      <Link
                        href={item.href}
                        prefetch={false}
                        onClick={closeMobile}
                        className="flex w-full items-center gap-[11px]"
                      >
                        <item.icon className="h-[19px] w-[19px]" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border pt-3">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            {/* ONE footer entry: the user row opens Profil & setări (Date +
                Setări tabs); the old "Setări" gear went with the hub. Active
                on /profil and on the /settings/* sub-pages. */}
            <TutorialAnchor id="auth.basics.account">
              <Link
                href="/profil"
                prefetch={false}
                onClick={closeMobile}
                title="Profil & setări — datele tale și setările firmei"
                data-active={
                  pathname.startsWith('/profil') || pathname.startsWith('/settings') || undefined
                }
                className="flex cursor-pointer items-center gap-2.5 rounded-[11px] px-3 py-[9px] hover:bg-muted data-[active]:bg-sidebar-accent"
              >
                <Avatar className="h-[34px] w-[34px]">
                  <AvatarImage src={resolveApiUrl(user?.avatarUrl)} alt="" />
                  <AvatarFallback className="bg-accent text-xs font-bold text-primary-text">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                  <span className="w-full truncate text-[13.5px] font-semibold leading-tight">
                    {user?.firstName} {user?.lastName}
                  </span>
                  <span className="w-full truncate text-[11.5px] text-muted-foreground">
                    Profil & setări
                  </span>
                </div>
                <ChevronRight className="h-[15px] w-[15px] flex-none text-muted-foreground" />
              </Link>
            </TutorialAnchor>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
