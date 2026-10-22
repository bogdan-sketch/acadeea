# Acadeea — status

Last updated: **2026-10-22**. Update this file whenever something below changes.

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

Existing links: 1 Apple + 2 Google users (all also have a password).

| | Apple | Google |
| --- | --- | --- |
| iOS app | ON — capability on `ro.acadeea.app`, API `APPLE_AUDIENCES=ro.acadeea.app` | OFF until an **iOS OAuth client for `ro.acadeea.app`** exists in the Google Cloud project `1031952890842` (same project ⇒ same Google user ids, existing links keep working). Then: `GIDClientID` + reversed-client-id URL scheme in `apps/ios/project.yml`, and add the client id to `GOOGLE_AUDIENCES`. |
| Web | OFF — needs the Services ID `ca.horae.signin` to list domain `app.acadeea.ro` + return URL in the Apple Developer portal (or a new Acadeea Services ID). Then build arg `NEXT_PUBLIC_APPLE_SERVICES_ID` + add it to `APPLE_AUDIENCES`. | OFF — add `https://app.acadeea.ro` as an Authorized JavaScript origin on the web client `1031952890842-16dlcao6…` (already in `GOOGLE_AUDIENCES`). Then build arg `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. |
| Android | — (the Android app never had social login) | — |

## Pending / open

1. **Google Play Console** — Bogdan creates the "Acadeea" app (package `ro.acadeea.app`, from
   Sergiu's Play developer account). Then upload an `.aab` (`./gradlew bundleProdRelease`) signed
   with the Acadeea upload key, and enroll in Play App Signing.
2. **Email sender** — mails go out through Resend as `Acadeea <noreply@horae.ca>` (Resend only
   allows verified domains). To send from `@acadeea.ro`, verify acadeea.ro in Resend (DNS records
   at the client's hosting) and change `SMTP_FROM` in `docker/.env.acadeea`.
3. **Old copy on Horae** — the `acadeea` org still exists on Horae prod (left untouched on
   purpose) and that server still polls the same WooCommerce shop into it. It is an archive; staff
   must use the Acadeea apps/web, not the "Horae" app. Ask Sergiu before touching anything there.
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
