#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# Acadeea API — standalone deployment (own VPS, own database)
# Target: 152.53.246.168 (api.acadeea.ro)
#
# Usage:
#   ./deploy-acadeea.sh   regular deploy (no seed)
#   ./deploy-acadeea.sh --seed  deploy + run bootstrap seed
#                         (idempotent: roles, initial admin from
#                         SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD, org row)
# ──────────────────────────────────────────────

RUN_SEED=false
if [ "${1:-}" = "--seed" ]; then
  RUN_SEED=true
fi

SERVER="152.53.246.168"
SERVER_USER="root"
REMOTE_DIR="/opt/acadeea"
DOMAIN="api.acadeea.ro"
COMPOSE_FILE="docker/docker-compose.acadeea-ro.yml"
ENV_FILE="docker/.env.acadeea"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "═══════════════════════════════════════════"
echo "  Acadeea API — Deployment"
echo "  Server: ${SERVER}"
echo "  Domain: ${DOMAIN}"
echo "═══════════════════════════════════════════"

# ──────────────────────────────────────────────
# Step 1: Sync project to server
# ──────────────────────────────────────────────
echo ""
echo "[1/5] Syncing project to server..."
# GitHub runner -> VPS SSH occasionally times out on first contact; retry the
# sync instead of failing the whole deploy (seen 2026-07-02, twice).
rsync_with_retry() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if rsync "$@"; then return 0; fi
    echo "   rsync attempt ${attempt} failed; retrying in 30s..."
    sleep 30
  done
  echo "   rsync failed after 5 attempts." >&2
  return 1
}
# Only files tracked in git + the deploy env go to the server — never local
# junk (.env.local, .vercel, backups, build output). rsync --files-from.
FILE_LIST=$(mktemp)
( cd "${PROJECT_DIR}" && git ls-files | grep -vE '^apps/(ios|android)/' && echo "${ENV_FILE}" ) > "$FILE_LIST"
rsync_with_retry -az --files-from="$FILE_LIST" \
  -e 'ssh -o ConnectTimeout=30 -o ServerAliveInterval=15' \
  "${PROJECT_DIR}/" \
  "${SERVER_USER}@${SERVER}:${REMOTE_DIR}/"
rm -f "$FILE_LIST"

echo "   Sync complete."

# ──────────────────────────────────────────────
# Step 2: Generate JWT keys on server (if missing)
# ──────────────────────────────────────────────
echo ""
echo "[2/5] Setting up JWT keys..."
ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=15 "${SERVER_USER}@${SERVER}" bash -s <<'REMOTE_JWT'
set -euo pipefail

KEY_TMP_DIR="/tmp/acadeea-jwt-keys"
mkdir -p "$KEY_TMP_DIR"

# Check if keys already exist in Docker volume
if docker volume inspect acadeea-jwt-keys >/dev/null 2>&1; then
  KEY_EXISTS=$(docker run --rm -v acadeea-jwt-keys:/keys alpine sh -c 'test -f /keys/jwt-private.pem && echo yes || echo no')
  if [ "$KEY_EXISTS" = "yes" ]; then
    echo "   JWT keys already exist in volume. Skipping generation."
    rm -rf "$KEY_TMP_DIR"
    exit 0
  fi
fi

echo "   Generating RS256 JWT key pair..."
openssl genrsa -out "$KEY_TMP_DIR/jwt-private.pem" 2048
openssl rsa -in "$KEY_TMP_DIR/jwt-private.pem" -pubout -out "$KEY_TMP_DIR/jwt-public.pem"
chmod 600 "$KEY_TMP_DIR/jwt-private.pem"
chmod 644 "$KEY_TMP_DIR/jwt-public.pem"

docker volume create acadeea-jwt-keys >/dev/null 2>&1 || true
docker run --rm \
  -v acadeea-jwt-keys:/keys \
  -v "$KEY_TMP_DIR":/src \
  alpine sh -c 'cp /src/jwt-private.pem /src/jwt-public.pem /keys/ && chown 1000:1000 /keys/*.pem'

rm -rf "$KEY_TMP_DIR"
echo "   JWT keys generated and stored in Docker volume."
REMOTE_JWT

# ──────────────────────────────────────────────
# Step 3: Build image, apply migrations, THEN swap containers
# ──────────────────────────────────────────────
# Migrations run in a ONE-OFF container from the freshly built image BEFORE
# the app container is replaced. Running them after (old behaviour) is a
# chicken-and-egg: new code that expects new columns crash-loops on boot, and
# `compose exec` can't reach a restarting container.
# NOTE: `prisma migrate deploy` requires a one-time baseline per environment
# (see docker/MIGRATION_BASELINE.md); never use `db push` against live DBs.
echo ""
echo "[3/5] Building image + applying database migrations..."
ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=15 "${SERVER_USER}@${SERVER}" "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} build api"
ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=15 "${SERVER_USER}@${SERVER}" "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} run --rm --no-TTY api /app/apps/api/node_modules/.bin/prisma migrate deploy --schema=apps/api/src/prisma/schema.prisma"
echo "   Database migrations applied."

