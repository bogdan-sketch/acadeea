import { MaterialStatus } from '@prisma/client';

/**
 * Statusul unui articol de stoc se DERIVĂ din stoc/minim la citire — coloana
 * `status` din DB poate rămâne în urmă (ex. transferuri care mișcă stocul fără
 * să o rescrie). Singura stare "sticky" este DISCONTINUED (setată explicit).
 *
 * Folosit de /stock/stats, de listele de materii prime și consumabile (filtru
 * + badge pe rând), și de scrierea statusului la mișcări de stoc — o singură
 * regulă peste tot.
 */
export function deriveMaterialStatus(
  stockCount: number,
  minimumStock: number,
  storedStatus: MaterialStatus,
): MaterialStatus {
  if (storedStatus === MaterialStatus.DISCONTINUED) {
    return MaterialStatus.DISCONTINUED;
  }
  if (stockCount <= 0) {
    return MaterialStatus.OUT_OF_STOCK;
  }
  if (stockCount <= minimumStock) {
    return MaterialStatus.LOW_STOCK;
  }
  return MaterialStatus.ACTIVE;
}
