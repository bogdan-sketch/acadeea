'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, isToday, startOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  integrations as integrationsApi,
  locations as locationsApi,
  organization as orgApi,
  orgSnapshots,
  recipes as recipesApi,
  roles as rolesApi,
  systemLogs,
  users as usersApi,
  resolveApiUrl,
} from '@/lib/api';
import { usePermissions } from '@/contexts/auth-context';
import { locationTypeLabels } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type {
  CategoryKind,
  Integration,
  Location,
  Organization,
  OrgSnapshot,
  RoleInfo,
  User,
  UserInvitation,
} from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Truncate } from '@/components/truncate';
import { Capsule, IconAction, Pill } from '@/app/(dashboard)/stock/_ui/parts';
import pkg from '../../../../../package.json';
import {
  ChevronRight,
  DatabaseBackup,
  Eraser,
  History,
  ListOrdered,
  Pencil,
  Plug,
  Plus,
  ScrollText,
  Settings2,
  Sparkles,
  Users,
} from 'lucide-react';
import { LogoCard } from './logo-card';
import { Row, Section } from './section';
import { BRAND_NAME } from '@/lib/brand';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.horae.ca';

// ── Rail ────────────────────────────────────────────────────────────────────

type RailItem = { id: string; label: string; title: string; root?: boolean; danger?: boolean };

const RAIL: { group: string; items: RailItem[] }[] = [
  {
    group: 'Firmă',
    items: [
      { id: 'companie', label: 'Companie', title: 'Date firmă pe documente' },
      { id: 'locatii', label: 'Locații', title: 'Magazine, laboratoare, locația implicită' },
      { id: 'categorii', label: 'Categorii', title: 'Categoriile din stoc și rețete' },
    ],
  },
  {
    group: 'Aspect',
    items: [{ id: 'identitate', label: 'Identitate', title: 'Logo-ul firmei' }],
  },
  {
    group: 'Echipă & date',
    items: [
      { id: 'echipa', label: 'Echipă & roluri', title: 'Persoane, invitații, drepturi' },
      { id: 'comenzi-site', label: 'Comenzi din site', title: 'WooCommerce' },
      {
        id: 'backup',
        label: 'Backup & restaurare',
        title: 'Salvări și restaurare · doar root',
        root: true,
      },
      { id: 'jurnal', label: 'Jurnal sistem', title: 'Acțiuni și erori · doar root', root: true },
    ],
  },
  {
    group: 'Altele',
    items: [
      { id: 'noutati', label: 'Noutăți', title: 'Ce s-a schimbat în fiecare versiune' },
      {
        id: 'zona-periculoasa',
        label: 'Zonă periculoasă',
        title: 'Resetare date · doar root',
        root: true,
        danger: true,
      },
    ],
  },
];

const KINDS: { kind: CategoryKind; label: string; title: string }[] = [
  { kind: 'MATERIE_PRIMA', label: 'Materii prime', title: 'Categoriile de materii prime' },
  { kind: 'SEMIPREPARAT', label: 'Semipreparate', title: 'Categoriile de semipreparate' },
  { kind: 'PRODUS_FINIT', label: 'Produse finite', title: 'Categoriile de produse finite' },
];

const INTEGRATION_STATE: Record<string, { label: string; tone: string; dot: string }> = {
  ACTIVE: { label: 'Conectat', tone: 'st-green', dot: 'bg-[var(--st-green)]' },
  ERROR: { label: 'Eroare', tone: 'st-red', dot: 'bg-[var(--st-red)]' },
  INACTIVE: { label: 'Inactiv', tone: 'st-gray', dot: 'bg-[var(--st-gray)]' },
};

const PROVIDER_LABEL: Record<string, string> = { woocommerce: 'WooCommerce', ebriza: 'eBriza' };

