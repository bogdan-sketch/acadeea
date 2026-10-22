import { SetMetadata } from '@nestjs/common';
import { AppAbility } from './casl-ability.factory';

/**
 * A policy handler is a function that receives the current user's CASL
 * Ability and returns `true` if the request should be allowed.
 *
 * Example:
 * ```ts
 * @CheckPolicies((ability) => ability.can('read', 'Recipe'))
 * ```
 */
export type PolicyHandler = (ability: AppAbility) => boolean;

export const CHECK_POLICIES_KEY = 'check_policies';

/**
 * Decorator that attaches one or more policy handlers to a route.
 * Used together with `PoliciesGuard`.
 *
 * When multiple handlers are provided they are evaluated with AND semantics:
 * *all* handlers must return `true` for the request to proceed.
 */
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
