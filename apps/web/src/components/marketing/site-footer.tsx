import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-lg font-semibold tracking-tight text-foreground [font-family:var(--font-display),serif]">
            Horae<span className="text-primary">.</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            © {new Date().getFullYear()} Horae. Producție și stocuri pentru cofetării.
          </p>
        </div>
        <nav aria-label="Linkuri subsol">
          <ul className="flex items-center gap-6">
            <li>
              <Link
                href="/login"
                className="rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Autentificare
              </Link>
            </li>
            <li>
              <Link
                href="/changelog"
                className="rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Noutăți
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                className="rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Confidențialitate
              </Link>
            </li>
            <li>
              <Link
                href="/support"
                className="rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Suport
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