/** "azi, 09:30" / "3 sept 2026, 09:30" — day first, 24h. */
function when(iso: string): string {
  const d = new Date(iso);
  return isToday(d) ? `azi, ${format(d, 'HH:mm')}` : format(d, 'd MMM yyyy, HH:mm', { locale: ro });
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

function formatMb(sizeBytes: string): string {
  const mb = (Number(sizeBytes) || 0) / (1024 * 1024);
  return `${mb.toLocaleString('ro-RO', { maximumFractionDigits: 1 })} MB`;
}

/**
 * Profil › Setări — the organisation, one scrollable column of summary cards
 * (each with ONE worded action into its full page) and a sticky anchor rail
 * ≥1180px. Root-only sections (backup, jurnal, zonă periculoasă) are absent
 * for a plain admin.
 */
export function SetariTab() {
  const { can } = usePermissions();
  const isRoot = can('manage', 'all');

  const [org, setOrg] = useState<Organization | null>(null);
  const [locs, setLocs] = useState<Location[]>([]);
  const [kindCats, setKindCats] = useState<Partial<Record<CategoryKind, string[]>>>({});
  const [people, setPeople] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [invites, setInvites] = useState<UserInvitation[]>([]);
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [snapshots, setSnapshots] = useState<OrgSnapshot[] | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [logCounts, setLogCounts] = useState<{ all: number; errors: number } | null>(null);
  const [release, setRelease] = useState<{ version: string; date: string; title: string } | null>(
    null,
  );
  const [active, setActive] = useState<string>('companie');

  useEffect(() => {
    orgApi
      .get()
      .then(setOrg)
      .catch(() => {});
    locationsApi
      .list()
      .then(setLocs)
      .catch(() => {});
    for (const { kind } of KINDS) {
      recipesApi
        .categoryConfigs(kind)
        .then((cats) => setKindCats((p) => ({ ...p, [kind]: cats.map((c) => c.name) })))
        .catch(() => {});
    }
    usersApi
      .list({ page: 1, limit: 200 })
      .then((r) => setPeople(r.data))
      .catch(() => {});
    rolesApi
      .list()
      .then(setRoles)
      .catch(() => {});
    usersApi
      .invitations()
      .then(setInvites)
      .catch(() => {});
    integrationsApi
      .list()
      .then(setIntegrations)
      .catch(() => setIntegrations([]));
    fetch(`${API}/api/v1/changelog`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          d: {
            currentVersion?: string;
            entries?: { version: string; date: string; title: string }[];
          } | null,
        ) => {
          const e = d?.entries?.[0];
          if (e)
            setRelease({ version: d?.currentVersion ?? e.version, date: e.date, title: e.title });
        },
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isRoot) return;
    orgSnapshots
      .list()
      .then((l) =>
        setSnapshots(
          [...l].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        ),
      )
      .catch(() => setSnapshots([]));
    const from = startOfDay(new Date()).toISOString();
    Promise.all([
      systemLogs.list({ page: 1, limit: 1, from }),
      systemLogs.list({ page: 1, limit: 1, from, level: 'ERROR' }),
    ])
      .then(([all, errors]) => setLogCounts({ all: all.total, errors: errors.total }))
      .catch(() => {});
  }, [isRoot]);

  // Jump to the section named in the hash (deep links from sub-pages).
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
      setActive(id);
    }, 50);
    return () => clearTimeout(t);
  }, []);

  // Rail follows the scroll position.
  useEffect(() => {
    const ids = RAIL.flatMap((g) => g.items)
      .filter((i) => !i.root || isRoot)
      .map((i) => i.id);
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: '-10% 0px -70% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [isRoot]);

  const makeDefault = async (loc: Location) => {
    try {
      const updated = await orgApi.update({ defaultLocationId: loc.id });
      setOrg(updated);
      toast.success(`${loc.name} e acum locația implicită pentru orice operațiune`);
    } catch (e) {
      toast.error('Nu am putut schimba locația implicită', {
        description: (e as Error).message,
      });
    }
  };

  const backupNow = useCallback(async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const s = await orgSnapshots.create();
      setSnapshots((p) => [s, ...(p ?? [])]);
      toast.success('Starea a fost salvată');
    } catch (e) {
      toast.error('Salvarea stării a eșuat', { description: (e as Error).message });
    } finally {
      setBackingUp(false);
    }
  }, [backingUp]);

  // ── Derived summaries ─────────────────────────────────────────────────────
  const company = useMemo(() => {
    const v = (s?: string | null) => (s && s.trim() ? s : '—');
    const cuiReg = [org?.cui, org?.regCom].filter(Boolean).join(' · ');
    const contact = [org?.contactEmail, org?.contactPhone].filter(Boolean).join(' · ');
    const tva =
      org == null
        ? '—'
        : org.vatPayer
          ? `Plătitor · cota ${org.vatRatePercent ?? 21}%`
          : 'Neplătitor de TVA';
    return [
      ['Firmă', v(org?.name)],
      ['CUI · Reg. Com.', v(cuiReg)],
      ['TVA', tva],
      ['Sediu (pe documente)', v(org?.legalAddress)],
      ['Contact (pe documente)', v(contact)],
      ['Administrator', v(org?.administratorName)],
    ] as const;
  }, [org]);

  const activePeople = (people ?? []).filter((u) => u.isActive);
  const pendingInvites = invites.filter((i) => !i.acceptedAt && new Date(i.expiresAt) > new Date());
  const rolesWithPeople = roles.filter((r) => r.userCount > 0);
  const teamSub = [
    rolesWithPeople.map((r) => `${r.name} ${r.userCount}`).join(' · ') || null,
    pendingInvites.length
      ? pendingInvites.length === 1
        ? `o invitație în așteptare (${pendingInvites[0].email})`
        : `${pendingInvites.length} invitații în așteptare`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const shop =
    integrations?.find((i) => i.provider.toLowerCase() === 'woocommerce') ?? integrations?.[0];
  const shopState = shop ? (INTEGRATION_STATE[shop.status] ?? INTEGRATION_STATE.INACTIVE) : null;
  const shopSub = shop
    ? [
        shopState?.label,
        shop.lastSyncAt
          ? `ultima sincronizare ${when(shop.lastSyncAt)}`
          : 'nicio sincronizare încă',
        `${plural(shop.mappingsCount, 'produs legat', 'produse legate')} de rețete`,
      ].join(' · ')
    : null;

  const lastSnap = snapshots?.[0];
  const totalCats = KINDS.reduce((n, k) => n + (kindCats[k.kind]?.length ?? 0), 0);

  const railItems = RAIL.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.root || isRoot),
  })).filter((g) => g.items.length);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[208px_minmax(0,1fr)]">
      {/* ── Anchor rail (≥1180) ───────────────────────────────────────── */}
      <nav aria-label="Secțiuni" className="sticky top-4 hidden flex-col gap-0.5 xl:flex">
        {railItems.map((g, gi) => (
          <div key={g.group} className="flex flex-col gap-0.5">
            <span
              className={cn(
                'px-2.5 pb-1 text-[11px] font-bold uppercase tracking-[.6px] text-muted-foreground',
                gi === 0 ? 'pt-1' : 'pt-3.5',
              )}
            >
              {g.group}
            </span>
            {g.items.map((i) => {
              const on = active === i.id;
              return (
                <Link
                  key={i.id}
                  href={`/profil?tab=setari#${i.id}`}
                  title={i.title}
                  aria-current={on ? 'location' : undefined}
                  onClick={() => setActive(i.id)}
                  className={cn(
                    'flex h-9 items-center justify-between gap-2 rounded-[10px] px-2.5 text-[13.5px] whitespace-nowrap transition-colors',
                    on
                      ? 'bg-accent font-bold text-primary-text'
                      : 'font-medium text-foreground/80 hover:bg-muted hover:text-foreground',
                  )}
                >
                  {i.label}
                  {i.danger && (
                    <span
                      aria-hidden
                      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-destructive/10 text-[11px] font-bold text-destructive"
                    >
                      !
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Sections ──────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-5">
        <Section
          id="companie"
          title="Companie"
          desc="Datele firmei tipărite pe avize, etichete și declarații."
          footerNote="Nume, CUI, sediu, contact și regimul de TVA"
          footer={
            <IconAction
              icon={Pencil}
              word="Editează"
              href="/settings/company"
              label="Editează datele firmei"
              title="Deschide formularul Firmă și documente"
            />
          }
        >
          <dl className="grid gap-x-5 gap-y-4 px-6 pb-5 sm:grid-cols-2 lg:grid-cols-3">
            {company.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[12px] font-semibold text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 text-sm">
                  <Truncate text={v} />
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          id="locatii"
          title="Locații"
          desc="Locația implicită e preselectată la stoc nou, transfer, vânzări, consum teste și comenzi de pe site."
          footer={
            <IconAction
              icon={Plus}
              word="Locație nouă"
              href="/stock/locations"
              label="Locație nouă"
              title="Adaugă un depozit, laborator sau punct de vânzare"
            />
          }
          footerNote={plural(locs.length, 'locație', 'locații')}
        >
          {locs.length === 0 && (
            <p className="border-t border-border px-6 py-4 text-[13px] text-muted-foreground">
              Nicio locație încă.
            </p>
          )}
          {locs.map((l) => {
            const on = org?.defaultLocationId === l.id;
            const sub = [locationTypeLabels[l.type] ?? l.type, l.address]
              .filter(Boolean)
              .join(' · ');
            return (
              <Row key={l.id} title={l.name} sub={sub}>
                <Pill
                  on={on}
                  onClick={() => !on && void makeDefault(l)}
                  title={on ? 'Aceasta e locația implicită' : `Fă „${l.name}” locația implicită`}
                >
                  {on ? 'Implicită' : 'Fă implicită'}
                </Pill>
                <IconAction
                  row
                  icon={Pencil}
                  href="/stock/locations"
                  label={`Editează locația ${l.name}`}
                  title="Editează locația: nume, adresă, tip"
                />
              </Row>
            );
          })}
        </Section>

        <Section
          id="categorii"
          title="Categorii"
          desc="Ordinea de aici e ordinea din Stoc, Rețete și de pe iPhone."
          footerNote={totalCats ? plural(totalCats, 'categorie', 'categorii') : undefined}
          footer={
            <IconAction
              icon={ListOrdered}
              word="Gestionează"
              href="/settings/categories"
              label="Gestionează categoriile"
              title="Adaugă, redenumește și ordonează categoriile"
            />
          }
        >
          <div className="grid gap-3 px-6 pb-5 sm:grid-cols-3">
            {KINDS.map((k) => {
              const names = kindCats[k.kind];
              const hint = names?.length
                ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`
                : names
                  ? 'Nicio categorie'
                  : '';
              return (
                <div
                  key={k.kind}
                  title={k.title}
                  className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-muted/60 px-4 py-3.5"
                >
                  <span className="text-[12.5px] font-semibold text-muted-foreground">
                    {k.label}
                  </span>
                  <span className="font-serif text-[28px] font-semibold leading-none">
                    {names ? names.length : '–'}
                  </span>
                  <Truncate text={hint} className="mt-1 text-[12px] text-muted-foreground" />
                </div>
              );
            })}
          </div>
        </Section>

        <LogoCard org={org} onChange={setOrg} />

        <Section
          id="echipa"
          title="Echipă & roluri"
          desc="Persoane, invitații și drepturile fiecărui rol. Are pagina ei în meniu."
        >
          <Row
            lead={
              people && (
                <span className="flex flex-none items-center">
                  {activePeople.slice(0, 3).map((u, i) => (
                    <Avatar
                      key={u.id}
                      className={cn('h-[34px] w-[34px] border-2 border-card', i > 0 && '-ml-2')}
                    >
                      <AvatarImage src={resolveApiUrl(u.avatarUrl)} alt="" />
                      <AvatarFallback className="bg-accent text-[11px] font-bold text-primary-text">
                        {`${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {activePeople.length > 3 && (
                    <span className="-ml-2 inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-card bg-muted text-[11px] font-bold">
                      +{activePeople.length - 3}
                    </span>
                  )}
                </span>
              )
            }
            title={
              people
                ? `${plural(activePeople.length, 'persoană', 'persoane')} · ${plural(rolesWithPeople.length, 'rol', 'roluri')}`
                : 'Echipa'
            }
            sub={teamSub || undefined}
          >
            <IconAction
              icon={Users}
              word="Deschide echipa"
              href="/users"
              label="Deschide echipa"
              title="Persoane, invitații și drepturi pe rol"
            />
          </Row>
        </Section>

        <Section
          id="comenzi-site"
          title="Comenzi din site"
          desc="De unde vin comenzile online. Vânzările din magazin se încarcă din Vânzări → stoc."
        >
          {shop && shopState ? (
            <Row
              lead={<span className={cn('h-2.5 w-2.5 flex-none rounded-full', shopState.dot)} />}
              title={PROVIDER_LABEL[shop.provider.toLowerCase()] ?? shop.provider}
              sub={shopSub}
            >
              <Capsule tone={shopState.tone}>{shopState.label}</Capsule>
              <IconAction
                icon={Settings2}
                word="Configurează"
                href="/integrations"
                label="Configurează conexiunea"
                title="Chei, sincronizare, mapare produse"
              />
            </Row>
          ) : (
            <Row
              lead={<span className="h-2.5 w-2.5 flex-none rounded-full bg-[var(--st-gray)]" />}
              title={<span className="text-muted-foreground">Nicio conexiune</span>}
              sub={integrations ? 'Comenzile se adaugă manual până conectezi magazinul' : undefined}
            >
              <IconAction
                icon={Plug}
                word="Conectează"
                href="/integrations"
                label="Conectează magazinul"
                title="Conectează WooCommerce"
              />
            </Row>
          )}
        </Section>

        {isRoot && (
          <Section
            id="backup"
            title="Backup & restaurare"
            tag="doar root"
            desc="Salvare automată în fiecare noapte; poți salva și restaura oricând."
          >
            <Row
              title={
                lastSnap
                  ? `Ultimul backup: ${when(lastSnap.createdAt)} · ${lastSnap.auto ? 'automat' : 'manual'}`
                  : snapshots
                    ? 'Niciun backup încă'
                    : 'Backup'
              }
              sub={
                snapshots?.length
                  ? `${plural(snapshots.length, 'salvare păstrată', 'salvări păstrate')} · ${formatMb(
                      lastSnap?.sizeBytes ?? '0',
                    )} ultima · fișiere .json.gz`
                  : undefined
              }
            >
              <IconAction
                icon={DatabaseBackup}
                word="Backup acum"
                label="Backup acum"
                title="Salvează starea curentă a datelor"
                spinning={backingUp}
                disabled={backingUp}
                onClick={() => void backupNow()}
              />
              <IconAction
                icon={History}
                word="Vezi salvările"
                href="/settings/backups"
                label="Vezi salvările"
                title="Lista salvărilor, restaurare și descărcare"
              />
            </Row>
          </Section>
        )}

        {isRoot && (
          <Section
            id="jurnal"
            title="Jurnal sistem"
            tag="doar root"
            desc="Acțiuni, erori, autentificări, emailuri, joburi automate și integrări · păstrate 90 de zile."
          >
            <Row
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <Capsule tone="st-gray" size="lg">
                    {logCounts ? `Azi · ${plural(logCounts.all, 'acțiune', 'acțiuni')}` : 'Azi'}
                  </Capsule>
                  {logCounts && (
                    <Capsule tone={logCounts.errors ? 'st-red' : 'st-green'} size="lg">
                      {plural(logCounts.errors, 'eroare', 'erori')}
                    </Capsule>
                  )}
                </span>
              }
            >
              <IconAction
                icon={ScrollText}
                word="Deschide jurnalul"
                href="/settings/logs"
                label="Deschide jurnalul"
                title="Tot ce s-a întâmplat, filtrabil"
              />
            </Row>
          </Section>
        )}

        <Section id="noutati" title="Noutăți" className="[&>header]:hidden">
          <Row
            className="border-t-0"
            lead={
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-accent text-primary-text">
                <Sparkles className="h-[18px] w-[18px]" />
              </span>
            }
            title={`Noutăți · ${BRAND_NAME} ${release?.version ?? pkg.version}${
              release?.date
                ? ` din ${format(new Date(`${release.date}T00:00:00`), 'd MMM yyyy', { locale: ro })}`
                : ''
            }`}
            sub={release?.title ?? 'Ce s-a schimbat, versiune cu versiune — web, iOS, Android'}
          >
            <IconAction
              icon={ChevronRight}
              word="Toate noutățile"
              href="/changelog"
              label="Toate noutățile"
              title="Lista completă a versiunilor"
            />
          </Row>
        </Section>

        {isRoot && (
          <Section
            id="zona-periculoasa"
            title="Zonă periculoasă"
            tag="doar root"
            tone="danger"
            desc="Ștergeri definitive. Fă un backup înainte."
          >
            <Row
              title={<span className="text-destructive">Resetare date</span>}
              sub="Golește selectiv taskuri, comenzi, mișcări sau stocuri — alegi exact ce se șterge. Rețetele, echipa și backup-urile rămân."
            >
              <IconAction
                icon={Eraser}
                word="Resetează date…"
                tone="danger"
                href="/settings/reset"
                label="Resetează date"
                title="Alegi categoriile de șters; cere confirmare scrisă"
              />
            </Row>
          </Section>
        )}
      </div>
    </div>
  );
}
