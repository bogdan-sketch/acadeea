# Auth flows

Sources: `api:auth/auth.controller.ts`, `api:auth/auth.service.ts`, `api:auth/social-auth.service.ts`, `api:password/*`, `api:invitations/*`, `apps/web/src/contexts/auth-context.tsx`, `apps/web/src/lib/api.ts`, `apps/ios/Horae/Core/Auth/AuthManager.swift`.

## Token model

| Item          | Value                                                                                               | Where                                                      |
| ------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Access token  | JWT RS256, payload `{sub, email, role (slug), organizationId, orgSlug}`, 12 h (`JWT_ACCESS_EXPIRY`) | `auth.service.ts:761-774`, `apps/api/src/app.module.ts:88` |
| Refresh token | opaque UUID, stored as sha256, 30 d (`JWT_REFRESH_EXPIRY`), **rotated** on every refresh            | `auth.service.ts:776-790`, `:584-587`                      |
| Handoff code  | 32 random bytes base64url, sha256-stored, 60 s, single use                                          | `auth.service.ts:34,476-494`                               |
| Lockout       | 5 consecutive wrong passwords → `lockedAt` set + all refresh tokens revoked                         | `auth.service.ts:31,118-140`                               |
| Multi-device  | each login creates its own refresh token; other devices are not logged out                          | `auth.service.ts:153-155`                                  |
| Storage       | web `localStorage` (`accessToken`, `refreshToken`); iOS Keychain                                    | `auth-context.tsx:87-88`, `KeychainService.swift`          |

## Throttles (per IP)

| Route                                                                                                                                                | Limit                                | Where                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------- |
| Global default (every route)                                                                                                                         | 600 / 60 s                           | `apps/api/src/app.module.ts:71-76`, guard `:245-249` |
| `POST /auth/login`                                                                                                                                   | 10 / 60 s                            | `auth.controller.ts:46`                              |
| `POST /auth/refresh`                                                                                                                                 | 60 / 60 s (whole shop shares one IP) | `auth.controller.ts:63`                              |
| `POST /auth/handoff/redeem`                                                                                                                          | 10 / 60 s                            | `auth.controller.ts:77`                              |
| `POST /auth/forgot-password`                                                                                                                         | 10 / 60 s                            | `password.controller.ts:14`                          |
| `POST /auth/apple`, `/auth/google`, `/auth/reset-password`, `/auth/accept-invite`, `GET /auth/invite-status/:token`, `GET /auth/reset-status/:token` | global only                          | —                                                    |

Over the limit → `429 TOO_MANY_REQUESTS`.

---

## AUTH-01 Log in with email and password

- **Actor:** any user with a password. **Preconditions:** active user, active org, not locked.
- **Steps:**
  1. Web `/login` (org subdomain) or iOS `LoginView` → enter email + password.
  2. `POST /auth/login {email, password}` — email is trimmed + lowercased, password min 8 chars (`auth/dto/login.dto.ts`).
  3. Response `{accessToken, refreshToken, handoffCode, organization (branding), user {id, email, firstName, lastName, role{slug,name}, permissions[], linkedProviders[], avatarUrl}}` (`auth.service.ts:378-393`).
  4. Web stores tokens, calls `GET /auth/me`, goes to `/` (`auth-context.tsx:87-90`, `login/page.tsx:171-199`). iOS stores tokens in Keychain and applies branding.
- **Rules:**
  - Unknown email → 401 "Invalid email or password" (`auth.service.ts:86-88`).
  - Inactive user → 403 "Account is deactivated" (`:90-92`); inactive org → 403 `ORGANIZATION_INACTIVE` (`:94-99`); locked → 403 `ACCOUNT_LOCKED` (`:103-108`). These checks run **before** the password check.
  - Provider-only account (no password) → 401 (`:111-113`).
  - Wrong password → counter +1, 401; at 5 → lock + revoke sessions + 403 `ACCOUNT_LOCKED` (`:117-142`). Success resets the counter (`:146-151`).
- **Side effects:** refresh token row, handoff code row, old handoff codes (>1 h) purged (`:489-491`), PostHog `user_logged_in`, SystemLog (request middleware logs mutations and failures).
- **Failures:** 400 validation (bad email, password < 8 chars, extra field); 401; 403 (three codes above); 429.
- **Web:** `apps/web/src/app/login/page.tsx`. **iOS:** `ios:Auth/Views/LoginView.swift`, `Core/Auth/AuthManager.swift:64-109`.

## AUTH-02 Log in on the apex domain (horae.ca) → handoff to org subdomain

