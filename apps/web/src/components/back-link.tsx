'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

/**
 * Design-system back control (accent "‹ Parent" text link, 13.5/600).
 * Pass `href` for a fixed parent page; omit it for history-back on pages
 * reachable from several places. Colour = `--primary-text` (the accent capped
 * to a text-safe lightness), never the raw accent — see globals.css H-2.
 */
export function BackLink({ href, label = 'Înapoi' }: { href?: string; label?: string }) {
  const router = useRouter();
  const className =
    '-ml-1.5 mb-1.5 inline-flex min-h-[32px] items-center gap-0.5 rounded-lg px-1.5 text-[13.5px] font-semibold text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring';
  const content = (
    <>
      <ChevronLeft className="h-[17px] w-[17px]" />
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={() => router.back()} className={`${className} cursor-pointer`}>
      {content}
    </button>
  );
}
