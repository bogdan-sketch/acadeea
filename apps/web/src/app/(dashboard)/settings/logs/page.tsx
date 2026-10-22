'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Loader2, RefreshCw, ScrollText, Search, X } from 'lucide-react';

import { systemLogs as api } from '@/lib/api';
import type { SystemLog, SystemLogLevel } from '@/lib/types';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/contexts/auth-context';
import { BackLink } from '@/components/back-link';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Truncate } from '@/components/truncate';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { DatePicker } from '@/components/ui/date-picker';
import { CARD, IconAction, PageHead, Pill } from '../../stock/_ui/parts';

const CATEGORIES: { key: string; label: string }[] = [
  { key: '', label: 'Toate' },
  { key: 'HTTP', label: 'Acțiuni' },
  { key: 'AUTH', label: 'Autentificare' },
  { key: 'EMAIL', label: 'Emailuri' },
  { key: 'JOB', label: 'Joburi' },
  { key: 'INTEGRATION', label: 'Integrări' },
  { key: 'SYSTEM', label: 'Sistem' },
];

const LEVELS: { key: SystemLogLevel | ''; label: string; hint: string }[] = [
  { key: '', label: 'Toate nivelurile', hint: 'Info, avertismente și erori' },
  { key: 'WARN', label: 'Avertismente + erori', hint: 'Ascunde intrările informative' },
  { key: 'ERROR', label: 'Doar erori', hint: 'Numai ce a eșuat' },
];

/** 42px bordered shell for a switch + label inside the header row. */
const SWITCH_SHELL =
  'inline-flex h-[42px] items-center gap-2.5 rounded-[var(--radius-ctl)] border border-border bg-card px-3.5 text-[13px] font-semibold';

const levelBadge: Record<SystemLogLevel, { label: string; color: string }> = {
  INFO: { label: 'Info', color: 'st-gray' },
  WARN: { label: 'Atenție', color: 'st-orange' },
  ERROR: { label: 'Eroare', color: 'st-red' },
};

const categoryLabel = (c: string) => CATEGORIES.find((x) => x.key === c)?.label ?? c;
const LIMIT = 50;

/**
 * Jurnal sistem — tot ce se întâmplă în organizație: fiecare acțiune care
 * modifică date, fiecare eroare, autentificări, emailuri trimise/eșuate,
 * joburi automate și integrări. Operatorul platformei poate vedea toate
 * organizațiile + evenimentele de sistem.
 */
