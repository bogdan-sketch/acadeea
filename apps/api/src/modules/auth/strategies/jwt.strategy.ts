import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as fs from 'fs';

import { PrismaService } from '@/prisma/prisma.service';
import { JwtPayload } from '../decorators/current-user.decorator';

interface JwtTokenPayload {
  sub: string;
  email: string;
  role: string;
  organizationId?: string;
  orgSlug?: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const publicKeyPath = configService.getOrThrow<string>('JWT_PUBLIC_KEY_PATH');
    const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: JwtTokenPayload): Promise<JwtPayload> {
    // Tokens minted before multi-tenancy carry no organizationId — reject so
    // the client's single-flight refresh mints an org-bearing token.
    if (!payload.organizationId || !payload.orgSlug) {
      throw new UnauthorizedException('Token predates multi-tenancy — refresh required');
    }

    // A signature-valid token is not enough: a user deactivated / locked (or
    // whose organization was deactivated) after the token was minted must lose
    // access now, not when the 12 h token expires. One PK lookup per request;
    // explicit organizationId keeps it valid before the TenantInterceptor runs.
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, organizationId: payload.organizationId },
      select: { isActive: true, lockedAt: true, organization: { select: { isActive: true } } },
    });
    if (!user || !user.isActive || user.lockedAt || !user.organization.isActive) {
      throw new UnauthorizedException('Sesiunea nu mai este validă — autentifică-te din nou');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
      orgSlug: payload.orgSlug,
    };
  }
}
