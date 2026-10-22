# apps/web — Next.js Admin/Dashboard

The full-featured web client. Next.js 16 (App Router) + React 19 + Tailwind 4. Talks to `apps/api`
over REST only (no WebSocket — it polls). Read with the root `CLAUDE.md` and `docs/ARCHITECTURE.md`
for the API/auth contract.

**Multi-tenant + Horae rebrand.** One deployment serves both a marketing **landing** on the apex
(`horae.ca`) and each organization's app on its `<slug>.horae.ca` subdomain (test: `test.horae.ca` /
`*.test.horae.ca`; legacy `app.acadeea.ro` aliased via `NEXT_PUBLIC_LEGACY_HOSTS`). Host classification
lives in `lib/tenant.ts`; host-based routing in `src/proxy.ts` (see § Multi-tenancy below).

> ⚠️ **`@AGENTS.md`:** this is NOT the Next.js in your training data. Before writing Next.js code,
> read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices. App Router,
> Server Components, and conventions may differ from what you remember.

## Stack

Next.js 16.2 · React 19.2 · TypeScript 5 · Tailwind CSS 4 (PostCSS) · `@base-ui/react` (headless) +
shadcn-style `components/ui` · `next-themes` (dark mode) · `recharts` · `sonner` (toasts) ·
`react-day-picker` · `lucide-react` · `@horae/shared-types`.

## Layout

```
src/
├── proxy.ts                    Host routing (Next 16 proxy — the middleware.ts successor): apex `/`
│                               rewrites to /landing; org subdomains pass through; preview ?org= cookie
├── app/
│   ├── layout.tsx              Root: ThemeProvider → OrgThemeProvider → PostHog → AuthProvider; loads
│   │                           next/font variables (inter/manrope/lora/poppins) for the runtime font
│   ├── landing/                Public marketing page (apex only; components/marketing)
│   ├── login/                  Public login (show-password toggle + "forgot password" link)
│   ├── auth/handoff/           Public — redeems the apex→subdomain single-use handoffCode (?code=)
│   ├── forgot-password/        Public — request a reset link (no account enumeration)
│   ├── reset-password/         Public — set a new password from an emailed token (?token=)
│   ├── accept-invite/          Public invite acceptance (?token=)
│   └── (dashboard)/            Protected group — layout guards auth, renders sidebar
│       ├── layout.tsx          Redirects unauthenticated → /login
│       ├── page.tsx            Dashboard (stats, quick actions, activity)
│       ├── recipes/ orders/ tasks/ stock/ users/ roles/ locations/
│       ├── pricing/ integrations/ activity/ settings/ calendar/ stats/
├── components/
│   ├── ui/                     Primitive components (Button, Card, Dialog, …)
│   │                           ⚠️ Accent colors: NEVER hardcode the default pink (#D4527B) in
│   │                           components — use the semantic tokens (text-primary, bg-accent, …).
│   │                           In globals.css every accent-derived var is a color-mix over
│   │                           var(--primary), so the tenant accent cascades everywhere.
│   ├── marketing/              Apple-style one-pager: hero + hero-canvas (three.js particle dial,
│   │                           chaos→order on scroll, client-only), feature-sections (CSS UI mocks in
│   │                           screenshot-slot — swap in real screenshots via `src`), tenant-band
│   │                           (white-label subdomain cycler), reveal, cta, site-header/footer.
│   │                           `three` has no types — see src/types/three.d.ts
│   ├── org-theme-provider.tsx  Applies org accentColor (→ --primary/--ring) + fontFamily (→ --font-sans)
│   │                           as CSS vars at runtime; also swaps the favicon to the org logo
│   │                           (logoLightUrl → appLogoLightUrl → logoUrl; cached per slug in
│   │                           localStorage, so it persists per device). Default = Horae mark
│   │                           (app/favicon.ico + icon.png/apple-icon.png, public/horae-icon.png)
│   ├── legacy-host-banner.tsx  Migration banner shown on legacy hosts (app.acadeea.ro)
│   ├── app-sidebar.tsx         Nav — single Operațiuni group, gated by usePermissions(). Setări opens
│   │                           from the user row above Deconectare; Echipă lives in Setări →
│   │                           "Utilizatori și roluri"; Analitice was removed entirely (2026-07-10).
│   │                           Calendar/Statistici/Roluri/Prețuri/Integrări/Activitate are contextual
│   │                           links inside their parent pages, not sidebar items
│   ├── action-tiles.tsx        ActionTiles — accent-tinted page-level action grids (detail-page
│   │                           quick actions; tones default/destructive/muted). Used on raw-material /
│   │                           consumable / recipe / order / task / transfer detail + backups, and as
│   │                           FORM-HEADER save/cancel (save tile: `type: 'submit'` + `form: <formId>`
│   │                           keeps native validation; cancel tile: tone muted). NOT for table row
│   │                           actions or dialog footers
│   └── data-table.tsx, status-badge.tsx, page-header.tsx, …
├── contexts/auth-context.tsx   AuthProvider, useAuth(), usePermissions()
├── hooks/use-mobile.ts
└── lib/
    ├── api.ts                  ★ HTTP client — base URL, token refresh, ALL endpoint calls
    ├── tenant.ts               Host classification (apex/org/preview), orgUrl(), getOrgSlug() — edge-safe
    ├── types.ts                All interfaces mirroring backend DTOs (~700 lines)
    ├── constants.ts            Enum labels/colors + role→permission rules
    └── utils.ts
```

