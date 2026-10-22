'use client';

import { STICKY_HEAD } from '@/lib/sticky-head';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, usePermissions } from '@/contexts/auth-context';
import { organization as orgApi, resolveApiUrl } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { LogOut } from 'lucide-react';
import { IconAction } from '../stock/_ui/parts';
import { DateTab } from './_ui/date-tab';
import { SetariTab } from './_ui/setari-tab';

type Tab = 'date' | 'setari';

const TABS: { key: Tab; label: string; title: string }[] = [
  { key: 'date', label: 'Date', title: 'Datele tale, poză, preferințe, securitate' },
  { key: 'setari', label: 'Setări', title: 'Firmă, locații, categorii, echipă, backup' },
];

/**
 * Profil & setări — ONE page, two tabs: Date (personal, everyone) and Setări
 * (the organisation, admins only — `?tab=setari`). One PageHead: 64px avatar,
 * meta "email · rol · firmă", serif name, segmented control on the right.
 */
function ProfilPage() {
  const { user, logout } = useAuth();
  const { can } = usePermissions();
  const isOrgAdmin = can('update', 'Organization');
  const router = useRouter();
  const params = useSearchParams();
  const wanted = params.get('tab') === 'setari' ? 'setari' : 'date';
  const tab: Tab = isOrgAdmin ? wanted : 'date';
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    orgApi
      .get()
      .then((o) => setOrgName(o.name))
      .catch(() => {});
  }, []);

  const select = (t: Tab) => {
    if (t === tab) return;
    router.replace(t === 'setari' ? '/profil?tab=setari' : '/profil', { scroll: false });
  };

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || '—';
  const meta = [user?.email, user?.role?.name, orgName].filter(Boolean).join(' · ');

  return (
    <div className="flex flex-col gap-5">
      <header className={`flex flex-wrap items-end justify-between gap-4 ${STICKY_HEAD}`}>
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="h-16 w-16 flex-none">
            <AvatarImage src={resolveApiUrl(user?.avatarUrl)} alt="" />
            <AvatarFallback className="bg-accent font-serif text-[22px] font-semibold text-primary-text">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-[13px] font-semibold text-muted-foreground" title={meta}>
              {meta}
            </span>
            <h1 className="truncate font-serif text-[28px] font-semibold leading-[1.05] tracking-[-0.4px] sm:text-[34px]">
              {user?.firstName} {user?.lastName}
            </h1>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          {isOrgAdmin && (
            <div
              role="tablist"
              aria-label="Profil & setări"
              className="inline-flex h-[42px] w-full gap-0.5 rounded-[var(--radius-ctl)] bg-muted p-[3px] sm:w-auto"
            >
              {TABS.map((t) => {
                const on = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    title={t.title}
                    onClick={() => select(t.key)}
                    className={cn(
                      'flex flex-1 cursor-pointer items-center justify-center rounded-[9px] px-5 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/60 sm:min-w-[96px] sm:flex-none',
                      on
                        ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.08)]'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
          <IconAction
            icon={LogOut}
            word="Deconectare"
            label="Deconectare"
            title="Ieși din cont pe acest dispozitiv"
            onClick={() => void logout()}
          />
        </div>
      </header>

      {tab === 'setari' ? <SetariTab /> : <DateTab />}
    </div>
  );
}

export default function ProfilRoute() {
  // useSearchParams needs a Suspense boundary for the static shell.
  return (
    <Suspense fallback={null}>
      <ProfilPage />
    </Suspense>
  );
}
