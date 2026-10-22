import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

// Fraunces = the landing display face: a soft, "pâtisserie" serif with optical
// sizing, used only for headlines. Body copy stays on the app's Inter.
const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'Horae — Producție și stocuri pentru cofetării',
  description:
    'Horae leagă rețetele, producția, stocurile și livrările într-un singur flux: costuri pe rețetă, sarcini de producție, transferuri între locații și trasabilitate FIFO pe loturi. Fiecare organizație, pe subdomeniul ei.',
};

export default function LandingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${fraunces.variable} flex min-h-dvh flex-1 flex-col bg-background`}>
      <a
        href="#continut"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Sari la conținut
      </a>
      <SiteHeader />
      <main id="continut" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
