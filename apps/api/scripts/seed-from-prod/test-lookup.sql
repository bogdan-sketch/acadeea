-- Natural keys that already exist in the TEST org, so the transform maps prod
-- rows onto them instead of inserting duplicates. Read-only.
-- Usage: psql -q -At -v slug=acadeea -f test-lookup.sql > test-lookup.json
WITH org AS (SELECT id FROM "Organization" WHERE slug = :'slug')
SELECT json_build_object(
  'orgId', (SELECT id FROM org),
  'users', (SELECT coalesce(json_agg(json_build_object('id', u.id, 'email', u.email, 'role', r.name) ORDER BY u.email), '[]')
              FROM "User" u LEFT JOIN "Role" r ON r.id = u."roleId", org
             WHERE u."organizationId" = org.id AND u."isActive" AND u.email NOT LIKE 'deleted-%'),
  'locations', (SELECT coalesce(json_agg(json_build_object('id', l.id, 'name', l.name, 'type', l.type) ORDER BY l."createdAt"), '[]')
              FROM "Location" l, org WHERE l."organizationId" = org.id),
  'categories', (SELECT coalesce(json_agg(json_build_object('id', c.id, 'name', c.name, 'kind', c.kind)), '[]')
              FROM "RecipeCategoryConfig" c, org WHERE c."organizationId" = org.id),
  'kindColors', (SELECT coalesce(json_agg(c.kind), '[]') FROM "CategoryKindColor" c, org WHERE c."organizationId" = org.id),
  'suppliers', (SELECT coalesce(json_agg(json_build_object('id', s.id, 'name', s.name)), '[]') FROM "Supplier" s, org WHERE s."organizationId" = org.id),
  'rawMaterials', (SELECT coalesce(json_agg(json_build_object('id', m.id, 'name', m.title) ORDER BY m."createdAt"), '[]') FROM "RawMaterial" m, org WHERE m."organizationId" = org.id),
  'consumables', (SELECT coalesce(json_agg(json_build_object('id', m.id, 'name', m.title)), '[]') FROM "Consumable" m, org WHERE m."organizationId" = org.id),
  'recipes', (SELECT coalesce(json_agg(json_build_object('id', r.id, 'name', r.name, 'type', r.type) ORDER BY r."createdAt"), '[]') FROM "Recipe" r, org WHERE r."organizationId" = org.id),
  'orders', (SELECT coalesce(json_agg(json_build_object('id', o.id, 'orderNumber', o."orderNumber")), '[]') FROM "Order" o, org WHERE o."organizationId" = org.id),
  'integrations', (SELECT coalesce(json_agg(json_build_object('id', i.id, 'provider', i.provider)), '[]') FROM "Integration" i, org WHERE i."organizationId" = org.id),
  'externalOrders', (SELECT coalesce(json_agg(json_build_object('integrationId', e."integrationId", 'externalId', e."externalId")), '[]')
              FROM "ExternalOrderSource" e JOIN "Integration" i ON i.id = e."integrationId", org WHERE i."organizationId" = org.id),
  'salesAliases', (SELECT coalesce(json_agg(a."normalizedName"), '[]') FROM "SalesProductAlias" a, org WHERE a."organizationId" = org.id)
);