- **Actor:** user who opened `horae.ca/login`. **Preconditions:** as AUTH-01.
- **Steps:** apex login calls the same `POST /auth/login` but does **not** persist tokens (`auth-context.tsx:115-119`) → browser goes to `https://<slug>.<root>/auth/handoff?code=<handoffCode>` (`login/page.tsx:156-168`) → `AUTH-03`.
- **Failures:** response without `handoffCode` or `organization.slug` → inline error "Nu am putut prelua organizația contului" (`login/page.tsx:166`).
- **Web:** `/login` on apex. **iOS:** not applicable (no subdomains).

## AUTH-03 Redeem a handoff code

- **Actor:** browser arriving at `/auth/handoff?code=…[&next=/path]`.
- **Steps:** `POST /auth/handoff/redeem {code}` (16–128 chars, `auth/dto/redeem-handoff.dto.ts`) → store tokens → `GET /auth/me` → `router.replace(next || '/')` (only `next` starting with `/` is honoured) (`apps/web/src/app/auth/handoff/page.tsx:31-52`).
- **Rules:** code must exist, be unused and not expired; claim is atomic (`updateMany … usedAt: null`) so a double redeem gets 401 (`auth.service.ts:413-424`); user must be active, not locked, org active (`:436-438`).
- **Side effects:** code marked used; new refresh token.
- **Failures:** 401 "Invalid or expired handoff code" for every failure reason; web shows an error and links to the local `/login`.
- **Web:** `apps/web/src/app/auth/handoff/page.tsx`. **iOS:** not applicable.

## AUTH-04 Log in on the wrong org's subdomain

- **Steps:** `POST /auth/login` on `a.horae.ca` returns `organization.slug = b` → web removes both tokens and redirects to `b.horae.ca/auth/handoff?code=…` (`login/page.tsx:173-191`). Same for Apple/Google (`:239-251`).
- **Failures:** no handoff code → "Contul tău aparține altei organizații. Autentifică-te pe horae.ca."
- **Web:** `/login`. **iOS:** not applicable.

## AUTH-05 Restore the session on launch

- **Steps:** web: if `accessToken` exists → `GET /auth/me` (`auth-context.tsx:40-80`). iOS: if Keychain has tokens → `GET /auth/me` (`AuthManager.swift:34-60`).
- **Rules:** `GET /auth/me` returns the user or **`null` with 200** when the user/org is inactive (`auth.service.ts:734-736`). The JWT must carry `organizationId` (`auth/strategies/jwt.strategy.ts:36-38`).
- **Failures:** 401 → client refreshes once (AUTH-06); refresh failure → tokens cleared → login screen. iOS clears tokens on any error (`AuthManager.swift:55-59`).
- **Web:** dashboard layout + `auth-context.tsx`. **iOS:** `HoraeApp` → `AuthManager.restoreSession()`.

## AUTH-06 Refresh the access token

- **Steps:** any request returns 401 → `POST /auth/refresh {refreshToken}` → `{accessToken, refreshToken}` → retry once. Web uses a **single-flight** promise so a burst of 401s rotates once (`apps/web/src/lib/api.ts:101-142`); iOS `Core/Networking/AuthInterceptor.swift`.
- **Rules:** token must exist and not be revoked (`auth.service.ts:546-562`); expired → revoked + 401 "Refresh token has expired" (`:565-572`); user or org inactive → revoked + **403** "Account is deactivated" (`:575-581`); old token revoked, new pair issued with the user's **current** role slug (`:584-598`).
- **Failures:** 401 → web throws `ApiError(401,'AUTH_002')` and logs out (`api.ts:135-142`); reusing a rotated token → 401.
- **Web/iOS:** transparent, no screen.

## AUTH-07 Log out

- **Steps:** `POST /auth/logout {refreshToken}` (JWT required) → 204. Web then clears `localStorage` (`auth-context.tsx:122-129`); iOS fires the request without waiting and clears Keychain (`AuthManager.swift:259-287`).
- **Rules:** revokes only the matching refresh token of the caller (`auth.service.ts:612-627`); an unknown token is logged as a warning, still 204. The access token stays valid until it expires.
- **Side effects:** iOS keeps the org branding after logout (by design). iOS does **not** unregister its push device token (see notifications.md).
- **Web:** user menu / profile. **iOS:** `ios:Settings/Views/SettingsView.swift` (log out).

## AUTH-08 Sign in with Apple or Google

