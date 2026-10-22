import type { Metadata } from 'next';
import { Fraunces, DM_Sans } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from 'next-themes';
import { AuthProvider } from '@/contexts/auth-context';
import { TutorialProvider } from '@/contexts/tutorial-context';
import { TutorialOverlay } from '@/components/tutorial-overlay';
import { PostHogProvider } from '@/components/posthog-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OrgThemeProvider } from '@/components/org-theme-provider';
import { ColorSchemeProvider, SCHEME_BOOT_SCRIPT } from '@/components/color-scheme-provider';
import './globals.css';
import { BRAND_NAME } from '@/lib/brand';

// Redesign (10.2026): DM Sans = UI face, Fraunces = display (titles, big
// numbers). These two are the ONLY bundled families (L-13). A tenant's own
// display face (Organization.fontFamily: lora | inter | manrope | poppins) is
// linked from Google Fonts on demand by OrgThemeProvider, so no page preloads
// seven font files for faces it never paints.
const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin', 'latin-ext'],
});

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin', 'latin-ext'],
  axes: ['opsz'],
});

export const metadata: Metadata = {
  title: `${BRAND_NAME} — Management Producție`,
  description: 'Platformă de management al producției pentru HoReCa — rețete, stocuri, comenzi',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ro"
      className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: SCHEME_BOOT_SCRIPT }} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ColorSchemeProvider>
            <OrgThemeProvider>
              <PostHogProvider>
                <AuthProvider>
                  <TutorialProvider>
                    <TooltipProvider>
                      {children}
                      <Toaster />
                      <TutorialOverlay />
                    </TooltipProvider>
                  </TutorialProvider>
                </AuthProvider>
              </PostHogProvider>
            </OrgThemeProvider>
          </ColorSchemeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
