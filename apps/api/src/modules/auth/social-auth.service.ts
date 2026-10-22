import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/** Normalized identity extracted from a verified provider id_token. */
export interface SocialIdentity {
  /** Provider stable subject (`sub`). */
  sub: string;
  email?: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
}

type Provider = 'apple' | 'google';

interface ProviderConfig {
  jwksUrl: string;
  issuers: string[];
  /** Allowed audiences (client ids / bundle ids / Services IDs), from env. */
  audiences: string[];
}

/**
 * Verifies Sign in with Apple / Google identity tokens against the provider's
 * published JWKS. No client secret needed — id_token verification is enough to
 * authenticate the holder. Audiences come from env (`APPLE_AUDIENCES` /
 * `GOOGLE_AUDIENCES`, comma lists); an empty list disables that provider.
 */
@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  // Remote JWKS are cached + auto-refreshed by jose (keeps keys across requests).
  private readonly jwks: Record<Provider, ReturnType<typeof createRemoteJWKSet>>;
  private readonly config: Record<Provider, ProviderConfig>;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      apple: {
        jwksUrl: 'https://appleid.apple.com/auth/keys',
        issuers: ['https://appleid.apple.com'],
        audiences: this.parseList(this.configService.get<string>('APPLE_AUDIENCES', '')),
      },
      google: {
        jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
        issuers: ['accounts.google.com', 'https://accounts.google.com'],
        audiences: this.parseList(this.configService.get<string>('GOOGLE_AUDIENCES', '')),
      },
    };
    this.jwks = {
      apple: createRemoteJWKSet(new URL(this.config.apple.jwksUrl)),
      google: createRemoteJWKSet(new URL(this.config.google.jwksUrl)),
    };
  }

  private parseList(raw: string): string[] {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  isEnabled(provider: Provider): boolean {
    return this.config[provider].audiences.length > 0;
  }

  /**
   * Verify a provider id_token and return the normalized identity.
   * @param nonce optional raw nonce the client used; matched against the token's
   *challenge (raw or sha256, covering both Apple-native and web conventions).
   */
  async verify(provider: Provider, identityToken: string, nonce?: string): Promise<SocialIdentity> {
    const cfg = this.config[provider];
    if (cfg.audiences.length === 0) {
      throw new UnauthorizedException({
        message: `${provider} sign-in is not configured`,
        errorCode: 'PROVIDER_NO_ACCOUNT',
      });
    }

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(identityToken, this.jwks[provider], {
        issuer: cfg.issuers,
        audience: cfg.audiences,
      });
      payload = result.payload;
    } catch (err) {
      this.logger.warn(`${provider} token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid identity token');
    }

    if (nonce) {
      const claim = typeof payload.nonce === 'string' ? payload.nonce : undefined;
      const sha = createHash('sha256').update(nonce).digest('hex');
      if (claim !== nonce && claim !== sha) {
        throw new UnauthorizedException('Nonce mismatch');
      }
    }

    const sub = payload.sub;
    if (!sub) {
      throw new UnauthorizedException('Identity token missing subject');
    }

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined;
    // Providers report email_verified as boolean OR the string "true".
    const rawVerified = (payload as Record<string, unknown>).email_verified;
    const emailVerified = rawVerified === true || rawVerified === 'true';

    // Google carries name parts in the id_token; Apple only on first consent
    // (passed separately by the client, not in the token).
    const given = (payload as Record<string, unknown>).given_name;
    const family = (payload as Record<string, unknown>).family_name;

    return {
      sub,
      email,
      emailVerified,
      firstName: typeof given === 'string' ? given : undefined,
      lastName: typeof family === 'string' ? family : undefined,
    };
  }
}
