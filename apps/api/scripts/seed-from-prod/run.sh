#!/usr/bin/env bash
# Seed Horae TEST with the data shape of one PROD organization.
#   ./run.sh                 # extract → transform → dry run (ROLLBACK) → print counts
#   ./run.sh --apply         # same, then load for real (COMMIT)
# Env: HOST (default root@147.93.55.240), SLUG (default acadeea),
#      PROD_PG / TEST_PG container names, WORK (scratch dir, default ./.work).
# PROD is only ever queried inside a READ ONLY transaction with
# default_transaction_read_only=on. Nothing is written to prod.
set -euo pipefail
cd "$(dirname "$0")"
HOST="${HOST:-root@147.93.55.240}"
SLUG="${SLUG:-acadeea}"
PROD_PG="${PROD_PG:-acadeea-prod-postgres}"
TEST_PG="${TEST_PG:-acadeea-test-postgres}"
WORK="${WORK:-./.work}"
mkdir -p "$WORK"

prodq() { ssh -o ConnectTimeout=10 "$HOST" "docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' $PROD_PG sh -c 'psql -X -q -At -v ON_ERROR_STOP=1 -v slug=$SLUG -U \$POSTGRES_USER -d \$POSTGRES_DB'"; }
testq() { ssh -o ConnectTimeout=10 "$HOST" "docker exec -i $TEST_PG sh -c 'psql -X -v ON_ERROR_STOP=1 -v slug=$SLUG -U \$POSTGRES_USER -d \$POSTGRES_DB $*'"; }

echo "1/4 extract from prod (read-only)…"
prodq < extract.sql > "$WORK/prod-extract.json"
echo "2/4 look up existing test rows…"
testq -q -At < test-lookup.sql > "$WORK/test-lookup.json"
echo "3/4 transform…"
node transform.mjs "$WORK/prod-extract.json" "$WORK/test-lookup.json" > "$WORK/load.sql"
echo "4/4 load into test…"
if [[ "${1:-}" == "--apply" ]]; then
  testq < "$WORK/load.sql" | grep -E '^(INSERT|UPDATE|COMMIT|ROLLBACK)' | awk '{n+=$NF} END {print "rows written:", n}'
else
  sed 's/^COMMIT;$/ROLLBACK;/' "$WORK/load.sql" | testq | grep -E '^(INSERT|UPDATE)' | awk '{n+=$NF} END {print "dry run — rows that would be written:", n, "(re-run with --apply)"}'
fi
