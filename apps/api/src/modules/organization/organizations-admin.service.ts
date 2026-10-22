import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '@/prisma/prisma.service';
import { runAsOrg, runWithoutTenant } from '@/prisma/tenant-context';
import {
  ROLE_DEFINITIONS,
  RESERVED_ORG_SLUGS,
  slugifyOrgName,
} from '@/modules/roles/role-definitions';
import { UnitConversionsService } from '@/modules/unit-conversions';
import { EmailService } from '@/modules/email';
import { CreateOrganizationDto } from './dto/create-organization.dto';

/** Invitation token validity (matches invitations module: 72 hours). */
const INVITE_EXPIRY_MS = 72 * 60 * 60 * 1000;

/**
 * Platform-level organization provisioning. Creating an org clones the
 * standard role set, seeds its unit conversions + system categories, and
 * emails the first administrator a 72h set-password invitation.
 */
@Injectable()
export class OrganizationsAdminService {
  private readonly logger = new Logger(OrganizationsAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly unitConversions: UnitConversionsService,
    private readonly email: EmailService,
  ) {}

  async list() {
    return runWithoutTenant(async () => {
      const orgs = await this.prisma.organization.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, slug: true, isActive: true, createdAt: true },
      });
      const counts = await this.prisma.user.groupBy({
        by: ['organizationId'],
        _count: { _all: true },
      });
      const byOrg = new Map(counts.map((c) => [c.organizationId, c._count._all]));
      return orgs.map((o) => ({ ...o, userCount: byOrg.get(o.id) ?? 0 }));
    });
  }

  async create(dto: CreateOrganizationDto) {
    const slug = dto.slug ?? slugifyOrgName(dto.name);

    if (!slug) {
      throw new BadRequestException(
        'Could not derive a slug from the name — provide one explicitly',
      );
    }
    if (RESERVED_ORG_SLUGS.includes(slug)) {
      throw new BadRequestException(`Slug "${slug}" is reserved`);
    }

    return runWithoutTenant(async () => {
      const existing = await this.prisma.organization.findUnique({ where: { slug } });
      if (existing) {
        throw new ConflictException(`An organization with slug "${slug}" already exists`);
      }

      const emailTaken = await this.prisma.user.findUnique({
        where: { email: dto.adminEmail },
      });
      if (emailTaken) {
        throw new ConflictException(
          `A user with email "${dto.adminEmail}" already exists (emails are global)`,
        );
      }

      const org = await this.prisma.organization.create({
        data: { name: dto.name, slug },
      });

      // Provision the org's own copies of the standard role set + defaults.
      const inviteToken = uuidv4();
      await runAsOrg(org.id, async () => {
        let administratorRoleId: string | null = null;

        for (const r of ROLE_DEFINITIONS) {
          const role = await this.prisma.role.create({
            data: {
              organizationId: org.id,
              name: r.name,
              slug: r.slug,
              isSystem: r.isSystem,
              description: r.description,
              permissions: { create: r.permissions },
            },
          });
          if (r.slug === 'administrator') administratorRoleId = role.id;
        }

        await this.prisma.recipeCategoryConfig.create({
          data: {
            organizationId: org.id,
            name: 'Materii prime',
            kind: 'MATERIE_PRIMA',
            isSystem: true,
            sortOrder: 0,
          },
        });

        await this.unitConversions.seedStandardConversions(org.id);

        // First-admin invitation (same shape the invitations module consumes).
        await this.prisma.userInvitation.create({
          data: {
            organizationId: org.id,
            email: dto.adminEmail,
            role: 'ADMINISTRATOR',
            roleId: administratorRoleId,
            token: inviteToken,
            createdById: null,
            expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
          },
        });
      });

      await this.email.sendInvitation(
        dto.adminEmail,
        inviteToken,
        'Administrator',
        org.slug,
        org.name,
      );

      this.logger.log(`Organization "${org.name}" (${org.slug}) provisioned`);
      return { id: org.id, name: org.name, slug: org.slug, isActive: org.isActive };
    });
  }
}
