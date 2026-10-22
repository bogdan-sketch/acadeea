# One-time migration baseline (db push → migrate deploy)

Until 1.8.0 the deploy scripts ran `prisma db push --accept-data-loss`, which
reconciles the live DB to `schema.prisma` **without recording anything in
`_prisma_migrations`** — and destructively drops any DB-only columns/indexes.
The scripts now run `prisma migrate deploy`, which only applies migration
folders that are not yet recorded as applied.

Because `db push` never wrote history, the first `migrate deploy` on an
existing environment would try to re-run every migration from `init` and fail
on existing tables. Each environment (prod + test) therefore needs a
**one-time baseline** marking all pre-existing migrations as applied.

## Procedure (per environment, BEFORE the first 1.8.0 deploy)

1. **Snapshot the DB** (pg_dump or the in-app BackupModule export).
2. Baseline every migration folder that predates the multi-tenancy activation
   (everything up to and including `20260706150000_recipe_finished_weight`):

```bash
ssh <user>@<server> "cd <remote-dir> && docker compose -f <compose-file> --env-file <env-file> exec -T api sh -c '
  for m in \
    20260608115239_init \
    20260608134403_add_orders_system \
    20260609000000_add_multi_tenancy \
    20260609100000_add_dynamic_roles \
    20260610000000_backlog_schema_changes \
    20260611000000_dynamic_categories \
    20260611100000_recipe_category_config \
    20260616000000_password_reset_and_lockout \
    20260617000000_remove_task_dependencies \
    20260617010000_remove_task_templates \
    20260617020000_add_item_category \
    20260617030000_category_kind \
    20260617040000_rawmaterial_lot_expiry_system_category \
    20260628010000_per_location_stock \
    20260628020000_add_miligrame_unit \
    20260628030000_category_hierarchy_color \
    20260629010000_category_kind_color \
    20260629020000_dynamic_super_categories \
    20260704010000_recipe_archive \
    20260706120000_adhoc_transfer_destination \
    20260706150000_recipe_finished_weight \
    20260706230000_reconcile_schema_drift \
  ; do /app/apps/api/node_modules/.bin/prisma migrate resolve --applied \$m --schema=apps/api/src/prisma/schema.prisma; done'"
```

   Note `20260609000000_add_multi_tenancy` is baselined as applied even though
   `db push` later dropped its columns — the 1.8.0 migration
   `*_promote_multi_tenancy_schema` re-creates everything idempotently.
   `20260706230000_reconcile_schema_drift` is also baselined: it exists only so
   FRESH databases can rebuild the exact pre-1.8.0 schema (the old chain was
   incomplete because environments were maintained via `db push`); live DBs
   already have that schema and must never execute it.

   The first real migrations `migrate deploy` will run on a live env are
   `20260707000000_promote_multi_tenancy_schema` and
   `20260707010000_tenant_scope_remaining_models` — both fully idempotent.

3. Run the deploy script normally. `migrate deploy` applies only the new
   1.8.0+ migration folders.

## Do NOT

- Do not run `prisma db push` against prod/test ever again.
- Do not run the baseline twice (`migrate resolve` errors on already-recorded
  migrations — harmless, but noisy).
