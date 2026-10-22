-- WooCommerce orders: createdAt = the time the customer placed the order in the
-- shop (date_created_gmt), not the moment the sync stored it, so the list sorts
-- WOO-11643 above WOO-11642. One-off backfill for orders imported before 1.34.0.
UPDATE "Order" o
SET "createdAt" = ((eos."rawPayload"->>'date_created_gmt') || 'Z')::timestamptz
FROM "ExternalOrderSource" eos
WHERE eos."orderId" = o.id
  AND o."orderNumber" LIKE 'WOO-%'
  AND COALESCE(eos."rawPayload"->>'date_created_gmt', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}';
