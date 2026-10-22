# Horae — Monorepo Guide

Horae (**horae.ca**) is a multi-tenant production/inventory management platform for confectionery
(pastry) businesses: recipes, production tasks, stock, orders, deliveries, multi-location transfers,
equipment, and analytics. One NestJS backend serves a Next.js web app, a native iOS app, and a native
Android app. **"Acadeea"** is now just the seed/flagship organization (slug `acadeea`) — one tenant
among many, not the product. Each organization is white-labelled (name, accent color, logos, font,
app icon) and fully data-isolated (§ multi-tenancy below).

> **Start here, then read the per-app `CLAUDE.md`** for whatever you're touching. System-wide
> architecture and the full data model live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
>
> **Before implementing any request, follow [`docs/IMPLEMENTATION_GUIDE.md`](docs/IMPLEMENTATION_GUIDE.md)** —
> classify the request, locate the files, plan the vertical slice, then ripple backend-first across all
> platforms. It exists to stop random edits and half-rippled features.

## Repo layout

```
acadeea/
├── apps/
│   ├── api/        NestJS + Prisma + PostgreSQL backend — the single source of truth   → apps/api/CLAUDE.md
│   ├── web/        Next.js 16 (App Router) admin/dashboard web app                      → apps/web/CLAUDE.md
│   ├── ios/        Native SwiftUI app (iOS 17+)                                         → apps/ios/CLAUDE.md
│   └── android/    Native Kotlin + Jetpack Compose app (early-stage)                    → apps/android/CLAUDE.md
├── packages/
│   ├── shared-types/   TS enums + error codes shared by api + web (@horae/shared-types) → packages/shared-types/CLAUDE.md
│   ├── eslint-config/  Shared ESLint config
│   └── tsconfig/       Shared TS configs
├── docs/
│   ├── ARCHITECTURE.md   System architecture + full data model / schema reference
│   └── openapi/          Exported OpenAPI spec (apps/api `openapi:export`)
└── docker/               Compose + service Dockerfiles
```

Two isolated environments (Prod = **Horae.ca**, Test = **Horae.ca Test**) span every layer — API, web, and
both native apps. See [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md) for hosts, ports, deploy scripts,
and how each client selects its environment.

> ⚠️ **Branch flow (release branches + PRs, since 2026-07-03 evening):** day-to-day work lands on
> a **`release/<x.y.z>`** branch (one per upcoming version, e.g. `release/1.2.0`; bump with
> `scripts/bump-version.sh` + extend the changelog entry there). Nothing merges anywhere until the
> user says so:
>
> - **"deploy the new version"** → open a PR **`release/<x.y.z>` → `dev`**, merge it; `dev`
>   auto-deploys to **Horae.ca Test** (API via `deploy-test.sh`, web via the Vercel `horae-test`
>   project tracking `dev`). Then start the next `release/…` branch from `dev`.
> - **"deploy prod"** → open a PR **`dev` → `main`** whose body aggregates, nicely formatted, the
>   changelog entries (from `apps/api/src/modules/changelog/changelog.data.ts`) of every version
>   included since the last prod release; merge it. `main` auto-deploys to prod (Horae.ca).
>
> The `pre-push` hook blocks direct main pushes — main only advances by merging tested dev via PR.
> Urgent prod hotfixes: fix on a `release/x.y.z+1` patch branch → PR to dev, verify on test, then
> PR dev → main immediately. The old "work directly on dev" and dual-push rules are retired.

Tooling: **pnpm** workspaces (`pnpm-workspace.yaml`) + **Turborepo** (`turbo.json`). Conventional
Commits enforced via commitlint + husky; prettier on commit via lint-staged. The native apps
(ios, android) are NOT part of the pnpm/turbo graph — build them with their native toolchains.

## How the pieces talk

