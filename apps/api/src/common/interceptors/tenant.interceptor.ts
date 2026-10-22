import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

import { tenantStorage } from '@/prisma/tenant-context';

/**
 * Reads organizationId from the authenticated user (JWT payload)
 * and wraps the request handler in a tenant-scoped AsyncLocalStorage context.
 *
 * Unauthenticated routes (no request.user) pass through without tenant context —
 * the Prisma middleware will skip tenant filtering for those requests.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user: { organizationId?: string } | undefined = request.user;
    const orgId = user?.organizationId;

    if (!orgId) {
      // No tenant context — public routes (login, org fetch, etc.)
      return next.handle();
    }

    return new Observable((subscriber) => {
      tenantStorage.run({ organizationId: orgId }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
