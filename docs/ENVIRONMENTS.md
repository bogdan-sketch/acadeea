# Horae — Environments (Prod & Test)

Two fully isolated environments, each with its own backend, web, and native apps. "Test" is branded
**Horae.ca Test**; "Prod" is **Horae.ca**.

| Layer            | Prod (Horae.ca)         | Test (Horae.ca Test)                   |
| ---------------- | ----------------------- | -------------------------------------- |
| API              | https://api.horae.ca    | https://api-test.horae.ca              |
| Web              | https://<slug>.horae.ca | https://<slug>.test.horae.ca           |
| iOS scheme       | `Horae` (Debug/Release) | `Horae Test` (Debug-Test/Release-Test) |
| iOS bundle id    | `dev.tigan.acadeea`     | `dev.tigan.acadeea.test`               |
| Android flavor   | `prod`                  | `test`                                 |
| Android appId    | `com.acadeea.app`       | `com.acadeea.app.test`                 |
| App display name | Horae                   | Horae Test                             |

Web is host-routed per organization (`<slug>` = org slug, e.g. `acadeea`). Legacy hosts
`app.acadeea.ro` / `app-test.acadeea.ro` remain aliased for the seed org (see `NEXT_PUBLIC_LEGACY_HOSTS`).

Both native apps install **side by side** (distinct bundle ids / applicationIds).

## Server (147.93.55.240)

Both stacks run on one host, isolated by Docker Compose **project name**, container names, host ports,
volumes, and network. Nginx + Certbot terminate TLS per domain and reverse-proxy to the API container.

|                     | Prod                                | Test                                   |
| ------------------- | ----------------------------------- | -------------------------------------- |
| Compose project     | `acadeea-prod`                      | `horae-test`                           |
| Remote dir          | `/opt/acadeea`                      | `/opt/acadeea-test`                    |
| Compose file        | `docker/docker-compose.acadeea.yml` | `docker/docker-compose.horae-test.yml` |
| Env file            | `docker/.env.production`            | `docker/.env.test`                     |
| API host port       | 3001                                | 3002                                   |
| Postgres            | 5434 · db `acadeea`                 | 5435 · db `acadeea_test`               |
| Redis               | 6380                                | 6381                                   |
| MinIO (api/console) | 9002 / 9003 · bucket `acadeea`      | 9004 / 9005 · bucket `acadeea-test`    |
| Volumes             | `acadeea-prod-*`                    | `acadeea-test-*`                       |
| JWT keys volume     | `acadeea-prod-jwt-keys`             | `acadeea-test-jwt-keys`                |

### Deploy

```bash
./docker/deploy.sh            # prod  (add --seed to bootstrap roles/admin/org)
./docker/deploy-test.sh       # test  (add --seed)
```

Each script: rsync repo → its remote dir → ensure JWT keys → `compose up -d --build` → `prisma db push`
→ (optional seed) → nginx + certbot. They are independent and safe to run separately.

> ⚠️ **Why the compose files pin `name:` (do not remove).** Both compose files live under a
> `.../docker/` directory, so Docker Compose's default project name (basename of the file's dir) would
> be `docker` for **both** — running one stack would then reconcile the _other_ stack's containers as
> orphans and delete them. Each compose file sets a top-level `name:` (`acadeea-prod` / `horae-test`)
> to keep the projects distinct. This actually happened once: a test deploy removed the prod API
> containers (data volumes survived; containers were recreated by re-running `deploy.sh`).

## Branching & CI/CD

| Branch | Environment          | Deploy trigger                                                    |
| ------ | -------------------- | ----------------------------------------------------------------- |
| `dev`  | Horae.ca Test (test) | every push → `.github/workflows/deploy.yml` runs `deploy-test.sh` |
| `main` | Horae.ca (prod)      | every push/merge → runs `deploy.sh`                               |

Flow: work on `dev` (auto-deploys to test); when verified, open a PR `dev → main`; merging
auto-deploys prod. `main` is for tested changes + hotfixes only.

**Push-to-deploy secrets** (repo → Settings → Secrets): `DEPLOY_SSH_KEY` (CI's SSH key; its public
half is in the server's `~/.ssh/authorized_keys`), `ENV_PRODUCTION`, `ENV_TEST` (the env files, since
both are gitignored). The workflow passes secrets via `env:` (never inline in `run:`) so their
contents aren't parsed as shell.

**Protecting `main`:** GitHub branch protection / rulesets need a paid plan on private repos, so they
are NOT enabled. Stand-in: a husky `pre-push` hook blocks direct `git push` to `main` (use a PR;
emergency hotfix escape hatch: `git push --no-verify`). For real server-side protection, make the repo
public or upgrade to GitHub Pro/Team, then add a ruleset requiring a PR + the CI checks.

**CI (`ci.yml`): Lint, Test, Build all green.** Keep it that way. Notes on how it's wired:
the shared eslint config disables `@typescript-eslint/no-unused-expressions` (it crashes to load
under eslint 8.57 + ts-eslint 8.60); web downgrades React 19's `set-state-in-effect` to a warning
(the app's fetch-in-`useEffect` pattern); `Test` applies the schema with `prisma db push` (not
interactive `migrate dev`); the api `build` script runs `prisma generate` first so a fresh checkout
compiles; api `test` uses `jest --passWithNoTests`. CI runs on push to `main`/`dev` and PRs to `main`.

## Clients

- **iOS** — environment chosen at compile time via the `API_TEST` Swift active-compilation condition
  (set on the `Debug-Test`/`Release-Test` configs in `apps/ios/project.yml`). `Core/Config/AppConfig.swift`
  switches `baseURL` on it. Pick the **scheme** in Xcode (`Horae` vs `Horae Test`). After editing
  `project.yml`, run `xcodegen generate`.
- **Android** — environment chosen by **product flavor** (`apps/android/app/build.gradle.kts`,
  `env` dimension). `BuildConfig.BASE_URL`, applicationId suffix, and `app_name` are set per flavor.
  Build `assembleProdDebug` / `assembleStagingDebug`.
- **Web** — single build; base URL from `NEXT_PUBLIC_API_URL`. Point the test deployment at
  `https://api-test.horae.ca` and the prod deployment at `https://api.horae.ca`.

## Seed credentials (test)

`docker/.env.test` seeds an admin (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) and an org named
`Horae.ca Test` (slug `acadeea`). Test data is fully separate from prod.
