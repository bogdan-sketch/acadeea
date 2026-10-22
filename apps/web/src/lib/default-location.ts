import type { Location, Organization } from './types';

/**
 * The location every operation starts on when the user hasn't picked one:
 * the admin's `Organization.defaultLocationId` (Stoc › Locații › "Implicită")
 * when it is in `locations`, else the one named "laborator" (production
 * happens there), else the first entry. Same rule on iOS and Android.
 */
export function pickDefaultLocation<T extends Pick<Location, 'id' | 'name'>>(
  locations: T[],
  org: Pick<Organization, 'defaultLocationId'> | null | undefined,
): T | undefined {
  if (locations.length === 0) return undefined;
  const configured = org?.defaultLocationId
    ? locations.find((l) => l.id === org.defaultLocationId)
    : undefined;
  const laborator = locations.find((l) => l.name.toLowerCase().includes('laborator'));
  return configured ?? laborator ?? locations[0];
}
