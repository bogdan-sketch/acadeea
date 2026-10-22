# Acadeea — management producție (on-prem)

Varianta dedicată Acadeea a platformei Horae: rețete, task-uri de producție, stocuri, comenzi
(WooCommerce / eBriza), transferuri între locații. Rulează pe serverul propriu Acadeea, cu bază de
date proprie, legat de o singură organizație (`acadeea`) — login direct, fără Horae.

| | |
| --- | --- |
| Web | https://app.acadeea.ro |
| API | https://api.acadeea.ro (`/api/v1`, docs la `/api/docs`) |
| Server | `152.53.246.168` (netcup, Debian 13, arm64) |

## Structură

```
apps/api      NestJS + Prisma + PostgreSQL — backend
apps/web      Next.js — aplicația web
packages/     tipuri comune (@horae/shared-types) + config TS/ESLint
docker/       Dockerfile (API), Dockerfile.web, docker-compose.acadeea-ro.yml, deploy-acadeea.sh
docs/         arhitectură + model de date
```

Pe server rulează în Docker: `acadeea-api` (127.0.0.1:3001), `acadeea-web` (127.0.0.1:3010),
`acadeea-postgres`, `acadeea-redis`, `acadeea-minio` — toate doar pe loopback; nginx + Let's Encrypt
expun `api.acadeea.ro` și `app.acadeea.ro`.

## Deploy

1. Creează `docker/.env.acadeea` (nu e în git — conține parolele): Postgres, MinIO, SMTP, JWT expiry,
   `CORS_ORIGINS=https://app.acadeea.ro`, `FRONTEND_URL=https://app.acadeea.ro`, `BASE_DOMAIN=`.
   Pornește de la `.env.example`.
2. `./docker/deploy-acadeea.sh` — sincronizează codul pe server, generează cheile JWT (o singură
   dată), construiește imaginile, aplică migrările (`prisma migrate deploy`), pornește containerele,
   configurează nginx și certificatele (după ce DNS-ul arată spre server).

Mod standalone (web): `NEXT_PUBLIC_STANDALONE_ORG=acadeea` + `NEXT_PUBLIC_BRAND_NAME=Acadeea`
(setate în `docker-compose.acadeea-ro.yml`) — orice domeniu = organizația Acadeea, fără landing.
API: `BRAND_NAME=Acadeea` pentru textul din emailuri.

## Dezvoltare locală

```bash
pnpm install
pnpm dev          # api + web
```

Detalii tehnice: `CLAUDE.md`, `apps/*/CLAUDE.md`, `docs/ARCHITECTURE.md`.
