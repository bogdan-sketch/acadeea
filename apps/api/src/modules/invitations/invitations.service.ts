import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '@/prisma/prisma.service';
import { getCurrentTenantId, runWithoutTenant } from '@/prisma/tenant-context';
import { EmailService } from '@/modules/email';
import { UsersService } from '@/modules/users';
import { AuthService } from '@/modules/auth';
import { InviteUserDto, AcceptInviteDto, InvitationResponseDto } from './dto';

/** Invitation token validity in milliseconds (72 hours). */
const INVITE_EXPIRY_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Create an invitation and send email.
   * @throws ConflictException if email belongs to an active user.
   */
  async invite(dto: InviteUserDto, createdById: string): Promise<InvitationResponseDto> {
    // Check if active user with this email exists
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser && existingUser.isActive) {
      throw new ConflictException(`An active user with email "${dto.email}" already exists`);
    }

    // A pending invitation for the same email is REPLACED (fresh token + 72h),
    // so "invite again" doubles as "resend" — e.g. after a failed email.
    const replaced = await this.prisma.userInvitation.deleteMany({
      where: { email: dto.email, acceptedAt: null },
    });
    if (replaced.count > 0) {
      this.logger.log(`Replacing ${replaced.count} pending invitation(s) for ${dto.email}`);
    }

    // Fetch role name for email
    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) {
      throw new BadRequestException(`Role with ID "${dto.roleId}" not found`);
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

    const invitation = await this.prisma.userInvitation.create({
      data: {
        email: dto.email,
        role: 'COFETAR', // legacy enum placeholder — real role is in dynamicRole
        roleId: dto.roleId,
        token,
        createdById,
        expiresAt,
      },
      include: { dynamicRole: true },
    });

    // Invitation is sent from the admin's request context — link goes to the
    // admin's org subdomain, branded with the org name.
    const org = getCurrentTenantId()
      ? await this.prisma.organization.findUnique({
          where: { id: getCurrentTenantId() },
          select: { slug: true, name: true },
        })
      : null;
    try {
      await this.email.sendInvitation(dto.email, token, role.name, org?.slug, org?.name);
    } catch (err) {
      // Never leave a pending invitation nobody received — it would block
      // every retry. Roll it back and surface the real SMTP reason.
      await this.prisma.userInvitation
        .delete({ where: { id: invitation.id } })
        .catch(() => undefined);
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Invitation email to ${dto.email} failed: ${reason}`);
      throw new BadGatewayException({
        errorCode: 'EMAIL_SEND_FAILED',
        message: `Emailul de invitație nu a putut fi trimis (${reason}). Invitația nu a fost creată — încearcă din nou.`,
      });
    }

    this.logger.log(`Invitation sent to ${dto.email} with role ${role.name}`);

    return this.toDto(invitation);
  }

  /**
   * Check token validity without consuming it.
   */
  async checkToken(token: string) {
    // Public route — the invitation token itself is the credential.
    const invitation = await runWithoutTenant(() =>
      this.prisma.userInvitation.findUnique({ where: { token } }),
    );

    if (!invitation) {
      return { valid: false, reason: 'invalid' as const };
    }
    if (invitation.acceptedAt) {
      return { valid: false, reason: 'used' as const };
    }
    if (invitation.expiresAt < new Date()) {
      return { valid: false, reason: 'expired' as const };
    }
    return { valid: true, email: invitation.email };
  }

  /**
   * Accept an invitation — create user account and return auth tokens.
   * @throws NotFoundException if token invalid or expired.
   */
  async acceptInvite(dto: AcceptInviteDto) {
    // Public route — no tenant context. The invitation row carries the org
    // the new user must join; NEVER derive it from anything else.
    return runWithoutTenant(async () => {
      const invitation = await this.prisma.userInvitation.findUnique({
        where: { token: dto.token },
      });

      if (!invitation) {
        throw new NotFoundException('Invalid invitation token');
      }

      if (invitation.acceptedAt) {
        throw new BadRequestException('This invitation has already been accepted');
      }

      if (invitation.expiresAt < new Date()) {
        throw new BadRequestException('This invitation has expired');
      }

      if (!invitation.roleId) {
        throw new BadRequestException('Invitation has no role assigned');
      }

      // Create user via UsersService (handles hashing + conflict check),
      // explicitly in the invitation's organization.
      await this.usersService.create(
        {
          email: invitation.email,
          password: dto.password,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roleId: invitation.roleId,
        },
        invitation.organizationId,
      );

      // Mark invitation as accepted
      await this.prisma.userInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      // Generate auth tokens so user is immediately logged in
      const tokens = await this.authService.login(invitation.email, dto.password);

      this.logger.log(`Invitation accepted by ${invitation.email}`);

      return tokens;
    });
  }

  /**
   * List all invitations (admin view).
   */
  async findAll(): Promise<InvitationResponseDto[]> {
    const invitations = await this.prisma.userInvitation.findMany({
      include: { dynamicRole: true },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((inv) => this.toDto(inv));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(inv: any): InvitationResponseDto {
    return new InvitationResponseDto({
      id: inv.id,
      email: inv.email,
      role: inv.dynamicRole
        ? { id: inv.dynamicRole.id, slug: inv.dynamicRole.slug, name: inv.dynamicRole.name }
        : null,
      createdById: inv.createdById,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt,
      createdAt: inv.createdAt,
    });
  }
}
