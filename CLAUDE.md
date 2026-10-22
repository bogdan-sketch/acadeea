# Acadeea — On-prem Guide

**Acadeea** is a confectionery (pastry) business. This repo is its **own, on-prem copy of the Horae
platform**: recipes, production tasks, stock, orders (WooCommerce / eBriza), deliveries,
multi-location transfers, analytics. One NestJS backend serves a Next.js web app, a native iOS app
and a native Android app — all branded **Acadeea**, all talking to **api.acadeea.ro**.

> **Read [`STATUS.md`](STATUS.md) first** — what is live, what is pending, open decisions. Keep it
> current: when you finish something, update it in the same commit.

## What this repo is (and is not)

- It is a **clone** of Horae (horae.ca, Sergiu Tigan's multi-tenant SaaS) taken on **2026-10-22**,
  turned into a **single-organization deployment** for Acadeea on its own server, domains and apps.
- It is **NOT** Horae. Horae.ca keeps running separately (its own repo, servers, apps). **Never**
  point anything here at `*.horae.ca`, and never change Horae from here. Fixes made here are not
  synced to Horae automatically, and vice versa (port by hand if both need it).
- The code still carries Horae names internally (Swift module/target `Horae`, Kotlin package
  `com.horae.app`, npm scope `@horae/*`, `HoraeTheme`, …). That is intentional — renaming would be
  a huge risky diff. **Everything the user sees says "Acadeea"**; keep it that way.
- The database still has the multi-tenant schema (`Organization`, `organizationId` everywhere). It
  holds one active org, slug **`acadeea`** (the `demo` org is deactivated). Keep the tenant
  scoping intact — it costs nothing and keeps the code identical to how it was built.

## Live system

| | |
| --- | --- |
| Web | https://app.acadeea.ro (Next.js, container `acadeea-web`) |
| API | https://api.acadeea.ro — REST `/api/v1/*`, Swagger `/api/docs`, Socket.IO `/ws` |
| Server | `root@152.53.246.168` — netcup VPS, **arm64**, Debian 13, 2 vCPU / 4 GB + 4 GB swap. SSH key only (password login disabled) |
| iOS app | **Acadeea**, bundle `ro.acadeea.app`, App Store Connect app id `6825881291`, TestFlight group "Real Users" |
| Android app | **Acadeea**, applicationId `ro.acadeea.app` (Google Play listing not created yet) |
| DNS | `acadeea.ro` zone is at the client's hosting (activdesign / wdp-gazduire), not managed from here. `app` + `api` A records → `152.53.246.168` |

Server layout (`/opt/acadeea`, compose project `acadeea-ro`, file `docker/docker-compose.acadeea-ro.yml`):
`acadeea-api` (127.0.0.1:3001), `acadeea-web` (127.0.0.1:3010), `acadeea-postgres` (5434),
`acadeea-redis` (6380), `acadeea-minio` (9002/9003) — **every port bound to 127.0.0.1** (Docker
bypasses UFW; never publish on 0.0.0.0). nginx + Let's Encrypt in front (certbot timer renews).
MinIO image is `pgsty/minio` (official `minio/minio` left Docker Hub and the box is arm64).
API logs: `journalctl CONTAINER_TAG=acadeea-api`. iOS push (APNs, key `HLW2KVPK4Z`, team
`2C3LQ6B4B4`) is ON: the `.p8` lives in `/opt/acadeea-apns` on the server.

## Repo layout

```
apps/api        NestJS + Prisma + PostgreSQL — the single source of truth  → apps/api/CLAUDE.md
apps/web        Next.js 16 (App Router)                                    → apps/web/CLAUDE.md
apps/ios        SwiftUI (iOS 17+), project Acadeea.xcodeproj from project.yml → apps/ios/CLAUDE.md
apps/android    Kotlin + Jetpack Compose                                    → apps/android/CLAUDE.md
packages/       @horae/shared-types (enums + error codes), tsconfig, eslint-config
docker/         Dockerfile (API), Dockerfile.web, docker-compose.acadeea-ro.yml, deploy-acadeea.sh
docs/           ARCHITECTURE.md (data model + endpoint map), ENVIRONMENTS.md, design docs
```

The per-app `CLAUDE.md` files were written for Horae; their technical content (architecture,
conventions, gotchas) is accurate here. Where they mention Horae environments, test builds,
`api.horae.ca`, Vercel or TestFlight "Horae Test" — that does not apply; this file and
`docs/ENVIRONMENTS.md` win.

## Standalone (single-org) mode — how the Acadeea branding works

| Layer | Switch | Effect |
| --- | --- | --- |
| Web | `NEXT_PUBLIC_STANDALONE_ORG=acadeea`, `NEXT_PUBLIC_BRAND_NAME=Acadeea` (build args in the compose file; `apps/web/src/lib/brand.ts`) | every host = the acadeea org: no marketing landing, no apex→subdomain handoff, no legacy banner; "Horae" copy → "Acadeea"; Google/Apple buttons hidden (no client ids) |
| API | `BRAND_NAME=Acadeea` (compose env) | email subjects/copy; `CORS_ORIGINS`/`FRONTEND_URL` = `https://app.acadeea.ro`, `BASE_DOMAIN` empty |
| iOS | Info.plist `API_BASE_URL`, `BRAND_NAME`, `ORG_SLUG` (set in `apps/ios/project.yml`, read by `AppConfig`) | api.acadeea.ro; brand name; public branding fetched before login (logo + accent on the splash); login form ON the splash; no Apple/Google sign-in |
| Android | `BuildConfig.BASE_URL`, `BRAND_NAME`, `ORG_SLUG` (single `prod` flavor in `app/build.gradle.kts`) | same as iOS (logo on the splash via Coil, public branding before login) |

There is **no test environment** — one server, one app per platform. Try risky things locally
(`pnpm dev` + local Postgres) or in the iOS Simulator / Android emulator before deploying.

## How the pieces talk

- All clients are thin over the API: REST `/api/v1/*` (JSON, JWT RS256 Bearer, refresh-token
  rotation: access 12h, refresh 30d, multi-device) + Socket.IO `/ws`. No shared client code — each
  client re-implements DTOs and its permission map against the same contract.
- `POST /auth/login` → `{accessToken, refreshToken, user, organization}`; on `401` call
  `POST /auth/refresh` once (single-flight); refresh failure → logout.
- Authorization is CASL (action × subject) from DB-defined roles (`apps/api/src/modules/roles/
  role-definitions.ts`). Role slugs: `administrator`, `sef-cofetar`, `cofetar`, `gestionar`,
  `sofer`, `user`. The `@horae/shared-types` `UserRole` enum + client permission maps are legacy and
  can drift — check abilities, not role names.
- WooCommerce orders arrive through a **10-minute poll** of the shop (no webhook secret is
  configured, so Woo webhooks are not used). eBriza sends nothing today.

## Common commands

```bash
pnpm install && pnpm dev                       # api + web locally
pnpm --filter @horae/api build|test|lint       # backend
pnpm --filter web build|test|lint              # web
./docker/deploy-acadeea.sh                     # deploy api + web to the server (needs docker/.env.acadeea)
```

iOS: `cd apps/ios && xcodegen generate` then build scheme **Acadeea** (`Acadeea.xcodeproj`). After
`xcodegen`, if SPM complains about a missing `Package.resolved`, keep the committed one under
`Acadeea.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/`.
Android: `cd apps/android && ./gradlew assembleProdDebug` (JDK 17; `assembleProdRelease` needs the
signing config — see `apps/android/CLAUDE.md` top section).

## Conventions (unchanged from Horae)

- **Romanian domain language** — enum values (`DE_FACUT`, `IN_LUCRU`, `FINALIZAT`, `NOUA`,
  `LIVRATA`, …) and all user-facing text are Romanian.
- **The API is the source of truth.** A model/enum/endpoint change in `apps/api` must be mirrored
  by hand into web (`src/lib/types.ts`), iOS (`Features/*/Models`, `Core/Theme/Enums.swift`),
  android (`data/remote/dto`, `domain/model/Enums.kt`) and, for shared enums/error codes,
  `packages/shared-types`.
- **Schema changes ship as Prisma migrations** (`prisma migrate dev` locally); deploy runs
  `prisma migrate deploy`. Never `db push` against the live DB.
- **Build gate:** every platform you touch must build green before you call it done (`pnpm --filter
  <x> build`, `xcodebuild`, `./gradlew assembleProdDebug`). UI changes: look at them in the
  Simulator / emulator, not only "it compiles".
- Conventional Commits (`feat(web): …`, `fix(api): …`, `feat(mobile-ios): …`).
- Never commit secrets: `docker/.env.acadeea`, `apps/ios/Config/Observability.xcconfig`,
  `apps/android/local.properties`, keystores, `.p8` keys all stay out of git (they are ignored).
- When you finish a change: update `STATUS.md`, and the affected `CLAUDE.md` if behaviour changed.
