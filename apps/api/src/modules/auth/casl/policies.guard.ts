import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { CaslAbilityFactory, CaslUser } from './casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from './policies.decorator';

/**
 * Guard that enforces CASL-based authorization policies.
 *
 * Behaviour:
 * - If no `@CheckPolicies()` decorator is present on the handler/class,
 *   the guard **allows** the request (no restriction).
 * - If one or more policy handlers are attached, the guard builds a CASL
 *   Ability for the current user and evaluates every handler.
 *   All handlers must return `true`; otherwise a 403 is thrown.
 *
 * This guard expects `request.user` to be populated by a preceding
 * authentication guard (e.g. `JwtAuthGuard`).
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly caslAbilityFactory: CaslAbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policyHandlers = this.reflector.getAllAndOverride<PolicyHandler[] | undefined>(
      CHECK_POLICIES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No policies defined — allow access by default
    if (!policyHandlers || policyHandlers.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: CaslUser = {
      id: request.user?.userId ?? request.user?.id,
      role: request.user?.role,
      // Role slugs (and the ability cache) are per-organization — without
      // this, one org's customized role permissions would be resolved and
      // cached for every org sharing the same slug.
      organizationId: request.user?.organizationId,
    };

    if (!user) {
      throw new ForbiddenException('No authenticated user found on request');
    }

    const ability = await this.caslAbilityFactory.createForUser(user);

    const allPoliciesPassed = policyHandlers.every((handler) => handler(ability));

    if (!allPoliciesPassed) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }

    return true;
  }
}
