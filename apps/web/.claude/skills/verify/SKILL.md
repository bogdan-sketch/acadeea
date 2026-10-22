---
name: verify
description: Drive the Horae web app end-to-end locally (login, dashboard, settings) with Playwright to verify web changes at the real surface.
---

# Verifying apps/web changes

## Launch

```bash
# .env.local must point at the TEST api (never prod for verification):
#   apps/web/.env.local → NEXT_PUBLIC_API_URL=https://api-test.horae.ca
pnpm --filter web dev          # port 3000
```

- Org app surface: `http://acadeea.localhost:3000` (subdomain resolves natively; apex `localhost:3000` = marketing landing).
- Test-API CORS already allows `http://localhost:3000` + `http://*.localhost:3000` (docker/.env.test).

## Drive (Playwright)

Playwright is NOT a repo dep — install it in the session scratchpad (`npm i playwright && npx playwright install chromium`), never in the repo.

- Login form: `input[type="email"]`, `input[type="password"]`, `button[type="submit"]`; success = URL leaves `/login`.
- Dedicated verification account on the TEST env (Administrator, org acadeea): `claude-verify@horae.ca` / `VerifyHorae2026!`. The old seed creds (admin@acadeea.ro) no longer work.
- Branding is applied client-side ~1–2s after load (by-slug fetch) — wait before asserting colors.
- Dark mode: `localStorage.setItem('theme','dark')` + reload (next-themes).

## What to check for theming changes

- Branding lands in an injected `<style id="org-theme">` (NOT inline on `<html>`) with `:root:not(.dark)` + `:root.dark` blocks — trio + `brandingTokens.web` per-scheme tokens. Assert computed `--primary`, `--foreground`, `--background`, `--card`, `--border`, `--brand-secondary/tertiary`, `--radius`, `--radius-sheet`, `--chart-1..3`, `--sidebar-accent` resolve in BOTH themes.
- Screenshot the dashboard: active sidebar item background is the highest-visibility accent surface.
- The splash preloader covers the dashboard for ~3.4s after login/reload — wait it out (or check it: canvas dot-vortex + "Toată producția ta într-un loc organizat").

## Gotchas

- Settings PATCH `/organization`: fields unknown to an older API are rejected (`forbidNonWhitelisted`) — the page only sends new branding keys when changed; watch the PATCH body when testing against the live test API before an API deploy.