echo ""
echo "[4/5] Starting containers..."
ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=15 "${SERVER_USER}@${SERVER}" "cd ${REMOTE_DIR} && docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up -d --build"
echo "   Containers started."

# ──────────────────────────────────────────────
# Optional: Bootstrap seed (only with --seed)
# ──────────────────────────────────────────────
if [ "$RUN_SEED" = true ]; then
  echo ""
  echo "[seed] Running bootstrap seed..."
  # Forward SEED_* vars from the server-side env file into the container
  ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=15 "${SERVER_USER}@${SERVER}" "cd ${REMOTE_DIR} && set -a && . ${ENV_FILE} 2>/dev/null; set +a && docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} exec -T -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD -e SEED_ADMIN_FIRST_NAME -e SEED_ADMIN_LAST_NAME -e SEED_ORG_NAME api node apps/api/dist/prisma/seed.js"
  echo "   Bootstrap seed complete."
fi

# ──────────────────────────────────────────────
# Step 5: Configure Nginx + SSL (api.acadeea.ro → API, app.acadeea.ro → web)
# ──────────────────────────────────────────────
echo ""
echo "[5/5] Configuring Nginx reverse proxy + SSL..."

ssh -o ServerAliveInterval=20 -o ServerAliveCountMax=15 "${SERVER_USER}@${SERVER}" bash -s <<'REMOTE_NGINX'
# NOTE: no `set -e` — a certbot failure (DNS not pointed here yet, lock) must
# NOT abort before nginx is reloaded with the correct vhosts.
set -uo pipefail
rm -f /etc/nginx/sites-enabled/default

proxy_block() {
  cat <<CONF
    client_max_body_size 50M;
    location / {
        proxy_pass http://127.0.0.1:$1;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
CONF
}

# domain:port pairs
for SITE in api.acadeea.ro:3001 app.acadeea.ro:3010; do
  DOMAIN="${SITE%%:*}"
  PORT="${SITE##*:}"
  CONF="/etc/nginx/sites-available/${DOMAIN}"
  LIVE="/etc/letsencrypt/live/${DOMAIN}"
  if [ -f "${LIVE}/fullchain.pem" ] && [ -f "${LIVE}/privkey.pem" ]; then
    {
      echo "server { listen 80; listen [::]:80; server_name ${DOMAIN}; return 301 https://\$host\$request_uri; }"
      echo "server {"
      echo "    listen 443 ssl; listen [::]:443 ssl;"
      echo "    server_name ${DOMAIN};"
      echo "    ssl_certificate ${LIVE}/fullchain.pem;"
      echo "    ssl_certificate_key ${LIVE}/privkey.pem;"
      proxy_block "$PORT"
      echo "}"
    } > "$CONF"
  else
    {
      echo "server {"
      echo "    listen 80; listen [::]:80;"
      echo "    server_name ${DOMAIN};"
      proxy_block "$PORT"
      echo "}"
    } > "$CONF"
  fi
  ln -sf "$CONF" "/etc/nginx/sites-enabled/${DOMAIN}"
done

if nginx -t; then systemctl reload nginx; echo "   Nginx configured."; else echo "   nginx -t FAILED"; exit 1; fi

# Certificates only once DNS points at this server (otherwise certbot fails —
# the next deploy retries).
MYIP=$(curl -4 -s --max-time 5 https://ifconfig.me || true)
for DOMAIN in api.acadeea.ro app.acadeea.ro; do
  if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then continue; fi
  if [ "$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')" != "$MYIP" ]; then
    echo "   ${DOMAIN}: DNS does not point here yet — HTTP only, no certificate."
    continue
  fi
  certbot --nginx -d "$DOMAIN" --cert-name "$DOMAIN" --non-interactive --agree-tos \
    --email admin@acadeea.ro --redirect \
    || echo "   certbot failed for ${DOMAIN} — retry next deploy"
done
systemctl reload nginx 2>/dev/null || true
REMOTE_NGINX

echo ""
echo "═══════════════════════════════════════════"
echo "  Deployment complete!"
echo ""
echo "  Web:  https://app.acadeea.ro"
echo "  API:  https://api.acadeea.ro/api/docs"
echo "═══════════════════════════════════════════"
