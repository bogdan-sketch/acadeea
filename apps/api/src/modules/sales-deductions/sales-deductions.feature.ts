import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

/**
 * Test-environment-only rollout of "scădere stoc din vânzări".
 *
 * `FEATURE_SALES_DEDUCTIONS=true|false` decides explicitly (set to "true" in
 * docker/docker-compose.horae-test.yml AND, since 1.33.0, docker-compose.acadeea.yml). Unset ⇒ on for local dev, off
 * wherever NODE_ENV=production — i.e. prod stays dark even after the code
 * ships there, until the flag is added to the prod compose.
 */
export function salesDeductionsEnabled(): boolean {
  const flag = process.env.FEATURE_SALES_DEDUCTIONS?.trim().toLowerCase();
  if (flag) return flag === 'true' || flag === '1';
  return process.env.NODE_ENV !== 'production';
}

/** 404s every sales-deduction route while the feature is off. */
@Injectable()
export class SalesDeductionsFeatureGuard implements CanActivate {
  canActivate(): boolean {
    if (!salesDeductionsEnabled()) throw new NotFoundException();
    return true;
  }
}
