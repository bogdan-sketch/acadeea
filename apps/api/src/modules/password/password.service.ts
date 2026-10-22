import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PasswordResetPurpose } from '@prisma/client';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '@/prisma/prisma.service';
import { runWithoutTenant } from '@/prisma/tenant-context';
import { EmailService } from '@/modules/email';

/** Block reuse of the last N passwords (current + N-1 previous). */
const PASSWORD_HISTORY_BLOCK = 3;
/** Keep at most this many old hashes per user. */
const PASSWORD_HISTORY_KEEP = 5;
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1h
const REACTIVATION_TOKEN_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72h

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Forgot-password: email a reset link if the account exists and is active.
   * Always resolves (no account enumeration).
   */
  async requestReset(email: string): Promise<void> {
    // Public route — no tenant context; email is globally unique.
    const user = await runWithoutTenant(() =>
      this.prisma.user.findUnique({
        where: { email },
        include: { organization: { select: { slug: true } } },
      }),
    );
    if (user && user.isActive) {
      const token = await this.createToken(user.id, 'RESET', RESET_TOKEN_EXPIRY_MS);
      await this.email.sendPasswordReset(email, token, user.organization.slug);
      this.logger.log(`Password reset requested for ${email}`);
    }
  }

  /** Create a token for the reactivation flow and email a set-password link. */
  async sendReactivation(userId: string, email: string, orgSlug?: string): Promise<void> {
    const token = await this.createToken(userId, 'REACTIVATION', REACTIVATION_TOKEN_EXPIRY_MS);
    await this.email.sendReactivation(email, token, orgSlug);
    this.logger.log(`Reactivation set-password link sent to ${email}`);
  }

  /** Validate a reset token without consuming it (public status check). */
  async checkToken(token: string) {
    const rec = await this.prisma.passwordResetToken.findUnique({ where: { token } });
    if (!rec) return { valid: false, reason: 'invalid' as const };
    if (rec.usedAt) return { valid: false, reason: 'used' as const };
    if (rec.expiresAt < new Date()) return { valid: false, reason: 'expired' as const };
    return { valid: true, purpose: rec.purpose };
  }

  /** Consume a token and set the new password (with history + unlock). */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Public route — the emailed token itself is the credential.
    return runWithoutTenant(() => this.resetPasswordInner(token, newPassword));
  }

  private async resetPasswordInner(token: string, newPassword: string): Promise<void> {
    const rec = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            passwordHistory: {
              orderBy: { createdAt: 'desc' },
              take: PASSWORD_HISTORY_BLOCK - 1,
            },
          },
        },
      },
    });

    if (!rec) throw new NotFoundException('Invalid reset token');
    if (rec.usedAt) throw new BadRequestException('This reset link has already been used');
    if (rec.expiresAt < new Date()) throw new BadRequestException('This reset link has expired');

    const user = rec.user;

    // Block reuse of the last N passwords (current + previous history).
    // A provider-only account (passwordHash null) is setting a password for the
    // first time — nothing to compare against.
    const recentHashes = [
      ...(user.passwordHash ? [user.passwordHash] : []),
      ...user.passwordHistory.map((h) => h.passwordHash),
    ];
    for (const hash of recentHashes) {
      if (await argon2.verify(hash, newPassword)) {
        throw new BadRequestException({
          message: `You cannot reuse any of your last ${PASSWORD_HISTORY_BLOCK} passwords`,
          errorCode: 'PASSWORD_REUSED',
        });
      }
    }

    const newHash = await argon2.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      // Archive the current password (if any), then trim history.
      if (user.passwordHash) {
        await tx.passwordHistory.create({
          data: { userId: user.id, passwordHash: user.passwordHash },
        });
      }
      const old = await tx.passwordHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: PASSWORD_HISTORY_KEEP,
        select: { id: true },
      });
      if (old.length) {
        await tx.passwordHistory.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      }

      // Set new password, clear lock + failed attempts.
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash, failedLoginAttempts: 0, lockedAt: null },
      });

      // Consume the token and any other pending tokens for this user.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      // Force re-login everywhere.
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    this.logger.log(`Password reset completed for ${user.email}`);
  }

  private async createToken(
    userId: string,
    purpose: PasswordResetPurpose,
    expiryMs: number,
  ): Promise<string> {
    // Invalidate prior unused tokens so only the newest link works.
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = uuidv4();
    await this.prisma.passwordResetToken.create({
      data: { userId, token, purpose, expiresAt: new Date(Date.now() + expiryMs) },
    });
    return token;
  }
}
