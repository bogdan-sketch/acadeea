# Horae web — end-to-end suite

Playwright against the **TEST** environment only (`https://acadeea.test.horae.ca`,
API `https://api-test.horae.ca`). The config refuses any other `*.horae.ca` host.

```bash
pnpm --filter web test:e2e                      # all specs, desktop 1440×900 + iphone 390×844
pnpm --filter web test:e2e -- stock --project=desktop
E2E_WORKERS=1 pnpm --filter web test:e2e        # gentler on the API (600 req/min per IP)
E2E_CHROMIUM=/path/to/chrome pnpm --filter web test:e2e   # use an existing Chromium
```

- `auth.setup.ts` logs in once (`claude-verify@horae.ca`) and stores the session in
  `e2e/.auth/` (git-ignored); specs reuse it. Override with `E2E_EMAIL` / `E2E_PASSWORD`.
- Every row the suite creates is named `QA-E2E-web-…` and removed in `afterAll`;
  `global.teardown.ts` sweeps any leftovers after the run. Real suppliers, locations,
  Woo orders and other agents' rows are never touched. Nothing is e-mailed (the invite
  test only submits an address the API rejects).
- Known bugs are `test.fixme(...)` with a `BUG (P1/P2)` comment next to them.
- `fixtures/vanzari-2026-10-16.csv` is a real eBriza export (UTF-16) used for the
  sales-deduction flow; it is uploaded as a draft and discarded.
