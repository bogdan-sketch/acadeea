import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from './reveal';

export function Cta() {
  return (
    <section aria-labelledby="cta-titlu" className="px-4 py-24 sm:px-6 lg:py-36">
      <Reveal className="mx-auto max-w-3xl text-center">
        <h2
          id="cta-titlu"
          className="text-balance text-4xl leading-[1.05] font-medium tracking-tight text-foreground [font-family:var(--font-display),serif] sm:text-5xl lg:text-6xl"
        >
          Pune fiecare oră <em className="text-primary">la locul ei.</em>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Horae e platforma pe care laboratorul, magazinele și șoferii o folosesc împreună — din
          prima dimineață.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Intră în cont
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/changelog"
            className="inline-flex items-center rounded-full border border-border bg-card px-8 py-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Vezi noutățile
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