`stock/` is a hub: `raw-materials`, `consumables`, `locations`, `movements`, `transfers`
(+ `transfers/new` create form and `transfers/[id]` detail with the full status flow — in tranzit
requires a transporter, finalizare, anulare, approve/reject via `PATCH .../approval`),
`receive` (multi-line goods receipt → `POST /stock/movements/batch` with lot/expiry/price/invoice
per row — the "Recepție" quick actions land here), `recipe-stock`, `low-stock`, `expiring`,
`requirements` (necesar MP: pick recipes + quantities → aggregated raw-material needs with
supplier/deficit via `stock.requirementsPlan`, Excel download via `stock.requirementsPlanExport`).

`settings/logs` — **Jurnal sistem** (admin, `manage all`; linked from Setări → Sistem): filterable
`SystemLog` viewer (category chips, level, search, date range, Live 10s polling, expandable rows
with request/correlation id/metadata JSON; platform admins get a "Toate organizațiile" toggle).
Client: `systemLogs` in `lib/api.ts`.

`settings/reset` — **Resetare date** (admin, `manage all`; linked from Setări → Sistem): toggles per
category from `GET /data-reset/preview` (row counts, dependencies auto-checked + "inclus automat" badge,
disabled while implied), separate red "Date de bază" card for RECIPES / RAW_MATERIALS, destructive
dialog with typed `RESETEAZA`. Client: `dataReset` in `lib/api.ts`; types `ResetCategoryPreview` /
`DataResetResult`.

**Selectează & șterge (bulk delete).** List pages `tasks`, `orders`, `recipes`, `stock/raw-materials`,
`stock/consumables`, `stock/transfers`, `stock/sales` share one pattern: `useBulkSelect()`
(`hooks/use-bulk-select.ts` — `active`, `selected`, `toggle`, `toggleAll`, `enter`, `exit`), a
`<BulkSelectToggle>` pill ("Selectează"/"Gata", rendered only when `can('delete', <Subject>)`),
`<DataTable selection={select}>` (leading checkbox column + header select-all-on-page, row click
toggles instead of navigating) and `<BulkSelectBar>` (`components/bulk-select-bar.tsx` — sticky
bottom bar, destructive confirm dialog with an optional `warning`, toasts "N șterse" + the per-row
`failed` reasons, then `onDone` refetches). Flow is **preview → confirm → cascade**: "Șterge (N)"
first calls `bulkDeletePreview(ids)` (`POST /<resource>/bulk-delete/preview` →
`BulkDeletePreview { found, missing, dependents[{key, label, count}] }`); the dialog lists the
dependents ("Se vor afecta și:") and the button becomes "Șterge tot"; confirm calls
`bulkDelete(ids)` → `POST /<resource>/bulk-delete` with `{ ids, cascade: true }` →
`BulkDeleteResult { deleted, failed[{id, reason}] }`. Deletion always goes through — dependents are
removed/unlinked with the selection once the user confirmed.
**Bulk actions** (same bar, "Acțiuni" dropdown left of "Șterge", gated on `can('update', <Subject>)` —
sales: `create StockMovement`): each page passes `actions: BulkActionDef[]`
(`components/bulk-actions.tsx` — `{ key, label, paramName?, param? }`; param kinds `enum`/`bool`
render as nested submenus, `user`/`date`/`category`/`number`/`location`/`supplier` open a picker
dialog) and `onAction` → `bulkAction(ids, key, params)` → `POST /<resource>/bulk-action`
`{ ids, action, params }` → `BulkActionResult { done, failed[{id, reason}] }`. Every action confirms
("Aplici „X” la N elemente?") then toasts "N actualizate" + failure reasons and refetches. Per page:
tasks (status / assign / plannedDate / dueDate / priority / location), orders (status / assign /
dueDate / archive), transfers (status), raw materials (category / status / supplier / minimumStock),
consumables (category / status / minimumStock), recipes (archive / draft / category), sales
(discard / revert).
`components/ui/checkbox.tsx` is the base-ui Checkbox added for this.

