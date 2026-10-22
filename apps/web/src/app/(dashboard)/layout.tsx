'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { LegacyHostBanner } from '@/components/legacy-host-banner';
import { AppPreloader } from '@/components/app-preloader';
import { NotificationBell } from '@/components/notification-bell';
import { useHeadCollapse } from '@/hooks/use-head-collapse';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  // Phones: page head hides on scroll down / returns on scroll up; pill rows stay pinned.
  useHeadCollapse();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    // Doar splash-ul cu logo + vortex — fără skeleton care se ițește pe sub el.
    return <AppPreloader />;
  }

  if (!isAuthenticated) return null;

  return (
    <SidebarProvider>
      <AppPreloader />
      <AppSidebar />
      <SidebarInset>
        <LegacyHostBanner />
        {/* Phone/tablet: the bar and the page head stay pinned while the page scrolls (like Producție on iOS). */}
        <header className="flex h-12 items-center gap-2 px-4 max-md:sticky max-md:top-0 max-md:z-30 max-md:bg-background/95 max-md:backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <div className="ml-auto flex items-center">
            <NotificationBell />
          </div>
        </header>
        {/* Prototype .content: generous 40px gutters, roomy bottom. */}
        <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 pb-14 pt-3 sm:px-6 lg:px-10 lg:pt-4">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
