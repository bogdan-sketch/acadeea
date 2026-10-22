import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="text-[13px] font-semibold uppercase tracking-[0.5px] text-muted-foreground">
          Eroare 404
        </span>
        <h1 className="font-serif text-[34px] font-semibold leading-[1.05] tracking-[-0.4px]">
          Pagina nu există
        </h1>
        <p className="text-sm text-muted-foreground">
          Linkul e greșit sau pagina a fost mutată. Întoarce-te la panoul principal și ia-o de
          acolo.
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex h-[42px] items-center rounded-[var(--radius-ctl)] bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-pressed"
        >
          Înapoi la panou
        </Link>
      </div>
    </main>
  );
}