`stock/sales` (`lib/features.ts` `SALES_DEDUCTIONS_ENABLED` = true since 1.33.0, prod included; the dialog's Upload Excel source also offers "Descarcă șablonul CSV" via `salesDeductions.template(locationId)`; previously test env only — true when
`NEXT_PUBLIC_API_URL` is the test API or localhost; sidebar item + "Scade vânzări" button on
`recipe-stock` are hidden otherwise) is "Vânzări → stoc": the log + a "Scădere nouă" dialog (location,
then Excel/manual/site source) → `stock/sales/[id]`, which is the **confirmer** for a DRAFT
(per-line Scade/Produs nou/Ignoră, product combobox with name-match suggestions, ± quantity stepper
— negative adds back, live stock before→after, shortfall panel: clamp to 0 or override; filter
chips; one bulk "Confirmă tot" dialog that can acknowledge all shortfalls at once) and a read-only
log entry with "Anulează scăderea" once confirmed. Client: `salesDeductions` in `lib/api.ts`.

**Orders area (1.37.0).** `orders/orders-area.tsx` holds the state shared by the list and
`orders/calendar` (module-level store, survives client navigation, resets on reload): the
**Pregătiri | Intrări** switch (1.39.0: `view=livrari|intrari` on `GET /orders` + `/orders/calendar`;
"Pregătiri" = the old Livrări view, first and DEFAULT), the **status filter** (1.39.0: "Status" menu
button in the list + calendar head, `OrderStatusFilter` — multi-select of the six statuses + Toate,
default only Nouă, accent dot when ≠ default; list sends `statuses=A,B`, calendar `status=A,B`;
ignored while "Arhivate" is on; replaces the old status pills) and the delivery-method chip filter (1.38.0: exclusive single select — **Toate** (default) ·
each PICKUP method · **Livrare** (`deliveryKind=DELIVERY`, count = sum) · each DELIVERY method only
when 2+; method chips send `deliveryMethod=<name>`, show `label`; re-tapping the selected chip = Toate).
The methods list is re-fetched on every list/calendar reload (`area.refreshMethods`); a selection that
no longer exists falls back to Toate. "Metode" editor ("Metode de livrare", `manage Organization`
only) → `PUT /orders/delivery-methods/alias` with `{name, shortName}` or `{name, kind}` (Ridicare |
Livrare segmented, "auto" hint when `!kindSet`, "Automat" resets with `kind: null`).
The list groups rows by Bucharest day (future days → Mâine → Azi → Ieri → Mai vechi; livrări key =
due day, undated = today; intrări = createdAt), livrări fetches a 200-row page so "Azi" stays on page 1,
and scrolls "Azi" into view on load / view switch. The calendar has Zi (default, today) / Săptămână /
Lună ranges. `deliveryMethodLabel()` maps "A + B" parts to short names on list, calendar and detail.
Delivery-method filter, location `externalId` + **Unitate principală** (`isMainUnit`, "Principală"
badge) are gated on `Organization.wooDeliveryEnabled` (`hooks/use-woo-delivery.ts`; toggle in
`settings/company` → "Magazin online").

