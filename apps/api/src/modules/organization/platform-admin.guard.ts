import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Platform-level operations guard (creating/listing organizations). There is
 * no cross-tenant role machinery — the platform operator is identified by
 * email via the PLATFORM_ADMIN_EMAILS env (comma-separated list). Use behind
 * JwtAuthGuard so request.user is populated.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const email: string | undefined = request.user?.email;

    const allowed = this.config
      .get<string>('PLATFORM_ADMIN_EMAILS', '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!email || !allowed.includes(email.toLowerCase())) {
      throw new ForbiddenException('Platform administrator access required');
    }
    return true;
  }
}