```
                ┌──────────── REST /api/v1/* (JWT Bearer) ───────────┐
                │              WebSocket /ws (Socket.IO)              │
   ┌─────────┐  │   ┌─────────┐   ┌─────────┐   ┌──────────────┐     │
   │  web    │──┤   │  iOS    │   │ Android │   │ eBriza /     │     │
   │ Next.js │  │   │ SwiftUI │   │ Compose │   │ WooCommerce  │─────┘ (webhooks → external orders)
   └─────────┘  │   └─────────┘   └─────────┘   └──────────────┘
                ▼
        ┌───────────────┐      ┌──────────────┐
        │  apps/api     │──────│  PostgreSQL  │
        │  NestJS       │      └──────────────┘
        │               │──────┌──────────────┐
        └───────────────┘      │ Redis, S3,   │
                               │ SMTP         │
                               └──────────────┘
```

- **All four clients are thin** over the API. There is no shared business logic across clients —
  each re-implements its own DTOs/models and permission map against the same REST contract.
- **Contract:** REST under `/api/v1/*`, JSON, JWT (RS256) Bearer auth with refresh-token rotation.
  Real-time pushes over Socket.IO namespace `/ws`. See `docs/ARCHITECTURE.md` for the endpoint map.
- **Auth is identical everywhere:** `POST /auth/login` → `{accessToken, refreshToken, user, organization,
handoffCode?}` (the `organization` block carries white-label branding; `handoffCode` is the single-use
  apex→subdomain session transfer, present on login only); access
  token in `Authorization: Bearer`; on `401` call `POST /auth/refresh` (single-flight — server rotates
  refresh tokens); on refresh failure, log out. Access 12h / refresh 30d, **multi-device**. Emails are
  lowercased server-side. Password reset / forgot-password, 5-fail account lockout, and admin
  reactivation (emails a set-password link) all flow through `apps/api` `modules/password`; the emailed
  links open the **web** `/reset-password` page. Removed (don't re-add): **task dependencies** and
  **task templates**. Stock items (`RawMaterial`/`Consumable`) carry a nullable admin `category`
  (null = "Misc") from the same list as recipe categories.
- **Authorization is CASL-based** (action × subject). The backend computes abilities from
  **dynamic, DB-defined roles**. Each client ALSO keeps its own permission map to hide UI — those
  maps can drift from the backend (see the role warning below).

## Multi-tenancy (Horae)

Every tenant is an **Organization** row (`slug` unique, `isActive`, white-label branding). The API is
**fully org-scoped**: ~22 Prisma models carry `organizationId`, and a tenant Prisma client extension
(`apps/api/src/prisma/tenant.extension.ts`) auto-injects it into reads and stamps it on writes, driven
by request-scoped `AsyncLocalStorage` (`tenant-context.ts`). Per-tenant uniques replace the old globals
(`Order.orderNumber`, `Location.name`, `Role` slug/name, category configs, document serials are unique
**per org**). Enforcement level is the `TENANT_ENFORCEMENT` env (`warn` default | `strict` | `off`).

- **JWT carries `organizationId` + `orgSlug`.** Tokens minted before multi-tenancy are rejected with
  `401` → clients refresh (or, if refresh fails, re-login). WebSocket rooms are org-scoped
  (`org:<id>`, `org:<id>:role:<slug>`); old tokens can't connect.
- **Web is host-routed:** the marketing landing lives on the apex (`horae.ca`); each org's app on
  `<slug>.horae.ca` (test env: `test.horae.ca` / `*.test.horae.ca`; legacy `app.acadeea.ro` is aliased
  via `NEXT_PUBLIC_LEGACY_HOSTS`). Login on the apex mints a single-use **handoff code** that transfers
  the session to the org subdomain (`POST /auth/handoff/redeem`).
- **Org provisioning** is platform-operator only (`PLATFORM_ADMIN_EMAILS` env, `PlatformAdminGuard`):
  `POST /api/v1/organizations` clones the standard role set, seeds unit conversions + a system category,
  and emails the first admin an invitation. Role/slug definitions are shared in
  `apps/api/src/modules/roles/role-definitions.ts` (used by both provisioning and the seed).
- **Deploy runs Prisma migrations** (`prisma migrate deploy`), NOT the old destructive `db push
--accept-data-loss`. Each live env was baselined once — see `docker/MIGRATION_BASELINE.md`.

## ⚠️ Roles: dynamic in the backend, hardcoded (and stale) in clients

The standard role set is defined once in `apps/api/src/modules/roles/role-definitions.ts`
(`ROLE_DEFINITIONS`) and cloned **per organization** into the DB (`Role` + `RolePermission`) by both
the seed and org provisioning. Current slugs: `administrator`, `sef-cofetar`, `cofetar`, `gestionar`,
`sofer`, `user`. Admin short-circuits to `manage all`. Roles are now per-tenant, so slugs are unique
per org, not globally.

The `@horae/shared-types` `UserRole` enum and the web/android hardcoded permission maps still list
an **older role set** (`SEF_LABORATOR`, `SEF_EVENIMENTE`, `PATISER`, `AJUTOR_COFETAR`, `MAGAZIONER`).
Treat the **DB/seed roles as authoritative**; the enum is legacy. Don't add new authorization logic
keyed off the shared-types enum — check abilities, not role names.

## Common commands (from repo root)

```bash
pnpm install          # install all JS workspaces
pnpm dev              # turbo dev (runs api + web dev servers)
pnpm build            # turbo build
pnpm lint             # turbo lint
pnpm test             # turbo test
pnpm format           # prettier across the repo
```

Backend-only (run in `apps/api`, or `pnpm --filter @horae/api ...`): `prisma:migrate`,
`prisma:generate`, `prisma:seed`, `openapi:export`. Native apps build via Xcode (`apps/ios`) and
Gradle (`apps/android`) — see their `CLAUDE.md`.

**Versioning & changelog.** Semver, single source = repo-root `VERSION`; bump with
`scripts/bump-version.sh <x.y.z>` (propagates to iOS `project.yml` + regenerates the Xcode
project, android `versionName`, web/api `package.json`). Minor for feature batches, patch for
fixes — bump on `dev` per batch; merging to main releases that version. The user-facing changelog
(Romanian, curated — NOT commit messages) lives in
`apps/api/src/modules/changelog/changelog.data.ts`, served by public `GET /api/v1/changelog`,
rendered at web `/changelog` and iOS Settings → "Noutăți" + a one-time "Ce e nou" popup after
update (all three shown only on the test environment). When a feature batch lands on dev, extend
the current version's entry.

## Cross-cutting conventions

- **Romanian domain language.** Enum values and many status names are Romanian
  (`DE_FACUT`, `IN_LUCRU`, `FINALIZAT`, `NOUA`, `IN_TRANZIT`, `LIVRATA`, `INTRARE`, `IESIRE_PRODUCTIE`,
  `DEPOZIT`, `FRIGIDER`...). User-facing strings are Romanian; keep them so.
- **The API is the source of truth for the data model.** When a model/enum/endpoint changes in
  `apps/api`, the change must be mirrored by hand into web (`src/lib/types.ts`), iOS
  (`Features/*/Models` + `Core/Theme/Enums.swift`), android (`data/remote/dto` + `domain/model/Enums.kt`),
  and — if it's a shared enum/error code — into `packages/shared-types`.
- **Error codes** are centralized in `packages/shared-types/src/error-codes.ts` and re-implemented in
  each client's error mapper (e.g. iOS `APIError.swift`). Keep them in sync.
- **Build gate:** every platform you touch must build green before the work is done. On a red build,
  fix the cause and rebuild in a loop until it passes (iOS: `xcodebuild`; android: `./gradlew
assembleDebug`; web/api: `pnpm --filter <x> build`). Never report a change complete on a red build.
  Details in [`docs/IMPLEMENTATION_GUIDE.md`](docs/IMPLEMENTATION_GUIDE.md) Phase 4.
- When you finish a change, update the affected `CLAUDE.md` (and `docs/ARCHITECTURE.md` if the model
  or cross-app contract changed).
  </content>
  </invoke>
