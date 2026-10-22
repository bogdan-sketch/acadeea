# Observability — Sentry + PostHog

Horae uses **Sentry** (errors / crash / performance) and **PostHog** (product usage analytics) across
all four surfaces: `apps/api` (NestJS), `apps/web` (Next.js), `apps/ios` (SwiftUI), `apps/android`
(Compose). Both are **EU cloud, free tier**, and both are **fully opt-in**: with empty keys every SDK is
a complete no-op and the apps build and run exactly as before. Nothing real is committed — placeholders
only; real values go in git-ignored files / deploy env.

## What each tool covers

|          | Sentry                                      | PostHog                                                                                          |
| -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Purpose  | unhandled errors, crashes, 5xx, perf traces | "which part of the app is used", funnels, screen/page views, session replay (web), feature flags |
| Region   | sentry.io **EU**                            | **eu.i.posthog.com** (Frankfurt)                                                                 |
| Sample   | `tracesSampleRate = 0.1` everywhere         | all events                                                                                       |
| Identity | user set on login, cleared on logout        | `identify(userId, {email, role})` on login, `reset()` on logout                                  |

## One-time account setup (human)

1. **Sentry** — create an org on sentry.io with **EU** data region. Create projects (recommended one per
   platform so issues don't mix): `horae-api` (Node), `horae-web` (Next.js), `horae-ios` (Apple),
   `horae-android`. Copy each project's **DSN**. (A single shared DSN also works — fewer projects, mixed
   issues.)
2. **PostHog** — create a project on **eu.posthog.com**. Copy the **Project API Key** (`phc_...`). Host is
   `https://eu.i.posthog.com`.

Free tiers (Sentry ~5k errors/mo, PostHog ~1M events/mo) cover a business this size at €0.

## Where the keys go (all git-ignored / deploy-only — never commit real values)

### apps/api (env vars — `.env`, joi-optional so blank = off)

```
SENTRY_DSN=
SENTRY_ENVIRONMENT=production        # optional, defaults to NODE_ENV
POSTHOG_API_KEY=
POSTHOG_HOST=https://eu.i.posthog.com
```

### apps/web (env vars — `NEXT_PUBLIC_*` are exposed to the browser by design)

```
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=                          # server-side
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
# deploy-only, for source-map upload (CI secret, optional):
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

### apps/ios (`apps/ios/Config/Observability.xcconfig`, git-ignored)

```
SENTRY_DSN =
POSTHOG_KEY =
POSTHOG_HOST = eu.i.posthog.com      # NO scheme — xcconfig treats // as a comment; https:// is prepended in code
```

Then `cd apps/ios && xcodegen generate`. Template: `apps/ios/Config/Observability.example.xcconfig`.

### apps/android (`apps/android/local.properties`, git-ignored)

```
SENTRY_DSN=
POSTHOG_KEY=
POSTHOG_HOST=https://eu.i.posthog.com
```

Avoid `"` in values (inlined into BuildConfig string literals). Template: `local.properties.example`.

## Build status at wiring time

- **api** — `pnpm --filter @horae/api build` ✅ green.
- **web** — `pnpm --filter web build` ✅ green with empty env.
- **ios** — code compiles (verified by control build); a full `xcodebuild` was **not** completed in the
  headless agent env (known `waitForRemoteSourcePackagesToFinishLoading` SPM deadlock). **Build once in
  Xcode.app** so SPM resolves `sentry-cocoa` + `posthog-ios`, then run.
- **android** — **not built** (agent env had no JDK/Android SDK). Run `./gradlew assembleProdDebug` on a
  JDK 17 + Android SDK machine to confirm green.

## Enabling later

Drop the real keys into the four locations above and rebuild/redeploy each surface. No code change needed.
To go to production, mirror the env vars into the Prod/Test deploy env files (see `docs/ENVIRONMENTS.md`).