- **Actor:** user whose Apple/Google identity is linked, or an invitee (AUTH-11).
- **Steps:** client gets an id_token (Apple `identityToken` + nonce, Google credential) → `POST /auth/apple` or `/auth/google {identityToken, nonce?, invitationToken?, firstName?, lastName?}` → same response as AUTH-01. Web on apex → handoff (as AUTH-02).
- **Rules:**
  - Token verified against provider issuer + audiences from env `APPLE_AUDIENCES` / `GOOGLE_AUDIENCES`; empty list → 401 `PROVIDER_NO_ACCOUNT` (`social-auth.service.ts:43-49,76-80`); bad signature → 401 "Invalid identity token" (`:92`); nonce must equal the claim raw or sha256 (`:95-100`); no `sub` → 401 (`:105`).
  - Linked `(provider, sub)` → login; deactivated user → 403 (`auth.service.ts:191-197`).
  - Not linked and no `invitationToken` → 401 `PROVIDER_NO_ACCOUNT` (`:203-206`). Sign-up is invite-only.
- **Failures:** web maps `PROVIDER_NO_ACCOUNT` to "Nu există cont pentru acest Apple/Google. Ai nevoie de o invitație." (`apps/web/src/lib/auth-errors.ts`); iOS maps it to a provider-specific message (`AuthManager.swift:198`).
- **Web:** `/login` (Google button + Apple JS). **iOS:** `ios:Auth/Views/SocialSignInButtons.swift`, `SocialSignInViewModel.swift`.

## AUTH-09 Link / unlink a provider on my account

- **Steps:** link: `POST /auth/link/:provider {identityToken, nonce?}` → `{linkedProviders}`. Unlink: `DELETE /auth/link/:provider` → `{linkedProviders}`. `:provider` ∈ `apple|google`, else 400 "Unsupported provider" (`auth.controller.ts:31-34`).
- **Rules:** identity already linked to another user → 409 `PROVIDER_ALREADY_LINKED` (`auth.service.ts:294-299`); linking the same identity twice is a no-op. Unlink refused if it is the last login method (no password and no other provider) → 400 `LAST_LOGIN_METHOD` (`:319-326`).
- **Web:** `/profil` → `apps/web/src/components/auth/linked-accounts-card.tsx`. **iOS:** Settings → `ios:Settings/Views/LinkedAccountsView.swift`.

## AUTH-10 Forgot password → reset

- **Actor:** anyone. **Preconditions:** none (no account enumeration on success).
- **Steps:**
  1. `/forgot-password` → `POST /auth/forgot-password {email}` → 204 always (`password.service.ts:30-43`).
  2. Email link `https://<slug>.<BASE_DOMAIN>/reset-password?token=<uuid>` (`email/email.service.ts:58-59`).
  3. Page checks `GET /auth/reset-status/:token` → `{valid, reason: invalid|used|expired}` or `{valid:true, purpose: RESET|REACTIVATION}` (`password.service.ts:53-59`).
  4. `POST /auth/reset-password {token, newPassword}` (min 8) → 204.
- **Rules:** only active users get a mail (`:38`). Token 1 h for RESET, 72 h for REACTIVATION (`:14-15`); creating a token invalidates the user's older unused tokens (`:151-154`). New password must differ from the current one and the last 2 history entries → 400 `PASSWORD_REUSED` (`:91-101`, history block = 3, keep = 5, `:11-13`). Invalid token → 404; used/expired → 400 (`:82-84`).
- **Side effects (one transaction, `:106-140`):** history row, history trimmed to 5, new hash, `failedLoginAttempts = 0`, `lockedAt = null` (unlocks the account), all reset tokens used, **all refresh tokens revoked** (logout everywhere). SystemLog `EMAIL`.
- **Failures:** SMTP error on step 1 propagates (`email.service.ts:105-116`) → 500 for an existing account only.
- **Web:** `apps/web/src/app/forgot-password/page.tsx`, `apps/web/src/app/reset-password/page.tsx`. **iOS:** request only (`AuthManager.requestPasswordReset`, `AuthManager.swift:247`); the reset itself happens on web.

## AUTH-11 Accept an invitation

- **Actor:** invitee with an emailed link `https://<slug>.<BASE_DOMAIN>/accept-invite?token=<uuid>` (`email.service.ts:42`). Invitation creation is `USR-03`.
- **Steps:**
  1. `GET /auth/invite-status/:token` → `{valid:true, email}` or `{valid:false, reason: invalid|used|expired}` (`invitations.service.ts:105-121`).
     2a. Password: `POST /auth/accept-invite {token, password (≥8), firstName (≥1), lastName (≥1)}` → AUTH-01 response (the service logs the user in, `:171`). Web stores tokens and goes to `/` after 1.5 s (`accept-invite/page.tsx:166-172`).
     2b. Apple/Google: `POST /auth/apple|google {identityToken, nonce?, invitationToken: token, firstName?, lastName?}` (`auth.service.ts:215-279`).