**Sticky pill filters + collapsing head (1.39.0).** One mechanism for every list page:
`STICKY_HEAD` (`lib/sticky-head.ts`, used by `PageHead` / `PageHeader` / custom heads) adds
`.page-head-collapse` — below `md` the head sticks under the 48px top bar and hides on scroll down /
returns on scroll up (`hooks/use-head-collapse.ts`, mounted in the dashboard layout, toggles
`html[data-head-hidden]` + measures `--page-head-h`; CSS in `globals.css`, no animation under Reduce
Motion). From `md` the head is static. Single-row pill filters go in `<PinnedFilters>`
(`components/pinned-filters.tsx`) — pinned at EVERY width (under the head / top bar on phones, top 0
on desktop), publishes `--pinned-h` (DataTable xl sticky headers + scroll-margins use it);
`<PinnedFilters sub>` stacks a second strip under it (stock categories, calendar day chips, board
column chips). Rows inside are `<PillStrip>` / `.pill-strip`: never wrap, scroll sideways only,
`touch-action: pan-x` (vertical drags do nothing). `FilterChips` is always a pill strip. Page
searches live in the head (they collapse with it). Used on orders (+ calendar), stock, raw
materials, transfers, movements, tasks (+ status pages), recipes, calendar.

Recipes list has an unobtrusive "Arhivate" toggle (right of the filters) that flips the list to
`?archived=true`; recipe detail has an Arhivează/Reactivează button (`recipes.setArchived`) plus an
"Arhivată" badge. Default lists/pickers only ever see active recipes (server-side default).

Recipes have `new` + `[id]/edit`, both rendering the shared `components/recipe-form.tsx`
(ingredients accept a raw material XOR a semipreparat sub-recipe; every ingredient must send
`name`). Ingredient rows have NO raw/semi switcher — one button opens a single searchable
`CommandDialog` (`IngredientPickerDialog`) grouped Materii prime / Semipreparate / Byproduct
(byproducts = SEMIPREPARAT recipes with `isByproduct`, split client-side from one
`type=SEMIPREPARAT` fetch). A "Byproduct" card at the end of the form (Switch) opens a
mini-dialog (nume + cantitate + unitate); the collected byproduct is created via
`recipes.create({isByproduct: true, sourceRecipeId})` right AFTER the recipe saves (create
mode needs the new id). Existing byproducts (`recipe.byproducts`) render read-only —
unchecking never deletes them. Order detail supports item add/remove, the full allowed-transitions map, delivery-note
signature capture (`components/signature-dialog.tsx` → multipart `PATCH .../delivery-note/sign`)
and a print view. Transfer API responses are **flattened** in `api.ts` (`mapTransfer`) from the
nested backend DTO.

## How it talks to the API

- **All HTTP goes through `lib/api.ts`.** Don't `fetch` the backend from components — add/extend a
  method on the relevant module object (`auth`, `tasks`, `recipes`, `orders`, `stock`, `locations`,
  `transfers`, `users`, `analytics`, `pricing`, `integrations`, `organization`, `dashboard`, `activity`).
- Base URL: `process.env.NEXT_PUBLIC_API_URL` (default `https://api.horae.ca`).
- The client injects the Bearer token, **single-flight** auto-refreshes on `401` via `/auth/refresh`
  (concurrent 401s share one refresh — the server rotates refresh tokens), and throws a typed
  `ApiError {status, code, message}`. Expects `201` on POST, `204` on DELETE. On refresh failure it
  redirects to `/login` **except on public pages** (`/login`, `/forgot-password`, `/reset-password`,
  `/accept-invite`, `/auth/handoff`, `/landing`).
- **Field-name drift bites here** — the web shape has differed from the API DTO. Keep them aligned:
  task transition sends `{status, reason, actualYield}` (not `toStatus`); stock movements send
  `{movementType, referenceNote}` (not `type`/`referenceNotes`); the mapping lives in `lib/api.ts`.
- **No WebSocket** — pages poll with `useEffect` + a `lib/api` call. There is no SWR/React Query and
  no Redux/Zustand: state is local `useState` + the auth context.

## Auth & permissions

- `auth-context.tsx` holds the session: login stores `accessToken`/`refreshToken` in `localStorage`,
  then calls `auth.me()`. `(dashboard)/layout.tsx` redirects if not authenticated. The login response
  now also carries an `organization` branding block; logging in on the apex mints a single-use
  `handoffCode` and bounces the browser to the org subdomain, where `/auth/handoff` calls
  `auth.redeemHandoff(code)` (`POST /auth/handoff/redeem`) to establish the session on that host.
- `usePermissions().can(action, subject)` gates UI. ⚠️ The role→permission map in `auth-context.tsx`
  is **hardcoded and can drift from the backend's dynamic DB roles** (see root `CLAUDE.md`). It is UX
  only — the backend enforces. When unsure, defer to what the API allows.

