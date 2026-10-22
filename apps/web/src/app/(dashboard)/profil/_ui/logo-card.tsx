'use client';

import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { organization as orgApi } from '@/lib/api';
import { getOrgSlug } from '@/lib/tenant';
import { applyBranding } from '@/components/org-theme-provider';
import type { Organization } from '@/lib/types';
import { IconAction } from '@/app/(dashboard)/stock/_ui/parts';
import { Section, Row } from './section';

/** Keep the per-slug branding cache (sidebar/splash first frame) in step. */
function refreshCache(updated: Organization) {
  try {
    const slug = getOrgSlug();
    if (slug) {
      const key = `org-branding:${slug}`;
      const cached = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...cached, ...updated }));
    }
  } catch {
    // cache refresh is best-effort
  }
}

type Slot = 'login-light' | 'login-dark';

const SLOTS: { slot: Slot; title: string; hint: string; surface: string }[] = [
  {
    slot: 'login-light',
    title: 'Logo pentru temele luminoase',
    hint: 'PNG transparent, minimum 256 px; apare pe fundal deschis',
    surface: 'bg-[#fbf7ef]',
  },
  {
    slot: 'login-dark',
    title: 'Logo pentru temele întunecate',
    hint: 'Varianta deschisă la culoare; fără ea se folosește logo-ul luminos',
    surface: 'bg-[#1a1416]',
  },
];

function urlFor(org: Organization | null, slot: Slot): string | null {
  if (!org) return null;
  return slot === 'login-dark'
    ? (org.logoDarkUrl ?? org.appLogoDarkUrl ?? null)
    : (org.logoLightUrl ?? org.appLogoLightUrl ?? org.logoUrl ?? null);
}

/**
 * Setări › Identitate — two logos, as on prod: one for the light schemes and
 * one for the dark schemes (sidebar, login, avize). Each saves immediately;
 * deleting the dark one falls back to the light one, deleting both to the
 * firm's initial.
 */
export function LogoCard({
  org,
  onChange,
}: {
  org: Organization | null;
  onChange: (o: Organization) => void;
}) {
  return (
    <Section
      id="identitate"
      title="Identitate"
      desc="Logo-ul firmei pentru temele luminoase și întunecate. Culorile și fontul vin din temă."
    >
      {SLOTS.map((s) => (
        <LogoSlot key={s.slot} org={org} onChange={onChange} {...s} />
      ))}
    </Section>
  );
}

function LogoSlot({
  org,
  onChange,
  slot,
  title,
  hint,
  surface,
}: {
  org: Organization | null;
  onChange: (o: Organization) => void;
  slot: Slot;
  title: string;
  hint: string;
  surface: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const logo = preview ?? urlFor(org, slot);
  const initial = org?.name?.[0]?.toUpperCase() ?? '?';

  const done = (updated: Organization, msg: string) => {
    onChange(updated);
    applyBranding(updated);
    refreshCache(updated);
    toast.success(msg);
  };

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Fișierul trebuie să fie o imagine (PNG recomandat).');
      return;
    }
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      done(await orgApi.uploadLogo(file, slot), 'Logo actualizat');
    } catch (e) {
      setPreview(null);
      toast.error('Nu am putut încărca logo-ul', { description: (e as Error).message });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await orgApi.resetLogo(slot);
      setPreview(null);
      done(updated, 'Logo șters');
    } catch (e) {
      toast.error('Nu am putut șterge logo-ul', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row
      lead={
        <span
          className={`flex h-14 w-24 flex-none items-center justify-center overflow-hidden rounded-[var(--radius-ctl)] border border-border p-1.5 ${surface}`}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={`${title} ${org?.name ?? ''}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <span aria-hidden className="text-[20px] font-bold text-[#8f868c]">
              {initial}
            </span>
          )}
        </span>
      }
      title={title}
      sub={logo ? hint : `Fără logo · ${hint}`}
    >
      <input
        ref={input}
        type="file"
        accept="image/png,image/svg+xml,image/webp,image/jpeg"
        className="hidden"
        aria-label={title}
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <IconAction
        icon={Upload}
        word="Încarcă"
        label={`Încarcă ${title.toLowerCase()}`}
        title="Alege un PNG transparent; se salvează imediat"
        spinning={busy}
        disabled={busy}
        onClick={() => input.current?.click()}
      />
      {logo && (
        <IconAction
          icon={Trash2}
          word="Șterge"
          label={`Șterge ${title.toLowerCase()}`}
          title={slot === 'login-dark' ? 'Revine la logo-ul luminos' : 'Revine la inițiala firmei'}
          disabled={busy}
          onClick={() => void remove()}
        />
      )}
    </Row>
  );
}