- **Rules:** invitation must exist (404), not accepted (400), not expired (400, 72 h, `invitations.service.ts:19`), have a role (400). Password path creates the user via `UsersService.create` → 409 if **any** user (any org, active or not) has that email (`users.service.ts:116-122`). Provider path **reuses** an existing user with that email instead (`auth.service.ts:230-248`).
- **Side effects:** user row (`organizationId` from the invitation), invitation `acceptedAt`, provider link (2b), refresh token.
- **Failures:** web maps message text "expired" / "already been accepted" / "Invalid invitation" to Romanian (`accept-invite/page.tsx:175-182`).
- **Web:** `apps/web/src/app/accept-invite/page.tsx`. **iOS:** missing (no invite deep link; `SocialSignInViewModel(invitationToken:)` is never constructed with a token).

## AUTH-12 Delete my own account

- **Actor:** signed-in user. **Preconditions:** account has a password; not the last active administrator.
- **Steps:** `/profil` → "Șterge contul" → enter password → `DELETE /auth/account {password}` → `{deleted:true}` → client logs out.
- **Rules:** no password → 400 `PASSWORD_REQUIRED` (`auth.service.ts:656-661`); wrong password → 400 `INVALID_PASSWORD` (`:663-671`, not counted toward lockout); last active admin → 400 `LAST_ACTIVE_ADMIN` (`:674-688`).
- **Side effects (one transaction, `:690-711`):** email → `deleted-<id>@deleted.horae.ca`, name "Cont șters", password removed, `isActive=false`, `deletedAt`, provider links deleted, all refresh tokens revoked. Row kept for foreign keys. PostHog `user_deleted_account`.
- **Web:** `web:profil/_ui/date-tab.tsx:103-110`. **iOS:** Settings (`ios:Settings/Views/SettingsView.swift`, `AuthManager.deleteAccount`, `AuthManager.swift:299-316`).

## AUTH-13 Account lockout and recovery

- **Steps:** 5 wrong passwords (AUTH-01) → 403 `ACCOUNT_LOCKED`; web shows "Contul a fost blocat… Resetează-ți parola" (matches the message text `locked`, `login/page.tsx:201-205`) → AUTH-10 unlocks.
- **Rules:** admin reactivation (`USR-06`) also sets `lockedAt` so the old password stops working and a REACTIVATION link is mailed (`users.service.ts:236-249`).

---

## Discrepancies

1. **Provider login skips the lock and org checks.** Password login refuses locked users and inactive orgs (`auth.service.ts:94-108`); Apple/Google login only checks `isActive` (`:191-197`) and `buildAuthResponse` checks nothing (`:345-394`). A locked user or a user of a deactivated org can still get tokens via Apple/Google (they then fail on `/me` → `null`).
2. **Invite to an email that already has an inactive user.** `invite()` only blocks **active** users (`invitations.service.ts:39`). The password accept then fails 409 (`users.service.ts:120`); the Apple/Google accept reuses the inactive row without reactivating it and issues tokens (`auth.service.ts:230-248` → `:278`).
3. **Deactivation does not end sessions.** `deactivate()` only sets `isActive=false` (`users.service.ts:215-219`); refresh tokens are not revoked and the JWT strategy does not hit the DB, so the user keeps API access until the access token expires (≤12 h). The comment in `auth.service.ts:153-155` says sessions are revoked on deactivation.
4. **Role changes lag.** The role slug is in the JWT; `changeRole` takes effect for that user only after their next refresh (≤12 h).
5. **Handoff response is thinner than login.** `redeemHandoff` returns no `handoffCode`, `linkedProviders` or `avatarUrl` (`auth.service.ts:454-466`); web compensates by calling `/me` (`handoff/page.tsx:49`).
6. **`GET /auth/me` returns 200 + `null`** for inactive users/orgs (`auth.service.ts:734-736`) instead of 401/403. Clients must treat `null` as signed out.
7. **Web login error text.** Every non-lock failure (deactivated account, `ORGANIZATION_INACTIVE`, 429, network) shows "Email sau parolă incorectă" (`login/page.tsx:200-207`); lock detection matches message text, not `errorCode`. Accept-invite and reset-password also match English message text (`accept-invite/page.tsx:175-182`, `reset-password/page.tsx:132-139`).
8. **Password-reset enumeration via SMTP errors.** `forgot-password` returns 204 for unknown emails but 500 for known ones when SMTP fails (`password.service.ts:38-41`, `email.service.ts:115`). `reset-password`, `accept-invite` and the status endpoints have only the global 600/min throttle.
9. **`docs/ARCHITECTURE.md` §2 says refresh tokens are argon2-hashed**; they are sha256 (`auth.service.ts:471-473`).
10. **iOS cannot accept an invitation** (no deep link, no form). Invitees must use web once.
