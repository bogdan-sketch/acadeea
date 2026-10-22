import { PrismaService } from '@/prisma/prisma.service';

/**
 * The organization's oldest ACTIVE administrator — the actor stamped on
 * system-created records (Woo order import, Woo auto stock deduction).
 *
 * Resolved by the dynamic role (`Role.slug = 'administrator'`), never by the
 * legacy `User.role` enum: only the provisioning admin carries
 * `role = 'ADMINISTRATOR'`; invited/created administrators keep `COFETAR`
 * there, so the legacy lookup silently found nobody once that one account was
 * deactivated or deleted. Explicitly org-filtered so it is safe outside a
 * tenant scope too.
 */
export async function findOrgAdministratorId(
  prisma: PrismaService,
  organizationId: string,
): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { organizationId, isActive: true, dynamicRole: { slug: 'administrator' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return admin?.id ?? null;
}