export default function SystemLogsPage() {
  const { can } = usePermissions();
  const [rows, setRows] = useState<SystemLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState<SystemLogLevel | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [allOrgs, setAllOrgs] = useState(false);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [live, setLive] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api
      .access()
      .then((a) => setPlatformAdmin(a.platformAdmin))
      .catch(() => {});
  }, []);

  // Debounce the free-text search.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const res = await api.list({
          page,
          limit: LIMIT,
          category: category || undefined,
          level: level || undefined,
          search: search || undefined,
          from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
          allOrgs: allOrgs || undefined,
        });
        setRows(res.data);
        setTotal(res.total);
      } catch (err: unknown) {
        if (!quiet) {
          toast.error((err as { message?: string }).message || 'Nu am putut încărca jurnalul');
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [page, category, level, search, from, to, allOrgs],
  );

  useEffect(() => {
    load();
  }, [load]);

  // "Live": poll every 10s while on.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => load(true), 10_000);
    return () => clearInterval(t);
  }, [live, load]);

  if (!can('manage', 'all')) {
    return (
      <div>
        <BackLink href="/profil?tab=setari#jurnal" label="Profil & setări" />
        <p className="py-16 text-center text-sm text-muted-foreground">
          Doar administratorii pot vedea jurnalul sistemului.
        </p>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="flex flex-col gap-[18px]">
      <BackLink href="/profil?tab=setari#jurnal" label="Profil & setări" />
      <PageHead
        title="Jurnal sistem"
        meta="Acțiuni, erori, autentificări, emailuri, joburi automate și integrări · păstrate 90 de zile"
      >
        <label className={SWITCH_SHELL}>
          <Switch checked={live} onCheckedChange={setLive} />
          Live
        </label>
        {platformAdmin && (
          <label className={SWITCH_SHELL}>
            <Switch
              checked={allOrgs}
              onCheckedChange={(v) => {
                setAllOrgs(v);
                setPage(1);
              }}
            />
            Toate organizațiile
          </label>
        )}
        <IconAction
          icon={RefreshCw}
          word="Reîncarcă"
          label="Reîncarcă jurnalul"
          title="Aduce intrările noi acum"
          onClick={() => load()}
          disabled={loading}
          spinning={loading}
        />
      </PageHead>

      {/* Chip rows (34px): category, then level — no dropdowns (H-5). */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <Pill
            key={c.key || 'all'}
            on={category === c.key}
            onClick={() => {
              setCategory(c.key);
              setPage(1);
            }}
          >
            {c.label}
          </Pill>
        ))}
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        {LEVELS.map((l) => (
          <Pill
            key={l.key || 'all'}
            on={level === l.key}
            title={l.hint}
            onClick={() => {
              setLevel(l.key);
              setPage(1);
            }}
          >
            {l.label}
          </Pill>
        ))}
      </div>

      {/* Control row (42px): search, interval, clear. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex h-[42px] min-w-[240px] max-w-[360px] flex-[1_1_240px] items-center gap-2 rounded-[var(--radius-ctl)] border border-border bg-card px-3.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40">
          <Search aria-hidden className="h-4 w-4 flex-none text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Caută: mesaj, acțiune, email, ID corelare…"
            aria-label="Caută în jurnal"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <DatePicker
          value={from}
          onChange={(v) => {
            setFrom(v);
            setPage(1);
          }}
          placeholder="De la"
          aria-label="De la"
          className="h-[42px] w-[150px]"
        />
        <DatePicker
          value={to}
          onChange={(v) => {
            setTo(v);
            setPage(1);
          }}
          placeholder="Până la"
          aria-label="Până la"
          className="h-[42px] w-[150px]"
        />
        {(from || to) && (
          <IconAction
            icon={X}
            word="Șterge"
            label="Șterge intervalul"
            title="Renunță la filtrul de dată"
            onClick={() => {
              setFrom('');
              setTo('');
              setPage(1);
            }}
          />
        )}
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Nicio intrare pentru filtrele alese"
          description="Lărgește intervalul sau scoate filtrele de categorie și nivel."
        />
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          {/* table-fixed: the message column takes the remaining width and ellipsises (M-13). */}
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-8" />
              <col className="w-[104px]" />
              <col className="w-[88px]" />
              <col className="w-[104px] max-lg:hidden" />
              <col />
              <col className="w-[160px] max-md:hidden" />
              {allOrgs && <col className="w-[140px]" />}
              <col className="w-[72px] min-[1280px]:w-[120px]" />
            </colgroup>
            <thead>
              <tr className="bg-muted text-left text-[11px] font-semibold uppercase tracking-[.4px] text-muted-foreground">
                <th className="px-2 py-2.5" />
                <th className="px-3 py-2.5">Când</th>
                <th className="px-3 py-2.5">Nivel</th>
                <th className="px-3 py-2.5 max-lg:hidden">Tip</th>
                <th className="px-3 py-2.5">Ce s-a întâmplat</th>
                <th className="px-3 py-2.5 max-md:hidden">Cine</th>
                {allOrgs && <th className="px-3 py-2.5">Organizație</th>}
                <th className="px-3 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={allOrgs ? 8 : 7} className="py-12 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const expanded = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={cn(
                          'cursor-pointer border-t border-border hover:bg-muted/50',
                          r.level === 'ERROR' && 'bg-[var(--st-red-bg)]',
                        )}
                        onClick={() => setOpen(expanded ? null : r.id)}
                      >
                        <td className="px-2 py-2.5 text-muted-foreground">
                          {expanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                          {format(new Date(r.createdAt), 'dd.MM HH:mm:ss')}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge
                            label={levelBadge[r.level].label}
                            colorClass={levelBadge[r.level].color}
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground max-lg:hidden">
                          {categoryLabel(r.category)}
                        </td>
                        <td className="min-w-0 px-3 py-2.5">
                          <Truncate text={r.message} className="font-medium" />
                          <Truncate
                            text={r.action}
                            className="font-mono text-[11px] text-muted-foreground"
                          />
                        </td>
                        <td className="min-w-0 px-3 py-2.5 text-muted-foreground max-md:hidden">
                          <Truncate text={r.userEmail ?? '—'} />
                        </td>
                        {allOrgs && (
                          <td className="min-w-0 px-3 py-2.5 text-muted-foreground">
                            <Truncate text={r.organizationName ?? 'sistem'} />
                          </td>
                        )}
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs text-muted-foreground">
                          {r.statusCode ?? ''}
                          {/* Duration only from 1280 up — the column is too narrow below (M-13). */}
                          {r.durationMs != null && (
                            <span className="max-[1279px]:hidden"> · {r.durationMs}ms</span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-t border-border bg-muted/30">
                          <td />
                          <td colSpan={allOrgs ? 7 : 6} className="px-3 py-3 max-lg:[&]:col-span-5">
                            <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-[140px_1fr]">
                              <Detail
                                label="Data"
                                value={format(new Date(r.createdAt), 'dd.MM.yyyy HH:mm:ss')}
                              />
                              <Detail label="Mesaj" value={r.message} />
                              <Detail
                                label="Cerere"
                                value={r.method && r.path ? `${r.method} ${r.path}` : null}
                              />
                              <Detail label="ID corelare" value={r.correlationId} mono />
                              <Detail label="IP" value={r.ip} mono />
                              <Detail label="Utilizator" value={r.userEmail} />
                            </dl>
                            {r.metadata != null && (
                              <pre className="mt-2 max-h-72 overflow-auto rounded-[var(--radius-ctl)] bg-card p-3 text-[11px] leading-relaxed">
                                {JSON.stringify(r.metadata, null, 2)}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} intrări — pagina {page} din {pages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Înapoi
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Înainte
          </Button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('break-all', mono && 'font-mono')}>{value}</dd>
    </>
  );
}
