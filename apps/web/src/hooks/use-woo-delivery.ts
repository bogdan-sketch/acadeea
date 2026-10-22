'use client';

import { useEffect, useState } from 'react';
import { organization as orgApi } from '@/lib/api';

/**
 * Feature switch "Livrări din magazinul online" (Organization.wooDeliveryEnabled):
 * location externalId + main units and the delivery-method filters on orders are
 * hidden until an admin turns it on (Setări → Firmă și documente). Mirrors
 * `useNutritionEnabled`.
 */
export function useWooDeliveryEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    orgApi
      .get()
      .then((o) => setEnabled(!!o.wooDeliveryEnabled))
      .catch(() => {});
  }, []);
  return enabled;
}
