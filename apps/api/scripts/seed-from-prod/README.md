# seed-from-prod

These scripts copy one organization's **data shape** from PROD into TEST, so tests run against realistic
recipes, stock, tasks and orders. PROD is only read: every prod query runs in a `READ ONLY` transaction
with `default_transaction_read_only=on`.

```bash
cd apps/api/scripts/seed-from-prod
./run.sh            # extract → transform → dry run on test (ROLLBACK), prints the row count
./run.sh --apply    # same, then COMMIT on test
```

Env overrides: `HOST` (default `root@147.93.55.240`, which hosts both stacks), `SLUG` (default `acadeea`),
`PROD_PG` / `TEST_PG` (default `acadeea-prod-postgres` / `acadeea-test-postgres`), `WORK` (scratch dir,
default `./.work`, gitignored). You need SSH access to the host and Node 20+. There are no npm dependencies.

## Files

| File | What it does |
| --- | --- |
| `extract.sql` | Read-only SELECT on prod. It returns one JSON document with the org's categories, suppliers, materials, consumables, recipes (components, ingredients, byproducts), stock per location, lots, price history, tasks (history, reservations, lot consumptions, yields), the last 60 days of movements and orders, sales deductions and aliases, and integrations. |
| `test-lookup.sql` | Read-only SELECT on test. It lists the natural keys that already exist, so nothing is duplicated. |
| `transform.mjs` | Remaps ids and writes `load.sql`, one transaction where every statement is `INSERT … ON CONFLICT DO NOTHING`. |
| `run.sh` | Runs the steps above. |

## Guarantees

- **Idempotent.** Each prod id maps to a deterministic test id (sha1, uuid v5 style). A second `--apply`
  writes 0 rows.
- **Add, never wipe.** Rows that already exist on test are reused by natural key and are never modified:
  location by name, then by type; category by name + kind; supplier, material and consumable by name;
  recipe by name + type; order by number; integration by provider. Their children (components, stock
  rows, lots, movements, reservations) are not copied either.
- **Users are not copied.** Each prod user maps to an existing test user with the same role name
  (deterministic pick, never `claude-verify@horae.ca`). If no role matches, the first Administrator is used.
- **No personal data leaves prod.** `extract.sql` never selects customer names, delivery addresses,
  supplier contacts, WooCommerce billing/shipping/meta/IP fields or integration `config`.
  `transform.mjs` fills those columns with fake Romanian values: names from a fixed list, `07xxxxxxxx`
  phones and `@example.com` e-mails.
- **No secrets.** A provider that is missing on test is created with `config = {}` (plus the public
  `storeUrl`). An integration that already exists on test keeps its own config.
