#!/usr/bin/env bash
# Disposable local Postgres + Redis for the API e2e suite.
# Never points at a shared/prod database (helpers/env.ts refuses non-local hosts).
#
#   apps/api/test/e2e-db.sh          # start (idempotent) + migrate
#   apps/api/test/e2e-db.sh down     # remove the containers
#   pnpm --filter @horae/api test:e2e
set -euo pipefail

PG=horae-e2e-pg
REDIS=horae-e2e-redis
API_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export DATABASE_URL="postgresql://horae:horae_e2e@127.0.0.1:5455/horae_e2e?schema=public"

if [[ "${1:-}" == "down" ]]; then
  docker rm -f "$PG" "$REDIS" >/dev/null 2>&1 || true
  exit 0
fi

docker inspect "$PG" >/dev/null 2>&1 || docker run -d --name "$PG" \
  -e POSTGRES_USER=horae -e POSTGRES_PASSWORD=horae_e2e -e POSTGRES_DB=horae_e2e \
  -p 127.0.0.1:5455:5432 postgres:16-alpine >/dev/null
docker inspect "$REDIS" >/dev/null 2>&1 || docker run -d --name "$REDIS" \
  -p 127.0.0.1:6390:6379 redis:7-alpine >/dev/null
docker start "$PG" "$REDIS" >/dev/null

until docker exec "$PG" pg_isready -U horae -d horae_e2e >/dev/null 2>&1; do sleep 0.5; done

if [[ ! -f "$API_DIR/keys/jwt-private.pem" ]]; then
  mkdir -p "$API_DIR/keys"
  openssl genrsa -out "$API_DIR/keys/jwt-private.pem" 2048 2>/dev/null
  openssl rsa -in "$API_DIR/keys/jwt-private.pem" -pubout -out "$API_DIR/keys/jwt-public.pem" 2>/dev/null
fi

cd "$API_DIR"
pnpm exec prisma generate --schema=src/prisma/schema.prisma >/dev/null
pnpm exec prisma migrate deploy --schema=src/prisma/schema.prisma
