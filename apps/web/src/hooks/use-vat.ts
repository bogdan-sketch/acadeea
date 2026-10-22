'use client';

import { useEffect, useState } from 'react';
import { organization as orgApi } from '@/lib/api';

export interface VatSettings {
  /** Plătitor de TVA — stored purchase prices are net; otherwise gross. */
  vatPayer: boolean;
  vatRatePercent: number;
  loaded: boolean;
}

/**
 * Org VAT settings for price-entry forms: the cu/fără TVA toggle defaults to
 * the org's natural invoice form (payers usually type the net price, but can
 * flip the toggle and let the API strip VAT — and vice versa).
 */
export function useVatSettings(): VatSettings {
  const [settings, setSettings] = useState<VatSettings>({
    vatPayer: true,
    vatRatePercent: 21,
    loaded: false,
  });
  useEffect(() => {
    orgApi
      .get()
      .then((o) =>
        setSettings({
          vatPayer: o.vatPayer ?? true,
          vatRatePercent: Number(o.vatRatePercent ?? 21),
          loaded: true,
        }),
      )
      .catch(() => {});
  }, []);
  return settings;
}

/** Label of the basis purchase prices are stored/displayed in. */
export function vatBasisLabel(vatPayer: boolean): string {
  return vatPayer ? 'fără TVA' : 'cu TVA';
}