## Multi-tenancy & branding

- **Host routing** — `src/proxy.ts` (Next 16 `proxy` convention; **`middleware.ts` is deprecated**,
  don't add one) classifies the host via `lib/tenant.ts`:
  - **apex** (`horae.ca`, `localhost`) → `/` rewrites to `/landing`; a direct `/landing` 308s to `/`.
  - **org** (`<slug>.horae.ca`) → passes through; the existing `(dashboard)` route tree serves it.
  - **preview** (`*.vercel.app`) → `?org=<slug>` is persisted in a `preview-org` cookie.
    Reserved subdomains (`www`, `api`, `app`, …) resolve to apex. `orgUrl(slug)` / `getOrgSlug()` /
    `isApexHost()` are the client-side helpers.
- **Runtime theming** — `OrgThemeProvider` (mounted in the root layout) applies the org branding via
  an **injected `<style id="org-theme">`** with two blocks, `:root:not(.dark) { … }` and
  `:root.dark { … }` — (0,2,0) specificity beats the `globals.css` `:root`/`.dark` blocks in exactly
  one scheme each (no more inline vars on `<html>`). Per scheme it emits: the trio
  (`accentColor` → `--primary` + WCAG-contrast `--primary-foreground`; `secondaryColor`/`tertiaryColor`
  → `--brand-secondary`/`--brand-tertiary`) overlaid by **`brandingTokens.web`** per-scheme tokens
  (`{ light, dark, radiusCard, radiusSheet }`; legacy flat colors = both schemes — normalization in
  `lib/branding.ts`, shared with the settings page). Token → var map (`TOKEN_VARS` in the provider):
  accent→`--primary`, accentPressed→`--primary-pressed`, textPrimary→`--foreground`/`--card-foreground`/
  `--popover-foreground`/`--sidebar-foreground`, textSecondary→`--muted-foreground`,
  background→`--background`, card→`--card`/`--popover`/`--sidebar`, separator→`--border`/`--sidebar-border`,
  secondary/tertiary→`--brand-*`, radiusCard→`--radius`, radiusSheet→`--radius-sheet` (dialog corners;
  `--primary-pressed` = button hover/active). Every other accent-derived token (`--accent`,
  `--sidebar-accent`, `--ring`, `--chart-1..3`, `--primary-pressed` default) derives from
  `var(--primary)`/`--brand-*` in `globals.css`, so unset tokens cascade from the trio. **Unset
  secondary/tertiary = derived from the accent by OKLCH hue rotation ±45°**, so the trio is always
  harmonious. Semantic status colors (`--st-*`) are NEVER re-mapped to brand. `fontFamily` →
  `--font-sans` (next/font variables `--font-inter|manrope|lora|poppins`; `system` falls through).
  All admin-picked in **Settings → Branding și teme** (`settings/branding`): trio + font + logos, plus
  three platform sections (Web/iOS/Android) each with a Light/Dark scheme switcher, all 9 color tokens
  (with Romanian "unde se folosește" descriptions), per-token/per-section reset, scheme-styled mini
  previews, radii on the Web section; PATCHes `brandingTokens` in the nested `{light,dark}` shape,
  merge-preserving untouched platforms/schemes (keys sent only when changed → still works against an
  older API).
- **Splash preloader** — `components/app-preloader.tsx`, mounted by `(dashboard)/layout.tsx` and
  mirroring iOS `SplashView.swift`: accent-gradient splash with the org logo DIRECTLY on the gradient
  (dark → light; NO text fallback — without a logo the center stays empty; soft radial white halo
  behind it, `plus-lighter`; opacity-only fade-in then continuous 1↔1.07 pulse, 2.2s round trip) and a
  procedural dot-vortex on a DPR-aware `<canvas>` (32 spiral arms, deterministic sin-hash, inner fade
  melting into the glow — exact iOS parameters). Forms ONCE in 2.5s (dots fly in from outside, cubic
  ease-out, per-dot delay) then stays static; ~0.4s hold + 0.5s fade-out. The formation window anchors
  to when the logo becomes visible (image load, ≤1s grace; no-logo orgs start immediately). Once per
  page load (module state; client-side route changes never re-show it); `prefers-reduced-motion`
  renders the final state immediately, no pulse.
  - **Shared internals** live in `components/splash-vortex.tsx`: the 32-arm sin-hash vortex geometry +
    `drawVortex`, the DPR-aware `<SplashCanvas>` render loop, the gradient/halo/logo-animation CSS
    helpers, AND a module-scoped timeline (`beginTimeline`/`getTimelineStart`/`markFirstMount`). Both
    the preloader and the login splash begin the SAME clock, so a logged-out cold load (dashboard
    loading splash → redirect → `/login`) continues one seamless formation instead of restarting it.
  - **Login splash** — mirroring iOS `SplashView(showLogin:)`: the `/login` page (`app/login/page.tsx`)
    plays the same intro, then at ~2.6s the logo LIFTS (`riseup`, translateY(-235px), 1s ease-in-out)
    and the login form fades in (`formin`) on the SAME dark gradient — the form becomes part of the
    splash (dark `#1C1C1E` pill fields, white text, accent button + "Ai uitat parola?" link; no card).
    All login logic (org branding lookup, apex→subdomain handoff, forgot-password, errors) is unchanged.
    Always plays on a fresh page load; client-side nav within the session doesn't replay it (shared
    module timeline). `prefers-reduced-motion` renders the final state (logo up, form visible, no pulse).
