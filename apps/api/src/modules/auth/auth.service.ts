import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProviderKind } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../../prisma/prisma.service';
import { runWithoutTenant } from '../../prisma/tenant-context';
import { mapLogoFields } from '../organization/organization.service';
import { PostHogService } from '../telemetry';
import { SocialAuthService, type SocialIdentity } from './social-auth.service';

/** Provider name as it appears in URLs / the shared enum (lowercase). */
type ProviderName = 'apple' | 'google';
const PROVIDER_KIND: Record<ProviderName, AuthProviderKind> = {
  apple: AuthProviderKind.APPLE,
  google: AuthProviderKind.GOOGLE,
};

/** Lock the account after this many consecutive failed login attempts. */
const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** Single-use apex→subdomain handoff codes live this long. */
const HANDOFF_CODE_TTL_MS = 60_000;

/** Branding subset of Organization returned on login / handoff redeem. */
const ORG_BRANDING_SELECT = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  accentColor: true,
  secondaryColor: true,
  tertiaryColor: true,
  brandingTokens: true,
  fontFamily: true,
  logoUrl: true,
  logoLightUrl: true,
  logoDarkUrl: true,
  appLogoLightUrl: true,
  appLogoDarkUrl: true,
  appIconName: true,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly posthog: PostHogService,
    private readonly socialAuth: SocialAuthService,
  ) {}

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  async login(email: string, password: string) {
    // Pre-token lookup — no tenant context exists yet; the email resolves the
    // user's organization (emails are globally unique).
    const user = await runWithoutTenant(() =>
      this.prisma.user.findUnique({
        where: { email },
        include: {
          dynamicRole: {
            include: { permissions: { select: { action: true, subject: true } } },
          },
          organization: { select: ORG_BRANDING_SELECT },
        },
      }),
    );

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.assertCanSignIn(user);

    // Provider-only account (Sign in with Apple/Google, no password set).
    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);

    if (!passwordValid) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
      await this.prisma.user.update({
        // Pre-token write — scope explicitly to the user's own org.
        where: { id: user.id, organizationId: user.organizationId },
        data: {
          failedLoginAttempts: attempts,
          ...(shouldLock ? { lockedAt: new Date() } : {}),
        },
      });

      if (shouldLock) {
        // Wipe sessions so a previously-logged-in device can't keep working.
        await this.prisma.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.logger.warn(`Account ${user.email} locked after ${attempts} failed attempts`);
        throw new ForbiddenException({
          message: 'Account locked after too many failed attempts. Reset your password to recover.',
          errorCode: 'ACCOUNT_LOCKED',
        });
      }

      throw new UnauthorizedException('Invalid email or password');
    }

    // Successful login: reset the failed-attempt counter.
    if (user.failedLoginAttempts > 0) {
      await this.prisma.user.update({
        where: { id: user.id, organizationId: user.organizationId },
        data: { failedLoginAttempts: 0 },
      });
    }

    // Multi-device: each login gets its own refresh token; we do NOT revoke
    // other devices' sessions here (web + iOS + android coexist). Sessions are
    // still revoked on logout, password reset, lockout, and deactivation.

    this.posthog.capture(user.id, 'user_logged_in', { role: user.dynamicRole?.slug ?? 'unknown' });
    return this.buildAuthResponse(user.id);
  }

  // ---------------------------------------------------------------------------
  // Social sign-in (Apple / Google)
  // ---------------------------------------------------------------------------

  /**
   * Sign in (or invite-driven sign up) with Apple/Google. Resolution:
   *  1. the (provider, sub) is already linked → log that user in;
   *  2. else an `invitationToken` is supplied → accept it, create a
   *     password-less account, link the provider;
   *  3. else → PROVIDER_NO_ACCOUNT (sign-up is invite-only).
   */
  async signInWithProvider(
    provider: ProviderName,
    dto: {
      identityToken: string;
      nonce?: string;
      invitationToken?: string;
      firstName?: string;
      lastName?: string;
    },
  ) {
    const identity = await this.socialAuth.verify(provider, dto.identityToken, dto.nonce);
    const kind = PROVIDER_KIND[provider];

    return runWithoutTenant(async () => {
      const link = await this.prisma.userAuthProvider.findUnique({
        where: { provider_providerUserId: { provider: kind, providerUserId: identity.sub } },
        include: {
          user: {
            select: {
              id: true,
              isActive: true,
              lockedAt: true,
              organization: { select: { isActive: true } },
            },
          },
        },
      });

      if (link) {
        // Same gates as password login: deactivated user, deactivated org, locked.
        this.assertCanSignIn(link.user);
        this.logger.log(`${provider} login for user ${link.userId}`);
        return this.buildAuthResponse(link.userId);
      }

      if (dto.invitationToken) {
        return this.acceptInviteWithProvider(dto.invitationToken, kind, identity, dto);
      }

      throw new UnauthorizedException({
        message: 'No account for this identity. An invitation is required to sign up.',
        errorCode: 'PROVIDER_NO_ACCOUNT',
      });
    });
  }

  /**
   * Accept an invitation and create a password-less account linked to the
   * social identity (or link the provider to an existing account with the
   * invited email). Runs without tenant context — the invitation carries the org.
   */
  private async acceptInviteWithProvider(
    invitationToken: string,
    kind: AuthProviderKind,
    identity: SocialIdentity,
    names: { firstName?: string; lastName?: string },
  ) {
    const invitation = await this.prisma.userInvitation.findUnique({
      where: { token: invitationToken },
    });
    if (!invitation) throw new NotFoundException('Invalid invitation token');
    if (invitation.acceptedAt) throw new BadRequestException('Invitation already accepted');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('Invitation has expired');
    if (!invitation.roleId) throw new BadRequestException('Invitation has no role assigned');

    // Reuse an existing account for this email, else create a password-less one.
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
      select: {
        id: true,
        isActive: true,
        lockedAt: true,
        organization: { select: { isActive: true } },
      },
    });
    // An existing (deactivated / locked) account must not be revived by an
    // invite accept — check BEFORE linking or consuming the invitation.
    if (existingUser) this.assertCanSignIn(existingUser);
    let user: { id: string } | null = existingUser;

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          organizationId: invitation.organizationId,
          email: invitation.email,
          passwordHash: null,
          firstName: names.firstName || identity.firstName || '',
          lastName: names.lastName || identity.lastName || '',
          role: 'COFETAR', // legacy enum column
          roleId: invitation.roleId,
        },
        select: { id: true },
      });
    }

    // Link the provider (guard: the identity must not belong to someone else —
    // the unique index enforces it; surface a clean error if raced).
    const clash = await this.prisma.userAuthProvider.findUnique({
      where: { provider_providerUserId: { provider: kind, providerUserId: identity.sub } },
    });
    if (clash && clash.userId !== user.id) {
      throw new ConflictException({
        message: 'This identity is already linked to another account',
        errorCode: 'PROVIDER_ALREADY_LINKED',
      });
    }
    if (!clash) {
      await this.prisma.userAuthProvider.create({
        data: {
          userId: user.id,
          provider: kind,
          providerUserId: identity.sub,
          email: identity.email,
        },
      });
    }

    await this.prisma.userInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    this.logger.log(`Invitation accepted via ${kind} by ${invitation.email}`);
    return this.buildAuthResponse(user.id);
  }

  /** Link a provider identity to the currently-authenticated user. */
  async linkProvider(
    userId: string,
    provider: ProviderName,
    dto: { identityToken: string; nonce?: string },
  ) {
    const identity = await this.socialAuth.verify(provider, dto.identityToken, dto.nonce);
    const kind = PROVIDER_KIND[provider];

    return runWithoutTenant(async () => {
      const existing = await this.prisma.userAuthProvider.findUnique({
        where: { provider_providerUserId: { provider: kind, providerUserId: identity.sub } },
      });
      if (existing && existing.userId !== userId) {
        throw new ConflictException({
          message: 'This identity is already linked to another account',
          errorCode: 'PROVIDER_ALREADY_LINKED',
        });
      }
      if (!existing) {
        await this.prisma.userAuthProvider.create({
          data: { userId, provider: kind, providerUserId: identity.sub, email: identity.email },
        });
      }
      return { linkedProviders: await this.listLinkedProviders(userId) };
    });
  }

  /** Unlink a provider — refused if it is the user's only remaining login method. */
  async unlinkProvider(userId: string, provider: ProviderName) {
    const kind = PROVIDER_KIND[provider];
    return runWithoutTenant(async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, authProviders: { select: { id: true, provider: true } } },
      });
      if (!user) throw new NotFoundException('User not found');

      const hasPassword = !!user.passwordHash;
      const otherProviders = user.authProviders.filter((p) => p.provider !== kind);
      if (!hasPassword && otherProviders.length === 0) {
        throw new BadRequestException({
          message: 'Cannot remove your only login method',
          errorCode: 'LAST_LOGIN_METHOD',
        });
      }

      await this.prisma.userAuthProvider.deleteMany({ where: { userId, provider: kind } });
      return { linkedProviders: await this.listLinkedProviders(userId) };
    });
  }

  private async listLinkedProviders(userId: string): Promise<ProviderName[]> {
    const rows = await this.prisma.userAuthProvider.findMany({
      where: { userId },
      select: { provider: true },
    });
    return rows.map((r) => r.provider.toLowerCase() as ProviderName);
  }

  /**
   * Build the standard auth response (tokens + handoff + org branding + user)
   * for a fully-validated user. Shared by password login and provider login.
   */
  /**
   * Gates shared by every path that issues or renews a session: password
   * login, Apple/Google login, invite accept, handoff and refresh.
   */
  private assertCanSignIn(user: {
    isActive: boolean;
    lockedAt: Date | null;
    organization: { isActive: boolean };
  }): void {
    if (!user.isActive) {
      throw new ForbiddenException('Account is deactivated');
    }
    if (!user.organization.isActive) {
      throw new ForbiddenException({
        message: 'Organization is deactivated',
        errorCode: 'ORGANIZATION_INACTIVE',
      });
    }
    // Locked (5 failed attempts or reactivation): the old password no longer works;
    // the user must set a new one via the reset/reactivation link.
    if (user.lockedAt) {
      throw new ForbiddenException({
        message: 'Account locked. Reset your password to recover your account.',
        errorCode: 'ACCOUNT_LOCKED',
      });
    }
  }

  private async buildAuthResponse(userId: string) {
    const user = await runWithoutTenant(() =>
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          dynamicRole: {
            include: { permissions: { select: { action: true, subject: true } } },
          },
          organization: { select: ORG_BRANDING_SELECT },
          authProviders: { select: { provider: true } },
        },
      }),
    );
    if (!user) throw new UnauthorizedException('User not found');
    // Final gate for every path that mints a session (password, Apple/Google,
    // invite accept, handoff).
    this.assertCanSignIn(user);

    const roleSlug = user.dynamicRole?.slug ?? 'ajutor-cofetar';
    const roleName = user.dynamicRole?.name ?? 'Ajutor Cofetar';
    const permissions = user.dynamicRole?.permissions ?? [];

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      roleSlug,
      user.organizationId,
      user.organization.slug,
    );

    // Single-use code so the web app can hand the session from the apex
    // domain (horae.ca) to the org's subdomain ([slug].horae.ca).
    const handoffCode = await this.createHandoffCode(user.id);

    this.logger.log(`Session issued for ${user.email} (org ${user.organization.slug})`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      handoffCode,
      organization: this.toOrgBranding(user.organization),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: { slug: roleSlug, name: roleName },
        permissions: permissions.map((p) => ({ action: p.action, subject: p.subject })),
        linkedProviders: user.authProviders.map((p) => p.provider.toLowerCase()),
        avatarUrl: user.avatarUrl ?? null,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Apex → subdomain login handoff
  // ---------------------------------------------------------------------------

  /**
   * Redeem a single-use handoff code minted at login on the apex domain.
   * Public endpoint — returns the same payload as login so the subdomain app
   * boots identically. Codes expire after 60s and can be used exactly once.
   */
  async redeemHandoff(code: string) {
    const codeHash = createHash('sha256').update(code).digest('hex');

    return runWithoutTenant(async () => {
      const record = await this.prisma.authHandoffCode.findUnique({
        where: { codeHash },
      });

      if (!record || record.usedAt || record.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid or expired handoff code');
      }

      // Atomic claim — a concurrent double-redeem loses the race and gets 401.
      const claimed = await this.prisma.authHandoffCode.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new UnauthorizedException('Invalid or expired handoff code');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: record.userId },
        include: {
          dynamicRole: {
            include: { permissions: { select: { action: true, subject: true } } },
          },
          organization: { select: ORG_BRANDING_SELECT },
        },
      });

      if (!user || !user.isActive || user.lockedAt || !user.organization.isActive) {
        throw new UnauthorizedException('Invalid or expired handoff code');
      }

      const roleSlug = user.dynamicRole?.slug ?? 'ajutor-cofetar';
      const roleName = user.dynamicRole?.name ?? 'Ajutor Cofetar';
      const permissions = user.dynamicRole?.permissions ?? [];

      const tokens = await this.generateTokens(
        user.id,
        user.email,
        roleSlug,
        user.organizationId,
        user.organization.slug,
      );

      this.logger.log(`Handoff redeemed for ${user.email} (org ${user.organization.slug})`);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        organization: this.toOrgBranding(user.organization),
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: { slug: roleSlug, name: roleName },
          permissions: permissions.map((p) => ({ action: p.action, subject: p.subject })),
        },
      };
    });
  }

  /** sha256 hex of a refresh token — the stored/looked-up form. */
  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Mint a single-use, 60s handoff code for the user (sha256-stored). */
  private async createHandoffCode(userId: string): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    const codeHash = createHash('sha256').update(code).digest('hex');

    await this.prisma.authHandoffCode.create({
      data: {
        userId,
        codeHash,
        expiresAt: new Date(Date.now() + HANDOFF_CODE_TTL_MS),
      },
    });

    // Opportunistic cleanup of long-expired codes (no cron needed).
    await this.prisma.authHandoffCode
      .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } })
      .catch(() => undefined);

    return code;
  }

  /** Shape an Organization row (ORG_BRANDING_SELECT) for client responses. */
  private toOrgBranding(org: {
    id: string;
    name: string;
    slug: string;
    accentColor: string;
    secondaryColor: string | null;
    tertiaryColor: string | null;
    brandingTokens?: unknown;
    fontFamily: string | null;
    logoUrl: string | null;
    logoLightUrl: string | null;
    logoDarkUrl: string | null;
    appLogoLightUrl: string | null;
    appLogoDarkUrl: string | null;
    appIconName: string | null;
  }) {
    // Logo data URIs are rewritten to the cacheable binary endpoint — keeps
    // the login/me/handoff payloads tiny (was ~20 MB with embedded logos).
    return mapLogoFields({
      id: org.id,
      name: org.name,
      slug: org.slug,
      accentColor: org.accentColor,
      secondaryColor: org.secondaryColor,
      tertiaryColor: org.tertiaryColor,
      brandingTokens: (org.brandingTokens ?? null) as Record<
        string,
        Record<string, string | Record<string, string>>
      > | null,
      fontFamily: org.fontFamily,
      logoUrl: org.logoUrl,
      logoLightUrl: org.logoLightUrl,
      logoDarkUrl: org.logoDarkUrl,
      appLogoLightUrl: org.appLogoLightUrl,
      appLogoDarkUrl: org.appLogoDarkUrl,
      appIconName: org.appIconName,
    });
  }

  // ---------------------------------------------------------------------------
  // Refresh tokens (rotation)
  // ---------------------------------------------------------------------------

  async refreshTokens(refreshToken: string) {
    // Refresh tokens are 128-bit random UUIDs stored as sha256 — an indexed
    // O(1) lookup. (They were argon2-hashed and verified in a loop over EVERY
    // live session in the DB: each verify costs ~100 ms by design, so logout/
    // refresh degraded linearly with total sessions. sha256 is fine here —
    // the token itself is high-entropy, unlike a password.)
    const matchedToken = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: this.hashRefreshToken(refreshToken), revokedAt: null },
      include: {
        user: {
          include: {
            dynamicRole: true,
            organization: { select: { id: true, slug: true, isActive: true } },
          },
        },
      },
    });

    if (!matchedToken) {
      // Sessions minted before the sha256 switch (argon2 hashes) won't match
      // and land here — those users simply log in again once.
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if the token is expired
    if (matchedToken.expiresAt < new Date()) {
      // Revoke the expired token
      await this.prisma.refreshToken.update({
        where: { id: matchedToken.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token has expired');
    }

    // The user (and their organization) must still be allowed to sign in —
    // same gates as login; a refused refresh also burns the token.
    try {
      this.assertCanSignIn(matchedToken.user);
    } catch (error) {
      await this.prisma.refreshToken.update({
        where: { id: matchedToken.id },
        data: { revokedAt: new Date() },
      });
      throw error;
    }

    // Revoke the old token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: matchedToken.id },
      data: { revokedAt: new Date() },
    });

    const roleSlug = matchedToken.user.dynamicRole?.slug ?? 'ajutor-cofetar';

    // Generate new token pair
    const tokens = await this.generateTokens(
      matchedToken.user.id,
      matchedToken.user.email,
      roleSlug,
      matchedToken.user.organization.id,
      matchedToken.user.organization.slug,
    );

    this.logger.log(`Tokens refreshed for user ${matchedToken.user.email}`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  async logout(userId: string, refreshToken: string) {
    // O(1) indexed revoke (was an argon2.verify loop over the user's live
    // sessions — logout took seconds once a few sessions piled up).
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash: this.hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (revoked.count > 0) {
      this.logger.log(`Refresh token revoked for user ${userId}`);
      return;
    }

    // If token not found, silently succeed (idempotent logout)
    this.logger.warn(`Logout called with unknown refresh token for user ${userId}`);
  }

  // ---------------------------------------------------------------------------
  // Self-service account deletion (GDPR / App Store 5.1.1(v))
  // ---------------------------------------------------------------------------

  /**
   * Delete the authenticated user's OWN account after confirming their password.
   *
   * This is a soft-delete that strips PII but keeps the row: users are referenced
   * by `createdById` on tasks/orders/etc., so a hard delete would break referential
   * integrity. We anonymize identity fields, set `deletedAt`, deactivate, drop any
   * linked social identities and revoke every live session (logout everywhere).
   *
   * Guard: the last active administrator of an org can't delete themselves — they
   * must hand the role over first (same rule as admin deactivation).
   */
  async deleteOwnAccount(userId: string, password: string): Promise<{ deleted: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { dynamicRole: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Confirm identity with the current password. Provider-only accounts (no
    // password set) can't confirm this way — they must set a password first.
    if (!user.passwordHash) {
      throw new BadRequestException({
        message: 'Set a password before deleting your account',
        errorCode: 'PASSWORD_REQUIRED',
      });
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      // 400 (not 401): a 401 would trip the clients' access-token-refresh
      // interceptors — this is a wrong confirmation password, not an expired session.
      throw new BadRequestException({
        message: 'Parolă incorectă',
        errorCode: 'INVALID_PASSWORD',
      });
    }

    // Last-admin guard — mirror of UsersService.ensureNotLastAdmin / deactivate.
    if (user.dynamicRole?.slug === 'administrator') {
      const adminRole = await this.prisma.role.findFirst({ where: { slug: 'administrator' } });
      if (adminRole) {
        const otherActiveAdmins = await this.prisma.user.count({
          where: { roleId: adminRole.id, isActive: true, id: { not: userId } },
        });
        if (otherActiveAdmins === 0) {
          throw new BadRequestException({
            message:
              'Ești ultimul administrator activ — atribuie rolul altcuiva înainte de a-ți șterge contul.',
            errorCode: 'LAST_ACTIVE_ADMIN',
          });
        }
      }
    }

    await this.prisma.$transaction([
      // 1. Anonymize PII + soft-delete + deactivate.
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@deleted.horae.ca`,
          firstName: 'Cont',
          lastName: 'șters',
          passwordHash: null,
          isActive: false,
          deletedAt: new Date(),
          failedLoginAttempts: 0,
        },
      }),
      // 2. Drop linked social identities (Apple/Google).
      this.prisma.userAuthProvider.deleteMany({ where: { userId } }),
      // 3. Revoke every live session — logged out on all devices.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.posthog.capture(userId, 'user_deleted_account');
    this.logger.log(`Account self-deleted: user ${userId} anonymized`);
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Validate user (used by JWT strategy indirectly + /auth/me)
  // ---------------------------------------------------------------------------

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        dynamicRole: {
          include: { permissions: { select: { action: true, subject: true } } },
        },
        organization: { select: ORG_BRANDING_SELECT },
        authProviders: { select: { provider: true } },
      },
    });

    if (!user || !user.isActive || !user.organization.isActive) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      organization: this.toOrgBranding(user.organization),
      role: {
        slug: user.dynamicRole?.slug ?? 'ajutor-cofetar',
        name: user.dynamicRole?.name ?? 'Ajutor Cofetar',
      },
      permissions: (user.dynamicRole?.permissions ?? []).map((p) => ({
        action: p.action,
        subject: p.subject,
      })),
      linkedProviders: user.authProviders.map((p) => p.provider.toLowerCase()),
      avatarUrl: user.avatarUrl ?? null,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    organizationId: string,
    orgSlug: string,
  ) {
    const accessToken = this.jwtService.sign({
      sub: userId,
      email,
      role, // This is now the slug
      organizationId,
      orgSlug,
    });

    const refreshToken = uuidv4();
    // sha256 (not argon2): the token is a 128-bit random UUID, so a fast hash
    // is safe and enables the O(1) indexed lookups in refresh/logout.
    const refreshTokenHash = this.hashRefreshToken(refreshToken);

    const refreshExpiry = this.configService.get<string>('JWT_REFRESH_EXPIRY', '30d');
    const expiresAt = this.calculateExpiry(refreshExpiry);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: refreshTokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private calculateExpiry(duration: string): Date {
    const now = new Date();
    const match = duration.match(/^(\d+)([smhd])$/);

    if (!match) {
      // Default to 7 days if format is unrecognized
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1]!, 10); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const unit = match[2]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion

    switch (unit) {
      case 's':
        return new Date(now.getTime() + value * 1000);
      case 'm':
        return new Date(now.getTime() + value * 60 * 1000);
      case 'h':
        return new Date(now.getTime() + value * 60 * 60 * 1000);
      case 'd':
        return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }
}
