import { Fraunces } from 'next/font/google';
import { SiteHeader } from '@/components/marketing/site-header';
import { SiteFooter } from '@/components/marketing/site-footer';

// Same display face as the landing so the legal pages read as part of the site.
const fraunces = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  style: ['normal', 'italic'],
});

export default function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`${fraunces.variable} flex min-h-dvh flex-1 flex-col bg-background`}>
      <SiteHeader />
      <main className="flex-1">
        <article
          className={[
            'mx-auto w-full max-w-3xl px-4 py-12 sm:px-6',
            // No typography plugin in this app — style the long-form content
            // through descendant selectors so the pages stay plain markup.
            '[&_h1]:[font-family:var(--font-display),serif] [&_h1]:text-4xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground',
            '[&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground',
            '[&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground',
            '[&_p]:mt-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground',
            '[&_li]:mt-2 [&_li]:text-sm [&_li]:leading-relaxed [&_li]:text-muted-foreground',
            '[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6',
            '[&_a]:text-primary [&_a]:underline-offset-2 [&_a:hover]:underline',
            '[&_strong]:font-semibold [&_strong]:text-foreground',
          ].join(' ')}
        >
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