- **Simplified logo model** — exactly TWO logos per org (light + dark), used everywhere (login,
  preloader, sidebar, favicon). The branding page has just the two slots (upload variant
  `login-light`/`login-dark`; the API writes BOTH `logo*` and `appLogo*` columns and clearing also
  clears legacy `logoUrl`). Readers prefer `logoLight/DarkUrl` and keep `appLogo*` only as a
  stale-cache fallback.
- **Legacy hosts** — `legacy-host-banner.tsx` shows a migration notice on `app.acadeea.ro`.
- **Local dev subdomains:** use `<slug>.localhost:3000` (resolves natively) — or `<slug>.lvh.me:3000`
  in Safari.
- **Env vars:** `NEXT_PUBLIC_API_URL` (default `https://api.horae.ca`), `NEXT_PUBLIC_ROOT_DOMAIN`
  (e.g. `horae.ca` / `test.horae.ca`; empty locally), `NEXT_PUBLIC_LEGACY_HOSTS`
  (`host:slug` comma list), `NEXT_PUBLIC_DEFAULT_ORG_SLUG` (preview fallback, `acadeea`).

## Observability (Sentry + PostHog)

All of it is **opt-in and no-op when the env vars are empty** — the app builds/runs offline with none set.

- **Sentry** (errors + performance, `tracesSampleRate` 0.1). Init lives in `instrumentation.ts`
  (server/edge `register()` + `onRequestError` → `captureRequestError`) and `instrumentation-client.ts`
  (browser init + `onRouterTransitionStart`). DSN: `NEXT_PUBLIC_SENTRY_DSN` (client) / `SENTRY_DSN` (server).
  `next.config.ts` is wrapped with `withSentryConfig`; **source-map upload is gated on `SENTRY_AUTH_TOKEN`**
  (+ `SENTRY_ORG`/`SENTRY_PROJECT`) so the build never needs network/auth. Shared opts in `lib/sentry.shared.ts`.
- **PostHog** (product analytics + pageviews). `lib/posthog.ts` wraps `posthog-js` (no-op when
  `NEXT_PUBLIC_POSTHOG_KEY` is empty; host defaults to `https://eu.i.posthog.com`). `components/posthog-provider.tsx`
  (`"use client"`) is mounted in the root layout; a Suspense-wrapped `PostHogPageView` captures `$pageview`
  on App Router route changes via `usePathname`/`useSearchParams`. `auth-context.tsx` calls
  `posthog.identify(id, {email, role})` after login/refresh and `posthog.reset()` on logout (null-safe).
- Env vars (see `apps/web/.env.example`): `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`,
  `NEXT_PUBLIC_POSTHOG_HOST` (+ optional `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` for deploys).

## Conventions

