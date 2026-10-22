import type { Prisma } from '@prisma/client';

// Structural: the (extended, tenant-scoped) PrismaService isn't assignable to
// PrismaClient's generic model types, and only findMany on this model is used.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { recipeCategoryConfig: { findMany: (args: any) => Promise<any[]> } };

/**
 * The `category` filter a list endpoint should apply for a selected name:
 * a parent category (parentId = null) with sub-categories matches itself AND
 * every child, so the clients' category dial (parents only, children on
 * demand) can filter by the parent; anything else is an exact match.
 */
export async function categoryFilter(
  prisma: Db,
  category: string,
): Promise<string | Prisma.StringNullableFilter> {
  const parents = await prisma.recipeCategoryConfig.findMany({
    where: { name: category, parentId: null },
    select: { id: true },
  });
  if (parents.length === 0) return category;
  const children = await prisma.recipeCategoryConfig.findMany({
    where: { parentId: { in: parents.map((p) => p.id) } },
    select: { name: true },
  });
  if (children.length === 0) return category;
  return { in: [category, ...new Set(children.map((c) => c.name))] };
}
