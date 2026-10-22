# Acadeea — Environment

There is ONE environment (production). No test server, no test apps.

| Layer | Value |
| --- | --- |
| API | https://api.acadeea.ro (container `acadeea-api`, host port 127.0.0.1:3001) |
| Web | https://app.acadeea.ro (container `acadeea-web`, host port 127.0.0.1:3010) |
| Postgres | `acadeea-postgres`, 127.0.0.1:5434, db `acadeea` |
| Redis | `acadeea-redis`, 127.0.0.1:6380 |
| MinIO | `acadeea-minio` (`pgsty/minio`), 127.0.0.1:9002 / 9003 |
| Server | `root@152.53.246.168`, `/opt/acadeea`, compose project `acadeea-ro` |
| iOS | scheme **Acadeea**, bundle `ro.acadeea.app`, configs Debug / Release |
| Android | flavor `prod` only, applicationId `ro.acadeea.app` (debug builds: `ro.acadeea.app.debug`) |

## Deploy

```bash
./docker/deploy-acadeea.sh
```

Needs `docker/.env.acadeea` locally (git-ignored; copy from `/opt/acadeea/docker/.env.acadeea` on
the server). The script: rsync repo → server (native apps excluded) → JWT keys (generated once, in
volume `acadeea-jwt-keys`) → build images → `prisma migrate deploy` in a one-off container →
`compose up -d` (api + web) → nginx vhosts for both domains → certbot when DNS points at the box.
Deploying rebuilds the web image (Next.js build on arm64 takes a few minutes).

## Local development

`pnpm install && pnpm dev` (api on :3000 by default, web on :3001 — see `.env.example`). For the
web to behave like production locally, set `NEXT_PUBLIC_STANDALONE_ORG=acadeea` and
`NEXT_PUBLIC_BRAND_NAME=Acadeea`. iOS: Debug builds honour `HORAE_API_URL` (env override) for a
local API; see `apps/ios/CLAUDE.md` → Simulator verification.