- Server Components by default; add `"use client"` only when you need interactivity/hooks.
- Task detail (`tasks/[id]`) shows a **"Materiale necesare"** card from
  `tasks.materialRequirements(id)` (`GET /tasks/:id/material-requirements`): per ingredient the
  **scaled** need (matches stock deduction, not the base recipe), current stock, and stock after
  production. Loaded best-effort — a failure leaves the card hidden, never blocks the task view.
  The **task-create page** (`tasks/new`) prefills the quantity from the recipe's `yieldQuantity` on
  select (editable) and runs a debounced live stock check via `tasks.previewRequirements`
  (`GET /tasks/preview-requirements`), warning when the requested quantity exceeds stock. The
  **recipe-create page** defaults the yield unit to `BUCATI` (picker still allows g/ml/l/…). The
  task-create page also has a **production location** select (`locations.myLocations()`, prefilled with
  the admin-configured `Organization.defaultLocationId` if set, else a "Laborator" name match, else the
  — rule shared by `lib/default-location.ts` `pickDefaultLocation(locs, org)` since 1.29.0, which also
  seeds Recepție, Stoc nou (`stock-adjustment-dialog`, over the user's first location), Vânzări (over
  magazine-first), Consum test and the transfer source (`transfers/new`, when no `?fromLocationId`);
  the switch in `stock/locations` is labelled "Implicită" and means every operation —
- **Stock tiles + category groups (1.31.2; NEVER a dropdown — owner's rule).** `stock/page.tsx`: the
  segment control is gone; three big tiles (`KIND_TILES`: Materii prime / Semipreparate / Produse
  finite, whole card tinted, counts from one-row list calls) pick the segment, and the list is one
  `DataTable` per category with a `CategoryPill` header (`groupByCategory`, Misc last; raw materials
  fetched with limit 500 so grouping is client-side). Under the tiles (1.32.0) a `FilterChips` carousel
  of the active kind's categories (`recipesApi.categoryCarousel()` filtered by kind; a parent chip
  also matches its sub-categories via `matchesChip`); no "Toate" chip — the active chip clears on tap. `recipes/page.tsx` keeps its original
  `FilterChips` category strip — the 1.30/1.31 dial/bento on recipes was reverted on the owner's
  request. The server still expands a parent category to its children
  (`recipes/category-filter.ts`) and `GET /recipes/categories/counts` exists. Design:
  https://claude.ai/artifact/5XJBNbpXBeK4RVTY9TrBYv.
- **Task name + visibility (1.29.0).** `Task.title` (custom name) / `displayName` (title ?? recipe)
  / `visibility` (`TaskVisibility` from shared-types) / `visibleToIds`. `tasks/new` has a "Nume task"
  input (single mode), visibility chips (`taskVisibilityLabels` in lib/constants) and, for SELECTED,
  a checkbox list of active users (the assignee is implied). List, board, detail (h1 + "rețetă: …"
  in the subtitle + "vizibil: …") and the dashboard render `displayName ?? recipeName`. Server-side
  scoping: non-managers only get ASSIGNED-to-them / EVERYONE / SELECTED-including-them tasks; admins
  see everything.
  first location); it is sent on create and passed to the live stock check. Task detail shows the
  location. Stock is per-location on the backend. The **stock-receive page** (`stock/receive`)
  prefills its location the same way. Admins set `defaultLocationId` from `stock/locations` (a
  "Producție/recepție" toggle next to the existing "Livrare implicită" one — exactly one location org-wide).
- **Tutorial mode** (`contexts/tutorial-context.tsx` + `components/tutorial-overlay.tsx`): a
  PER-USER preference toggled at `profil` (Preferințe → "Tutorial", next to dark mode) — NOT an
  admin/org setting, no backend field, state is `localStorage` keyed by user id (on/off +
  dismissed step ids), same posture as the "Ziua mea" board filter. Contextual, not a forced
  tour: `<TutorialAnchor id="...">` tags a real element (`id` must match a `TutorialStep.id` from
  `GET /tutorial/content`); `TutorialOverlay` auto-shows ONE small callout (no scrim) next to the
  first undismissed anchor found on the current page, with a single "Am înțeles" dismiss — never
  blocks the page. A manual "Pornește turul" from `/help` instead sequences one flow's steps in
  order (Prev/Next) — user-triggered replay, not the default experience. Adding a live anchor to
  a new element is a single `<TutorialAnchor id="...">` wrap; content lives once in the api
  (`apps/api/src/modules/tutorial`), only some flows have anchors wired so far.
- New backend field/enum → mirror it in `lib/types.ts` (and `lib/constants.ts` for labels/colors).
- Romanian user-facing strings.
- Use `components/ui` primitives and `data-table` rather than bespoke tables.

## Commands

```bash
pnpm --filter web dev      # next dev (port 3000)
pnpm --filter web build
pnpm --filter web start
pnpm --filter web lint
```

</content>
