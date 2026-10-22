-- READ-ONLY extract of one organization's data shape from PROD.
-- Run with PGOPTIONS='-c default_transaction_read_only=on' (run.sh does this).
-- Usage: psql -At -v slug=acadeea -f extract.sql  > prod-extract.json
--
-- Personal data never leaves prod: customer names, supplier contacts and
-- WooCommerce billing/shipping blocks are NOT selected (transform.mjs fills in
-- fake values). Integration secrets (config) are NOT selected. Users are not
-- copied: only id + role name, so references can be remapped to test users.
BEGIN TRANSACTION READ ONLY;
WITH org AS (SELECT id FROM "Organization" WHERE slug = :'slug'),
ord AS (
  SELECT o.* FROM "Order" o, org WHERE o."organizationId" = org.id
   AND o."createdAt" > now() - interval '60 days'
)
SELECT json_build_object(
  'orgId', (SELECT id FROM org),
  'extractedAt', now(),
  'users', (SELECT coalesce(json_agg(json_build_object('id', u.id, 'role', r.name)), '[]')
              FROM "User" u LEFT JOIN "Role" r ON r.id = u."roleId", org WHERE u."organizationId" = org.id),
  'locations', (SELECT coalesce(json_agg(json_build_object('id', l.id, 'name', l.name, 'type', l.type)), '[]')
              FROM "Location" l, org WHERE l."organizationId" = org.id),
  'categories', (SELECT coalesce(json_agg(c ORDER BY c."parentId" NULLS FIRST, c."sortOrder"), '[]')
              FROM "RecipeCategoryConfig" c, org WHERE c."organizationId" = org.id),
  'kindColors', (SELECT coalesce(json_agg(c), '[]') FROM "CategoryKindColor" c, org WHERE c."organizationId" = org.id),
  'suppliers', (SELECT coalesce(json_agg(json_build_object(
                  'id', s.id, 'name', s.name, 'notes', NULL, 'createdAt', s."createdAt", 'updatedAt', s."updatedAt",
                  'hasContact', s."contactPerson" IS NOT NULL, 'hasPhone', s.phone IS NOT NULL, 'hasEmail', s.email IS NOT NULL)), '[]')
              FROM "Supplier" s, org WHERE s."organizationId" = org.id),
  'rawMaterials', (SELECT coalesce(json_agg(m), '[]') FROM "RawMaterial" m, org WHERE m."organizationId" = org.id),
  'consumables', (SELECT coalesce(json_agg(m), '[]') FROM "Consumable" m, org WHERE m."organizationId" = org.id),
  'recipes', (SELECT coalesce(json_agg(r), '[]') FROM "Recipe" r, org WHERE r."organizationId" = org.id),
  'components', (SELECT coalesce(json_agg(c), '[]') FROM "RecipeComponent" c JOIN "Recipe" r ON r.id = c."recipeId", org WHERE r."organizationId" = org.id),
  'ingredients', (SELECT coalesce(json_agg(i), '[]') FROM "RecipeIngredient" i JOIN "RecipeComponent" c ON c.id = i."componentId" JOIN "Recipe" r ON r.id = c."recipeId", org WHERE r."organizationId" = org.id),
  'materialStocks', (SELECT coalesce(json_agg(s), '[]') FROM "MaterialStock" s, org WHERE s."organizationId" = org.id),
  'recipeStocks', (SELECT coalesce(json_agg(s), '[]') FROM "RecipeStock" s JOIN "Recipe" r ON r.id = s."recipeId", org WHERE r."organizationId" = org.id),
  'stockLots', (SELECT coalesce(json_agg(l), '[]') FROM "StockLot" l LEFT JOIN "RawMaterial" m ON m.id = l."rawMaterialId" LEFT JOIN "Consumable" c ON c.id = l."consumableId", org
                 WHERE coalesce(m."organizationId", c."organizationId") = org.id),
  'recipeStockLots', (SELECT coalesce(json_agg(l), '[]') FROM "RecipeStockLot" l, org WHERE l."organizationId" = org.id),
  'priceHistory', (SELECT coalesce(json_agg(p), '[]') FROM "PriceHistory" p, org WHERE p."organizationId" = org.id),
  'tasks', (SELECT coalesce(json_agg(t ORDER BY t."parentTaskId" NULLS FIRST), '[]') FROM "Task" t, org WHERE t."organizationId" = org.id),
  'taskHistory', (SELECT coalesce(json_agg(h), '[]') FROM "TaskStatusHistory" h JOIN "Task" t ON t.id = h."taskId", org WHERE t."organizationId" = org.id),
  'reservations', (SELECT coalesce(json_agg(s), '[]') FROM "StockReservation" s, org WHERE s."organizationId" = org.id),
  'lotConsumptions', (SELECT coalesce(json_agg(c), '[]') FROM "LotConsumption" c JOIN "Task" t ON t.id = c."taskId", org WHERE t."organizationId" = org.id),
  'yieldHistory', (SELECT coalesce(json_agg(y), '[]') FROM "RecipeYieldHistory" y JOIN "Task" t ON t.id = y."taskId", org WHERE t."organizationId" = org.id),
  'movements', (SELECT coalesce(json_agg(m), '[]') FROM "StockMovement" m, org WHERE m."organizationId" = org.id
                 AND m."createdAt" > now() - interval '60 days'),
  -- Orders: everything except customerName / invoice bytes.
  'orders', (SELECT coalesce(json_agg(json_build_object(
                'id', o.id, 'orderNumber', o."orderNumber", 'status', o.status, 'fulfillmentType', o."fulfillmentType",
                'pickupLocationId', o."pickupLocationId", 'deliveryPoint', o."deliveryPoint",
                'hasDeliveryAddress', o."deliveryAddress" IS NOT NULL, 'hasCustomerName', o."customerName" IS NOT NULL,
                'externalStatus', o."externalStatus", 'isArchived', o."isArchived", 'archivedAt', o."archivedAt",
                'notes', o.notes, 'createdById', o."createdById", 'assignedToId', o."assignedToId", 'dueDate', o."dueDate",
                'createdAt', o."createdAt", 'updatedAt', o."updatedAt", 'completedAt', o."completedAt")), '[]') FROM ord o),
  'orderItems', (SELECT coalesce(json_agg(i), '[]') FROM "OrderItem" i JOIN ord o ON o.id = i."orderId"),
  'orderHistory', (SELECT coalesce(json_agg(h), '[]') FROM "OrderStatusHistory" h JOIN ord o ON o.id = h."orderId"),
  -- External order payloads: only non-personal WooCommerce fields.
  'externalOrders', (SELECT coalesce(json_agg(json_build_object(
                'id', e.id, 'externalId', e."externalId", 'orderId', e."orderId", 'syncStatus', e."syncStatus",
                'errorMessage', e."errorMessage", 'createdAt', e."createdAt", 'updatedAt', e."updatedAt",
                'provider', i.provider,
                'payload', jsonb_build_object(
                  'id', e."rawPayload"->'id', 'number', e."rawPayload"->'number', 'status', e."rawPayload"->'status',
                  'currency', e."rawPayload"->'currency', 'total', e."rawPayload"->'total',
                  'date_created', e."rawPayload"->'date_created', 'payment_method_title', e."rawPayload"->'payment_method_title',
                  'created_via', e."rawPayload"->'created_via',
                  'shipping_lines', (SELECT coalesce(jsonb_agg(jsonb_build_object('method_title', s->'method_title', 'total', s->'total')), '[]'::jsonb)
                                       FROM jsonb_array_elements(coalesce(e."rawPayload"::jsonb->'shipping_lines', '[]'::jsonb)) s),
                  'line_items', (SELECT coalesce(jsonb_agg(jsonb_build_object('product_id', li->'product_id', 'variation_id', li->'variation_id',
                                       'name', li->'name', 'quantity', li->'quantity', 'total', li->'total', 'sku', li->'sku')), '[]'::jsonb)
                                   FROM jsonb_array_elements(coalesce(e."rawPayload"::jsonb->'line_items', '[]'::jsonb)) li)))), '[]')
              FROM "ExternalOrderSource" e JOIN "Integration" i ON i.id = e."integrationId" JOIN ord o ON o.id = e."orderId"),
  'integrations', (SELECT coalesce(json_agg(json_build_object('id', i.id, 'provider', i.provider, 'status', i.status,
                   'lastSyncAt', i."lastSyncAt", 'createdAt', i."createdAt", 'updatedAt', i."updatedAt",
                   'storeUrl', i.config->>'storeUrl')), '[]') FROM "Integration" i, org WHERE i."organizationId" = org.id),
  'productMappings', (SELECT coalesce(json_agg(p), '[]') FROM "ProductMapping" p JOIN "Integration" i ON i.id = p."integrationId", org WHERE i."organizationId" = org.id),
  'salesDeductions', (SELECT coalesce(json_agg(s), '[]') FROM "SalesDeduction" s, org WHERE s."organizationId" = org.id),
  'salesDeductionLines', (SELECT coalesce(json_agg(l), '[]') FROM "SalesDeductionLine" l JOIN "SalesDeduction" s ON s.id = l."salesDeductionId", org WHERE s."organizationId" = org.id),
  'salesAliases', (SELECT coalesce(json_agg(a), '[]') FROM "SalesProductAlias" a, org WHERE a."organizationId" = org.id)
);
ROLLBACK;
