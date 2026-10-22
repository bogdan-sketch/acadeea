'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { getOrgSlug, isLegacyHost, orgUrl } from '@/lib/tenant';

const DISMISS_KEY = 'legacy-host-banner-dismissed';

/**
 * Shown only on legacy hosts (app.acadeea.ro) during the Horae transition:
 * points users at the new org subdomain without breaking their session.
 * Dismissible per browser.
 */
export function LegacyHostBanner() {
  const [visible, setVisible] = useState(false);
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    if (!isLegacyHost(window.location.host)) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    const slug = getOrgSlug();
    if (!slug) return;
    setNewUrl(orgUrl(slug));
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-primary px-4 py-2 text-[13px] text-primary-foreground">
      <span>
        Acadeea este acum <strong>Horae</strong> — noua adresă este{' '}
        <a href={newUrl} className="underline font-semibold">
          {newUrl.replace('https://', '')}
        </a>
        . Adresa veche va fi redirecționată în curând.
      </span>
      <button
        type="button"
        aria-label="Închide"
        title="Închide"
        className="ml-2 rounded p-0.5 hover:bg-white/20"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, '1');
          setVisible(false);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
