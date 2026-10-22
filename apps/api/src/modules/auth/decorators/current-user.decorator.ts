import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  /** Tenant the token was issued for — drives all data isolation. */
  organizationId: string;
  /** The org's subdomain slug (informational, avoids a lookup on clients). */
  orgSlug: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | string => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    return data ? user[data] : user;
  },
);
