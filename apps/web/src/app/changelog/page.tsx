'use client';

import { useEffect, useState } from 'react';

import { BackLink } from '@/components/back-link';
import { cn } from '@/lib/utils';

/**
 * Public release-notes page — a standalone route outside the (dashboard) group
 * (no auth token, fetches the API directly) that nevertheless LOOKS like an app
 * page (L-10): serif PageHead title, card tokens, 42px segmented filter, body
 * text ≥12px and a back link into the app. Linked from Setări › Noutăți.
 */

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.horae.ca';

type Platform = 'web' | 'ios' | 'android' | 'api';

interface ChangelogItem {
  text: string;
  platforms: Platform[];
}

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  highlights: string[];
  nou: ChangelogItem[];
  imbunatatiri: ChangelogItem[];
  reparat: ChangelogItem[];
  platforms: Platform[];
}

interface ChangelogResponse {
  currentVersion: string;
  entries: ChangelogEntry[];
}

const PLATFORM_LABELS: Record<Platform, string> = {
  web: 'Web',
  ios: 'iOS',
  android: 'Android',
  api: 'API',
};

// Platform filter tabs. `all` (Toate) keeps every item — including API-only
// ones; the per-platform tabs only match items tagged with that platform, so
// API items surface exclusively under Toate.
type Tab = 'all' | 'web' | 'ios' | 'android';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'Toate' },
  { key: 'web', label: 'Web' },
  { key: 'ios', label: 'iOS' },
  { key: 'android', label: 'Android' },
];

/**
 * Items visible for a tab: everything on Toate, else only those tagged with it.
 * Defensive against deploy skew — an old API payload may omit `platforms` or
 * `text`, so drop textless items and treat a missing `platforms` as empty.
 */
function filterItems(items: ChangelogItem[] | undefined, tab: Tab): ChangelogItem[] {
  const valid = (items ?? []).filter(
    (it) => it && typeof it.text === 'string' && it.text.length > 0,
  );
  if (tab === 'all') return valid;
  return valid.filter((it) => (it.platforms ?? []).includes(tab));
}

function formatDate(iso: string): string {
  if (!iso) return '';
  // Parse a bare 'yyyy-mm-dd' as local midnight (append the time) so it isn't
  // read as UTC-midnight and shifted back a day in negative-offset timezones.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function PlatformBadges({ platforms }: { platforms: Platform[] }) {
  const list = platforms ?? [];
  if (!list.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {list.map((p) => (
        <span
          key={p}
          className="rounded-md bg-muted px-1.5 py-[1px] text-[12px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {PLATFORM_LABELS[p]}
        </span>
      ))}
    </span>
  );
}

function ChangeSection({
  label,
  items,
  color,
}: {
  label: string;
  items: ChangelogItem[];
  color: string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-2 text-[12px] font-bold uppercase tracking-[.5px]" style={{ color }}>
        {label}
      </div>
      <ul className="space-y-2.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed text-foreground">
            <span
              className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: color }}
              aria-hidden
            />
            <span className="min-w-0">
              <span>{it.text}</span>
              <PlatformBadges platforms={it.platforms ?? []} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ChangelogPage() {
  // Test-only gate. Constant condition → hook order stays stable.

  const [data, setData] = useState<ChangelogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/v1/changelog`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ChangelogResponse) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Apply the active platform filter, dropping entries with nothing to show.
  const visibleEntries = (data?.entries ?? [])
    .map((entry) => ({
      entry,
      nou: filterItems(entry.nou, tab),
      imbunatatiri: filterItems(entry.imbunatatiri, tab),
      reparat: filterItems(entry.reparat, tab),
    }))
    .filter((e) => e.nou.length || e.imbunatatiri.length || e.reparat.length);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 pb-14 pt-6 sm:px-6 lg:px-10 lg:pt-8">
        <BackLink href="/" label="Înapoi la aplicație" />
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-muted-foreground">
              Ce s-a schimbat în Horae, pe toate platformele
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-[34px] font-semibold leading-[1.05] tracking-[-0.4px]">
                Noutăți
              </h1>
              {data?.currentVersion && (
                <span className="rounded-full bg-accent px-3 py-1 text-[13px] font-semibold text-accent-foreground">
                  v{data.currentVersion}
                </span>
              )}
            </div>
          </div>

          {/* Platform filter — same 42px segmented control as the app headers. */}
          <div
            role="tablist"
            aria-label="Filtrează pe platformă"
            className="inline-flex h-[var(--ctl-h)] gap-0.5 rounded-[var(--radius-ctl)] bg-muted p-1"
          >
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'cursor-pointer rounded-[9px] px-3.5 text-[13px] font-bold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
                    active
                      ? 'bg-card text-foreground shadow-(--shadow-card-sm)'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </header>

        {loading && (
          <div className="space-y-4" aria-hidden>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rounded-[var(--radius-card)] border border-border bg-card shadow-(--shadow-card-sm) p-6"
              >
                <div className="h-5 w-40 animate-pulse rounded-full bg-muted" />
                <div className="mt-4 h-4 w-3/4 animate-pulse rounded-full bg-muted" />
                <div className="mt-6 space-y-2">
                  <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
                  <div className="h-3 w-5/6 animate-pulse rounded-full bg-muted" />
                  <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-[var(--radius-card)] border border-border bg-card shadow-(--shadow-card-sm) p-6 text-[14px] text-muted-foreground">
            Nu am putut încărca noutățile. Încearcă din nou mai târziu.
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-4">
            {visibleEntries.length === 0 && (
              <div className="rounded-[var(--radius-card)] border border-border bg-card shadow-(--shadow-card-sm) p-6 text-[14px] text-muted-foreground">
                Nicio schimbare pentru această platformă.
              </div>
            )}

            {visibleEntries.map(({ entry, nou, imbunatatiri, reparat }) => (
              <article
                key={entry.version}
                className="rounded-[var(--radius-card)] border border-border bg-card shadow-(--shadow-card-sm) p-6 sm:p-7"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-[12px] font-semibold text-accent-foreground">
                    v{entry.version}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {formatDate(entry.date)}
                  </span>
                </div>

                <h2 className="mt-3 font-serif text-[20px] font-semibold leading-snug tracking-[-0.2px]">
                  {entry.title}
                </h2>

                <div className="mt-5 space-y-5">
                  <ChangeSection label="Nou" items={nou} color="var(--primary-text)" />
                  <ChangeSection label="Îmbunătățiri" items={imbunatatiri} color="var(--st-blue)" />
                  <ChangeSection label="Reparat" items={reparat} color="var(--st-green)" />
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="mt-14 border-t border-border pt-6 text-center text-[12px] text-muted-foreground">
          Horae
        </footer>
      </div>
    </main>
  );
}
