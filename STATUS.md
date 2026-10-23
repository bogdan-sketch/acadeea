# Acadeea — status

Last updated: **2026-10-23**. Update this file whenever something below changes.

## Live

- **Server** `152.53.246.168` runs API + web + Postgres + Redis + MinIO (see `CLAUDE.md`).
  HTTPS on https://app.acadeea.ro and https://api.acadeea.ro since 2026-10-22 ~20:30 (RO time).
- **Data**: copied from Horae prod on 2026-10-22 right before the DNS switch (223 orders, 15
  users). From that moment Acadeea's real data lives ONLY here. The `demo` org is deactivated.
- **WooCommerce** orders are polled every 10 minutes by this server (confirmed working 2026-10-22).
- **iOS** "Acadeea" 1.0.0 is on TestFlight, internal group "Real Users" (9 testers, gets every new
  build automatically). Push notifications enabled server-side (APNs production).
- **Android** "Acadeea" 1.0.0 (versionCode 1): signed release APK built and side-loadable; not on
  Google Play yet.

## Social login (Apple / Google)

Uses the SAME OAuth clients as Horae (Google Cloud project `1031952890842`, Apple team
`2C3LQ6B4B4`) ⇒ same Google/Apple user ids, so accounts already linked on Horae keep working.
Existing links: 1 Apple + 2 Google users (all also have a password).

| | Apple | Google |
| --- | --- | --- |
| iOS app | ON — capability on `ro.acadeea.app`; API `APPLE_AUDIENCES` has `ro.acadeea.app` | ON (since build 202610231208) — Horae's iOS client `…-vijstfl9…` (`GIDClientID` in `apps/ios/project.yml`). Not yet tried on a device; if Google refuses the bundle id, create an iOS client for `ro.acadeea.app` in the same project and swap the id (+ `GOOGLE_AUDIENCES`). |
| Web | Button shown, **needs Apple portal config**: Services ID `ca.horae.signin` → Sign in with Apple → add domain `app.acadeea.ro` + return URL `https://app.acadeea.ro` | Button shown, **needs Google config**: web client `…-16dlcao6…` → Authorized JavaScript origins → add `https://app.acadeea.ro` (until then the console says "origin is not allowed") |
| Android | — (the Android app never had social login) | — |

## Pending / open

1. **Google Play Console** — Bogdan creates the "Acadeea" app (package `ro.acadeea.app`, from
   Sergiu's Play developer account). Then upload an `.aab` (`./gradlew bundleProdRelease`) signed
   with the Acadeea upload key, and enroll in Play App Signing.
2. **Email sender** — mails go out through Resend as `Acadeea <noreply@horae.ca>` (Resend only
   allows verified domains). To send from `@acadeea.ro`, verify acadeea.ro in Resend (DNS records
   at the client's hosting) and change `SMTP_FROM` in `docker/.env.acadeea`.
3. **Old copy on Horae** — the `acadeea` org still exists on Horae prod (left untouched on
   purpose) and that server still polls the same WooCommerce shop into it. It is an archive, BUT
   staff kept opening the "Horae" app after the cutover (6 people logged in there on 22–23.10) and
   3 stock receptions were entered ONLY there on 23.10 ~10:45 by Andreea Filpisan (Rom 1,4 kg,
   Ouă 30 kg, Gălbenuș 18 kg) — they must be re-entered in Acadeea. Decide with Sergiu whether to
   deactivate the org on Horae so nobody can work in the wrong system.
4. **Android R8/minify is OFF** for release (`isMinifyEnabled = false`) — it was never exercised
   (missing keep rules for Tink/Moshi/Retrofit). Turning it on needs proguard rules + a full test.
5. **App icon** is provisional (white Acadeea wordmark on #D4527B). Replace
   `apps/ios/Horae/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png` (1024×1024) and the
   Android `drawable-*/ic_launcher_foreground.png` + `mipmap-*/ic_launcher*.png` when a final icon
   exists.
6. **Backups** — the API writes a daily `pg_dump` to the `acadeea-db-backups` volume on the same
   server. There is no off-server copy yet; add one (e.g. nightly rsync to another box).
7. Changelog / "Ce e nou" screens are hidden (they were Horae test-only features).

## Who holds what

- Server root SSH: Sergiu's key (add Bogdan's public key to `/root/.ssh/authorized_keys` to give
  access).
- `docker/.env.acadeea` (DB/MinIO passwords, SMTP, APNs config): only on Sergiu's machine and on
  the server (`/opt/acadeea/docker/.env.acadeea`) — copy it from the server if you need to deploy.
- App Store Connect / TestFlight: Sergiu's Apple developer account (team `2C3LQ6B4B4`); uploads use
  an ASC API key on Sergiu's machine.
- Android upload keystore: `~/Projects/acadeea-signing/` on Sergiu's machine (NOT in git).
  **Losing it means a new Play listing can't be updated** — back it up somewhere safe.

## Version history

| Version | Date | Notes |
| --- | --- | --- |
| 1.0.0 | 2026-10-22 | First Acadeea on-prem release: API + web on own server, iOS (TestFlight) + Android (APK). Code = Horae 1.39.1 + standalone mode. |
