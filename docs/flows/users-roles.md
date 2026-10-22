# Users and roles

Sources: `api:users/*`, `api:invitations/*`, `api:roles/*`, `api:auth/casl/*`, web `web:users/page.tsx`, `web:users/[id]/page.tsx`, `web:users/roles-matrix.tsx` (`/roles` redirects to `/users?tab=roles`, `web:roles/page.tsx`), iOS `ios:Users/*`, `ios:Roles/*`. Permission model: see [README](README.md#roles-and-permissions-model).

## Endpoints

| Method + path                                         | Policy                | Body / query                                                                                        |
| ----------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /users`                                          | read User             | `page≥1=1, limit≥1=20, isActive?, roleId?, search?` (name/email, case-insensitive) — no max `limit` |
| `GET /users/:id`                                      | read User             | —                                                                                                   |
| `POST /users`                                         | create User           | `{email, password≥8, firstName≥1, lastName≥1, roleId}`                                              |
| `PATCH /users/:id`                                    | update User           | `{email?, password?≥8, firstName?, lastName?, roleId?}`                                             |
| `PATCH /users/:id/role`                               | update User           | `{roleId}`                                                                                          |
| `DELETE /users/:id`                                   | delete User           | deactivates (soft)                                                                                  |
| `PATCH /users/:id/reactivate`                         | update User           | —                                                                                                   |
| `POST /users/me/avatar`, `DELETE /users/me/avatar`    | any signed-in user    | multipart field `avatar`                                                                            |
| `POST/DELETE /users/:id/avatar`                       | update User           | multipart field `avatar`                                                                            |
| `POST /users/invite`                                  | manage UserInvitation | `{email, roleId}`                                                                                   |
| `GET /users/invitations`                              | read User             | —                                                                                                   |
| `GET /roles`, `GET /roles/:id`, `GET /roles/subjects` | manage Role           | —                                                                                                   |
| `POST /roles`                                         | manage Role           | `{name≥2, slug? (kebab-case), description?}`                                                        |
| `PATCH /roles/:id`                                    | manage Role           | `{name?, description?}` (slug never changes)                                                        |
| `DELETE /roles/:id`                                   | manage Role           | —                                                                                                   |
| `PUT /roles/:id/permissions`                          | manage Role           | `{permissions: [{action, subject}]}` (replaces all)                                                 |

---

## USR-01 List and search users

- **Actor:** admin (read User). **Steps:** web `/users` → `GET /users?page=1&limit=200` (`web:users/page.tsx:75`); iOS `UserListView` → `GET /users` with query.
- **Rules:** tenant-scoped; ordered newest first (`api:users/users.service.ts:43-78`).
- **Web:** `/users` (tab "Echipă"). **iOS:** `ios:Users/Views/UserListView.swift`.

## USR-02 Create a user directly (with password)

- **Actor:** create User. **Steps:** `POST /users`. No web or iOS screen uses it (web and iOS invite instead).
- **Rules:** email unique across **all** orgs → 409 (`users.service.ts:116-122`); role must exist in the org → 404 (`:125-130`).
- **Web:** missing. **iOS:** missing.

## USR-03 Invite a user

- **Actor:** manage UserInvitation (administrator). **Preconditions:** SMTP configured.
- **Steps:** web `/users` → "Invită" → email + role chips → `POST /users/invite {email, roleId}` (`web:users/page.tsx:110`). iOS `InviteUserSheet` → same call.
- **Rules (`api:invitations/invitations.service.ts:36-100`):** an **active** user with that email in any org → 409 (`:38-41`); pending invitations for the same email are deleted and replaced (`:45-50`); role must exist → 400 (`:53-56`); expiry 72 h (`:19`).
- **Side effects:** invitation row; email with `https://<slug>.<BASE_DOMAIN>/accept-invite?token=…`; SystemLog `EMAIL`.
- **Failures:** SMTP error → invitation row deleted, 502 `EMAIL_SEND_FAILED` (`:81-95`).
- **Next:** invitee accepts (`AUTH-11`). **Web:** `/users`. **iOS:** `ios:Users/Views/InviteUserSheet.swift`.

## USR-04 List invitations

- `GET /users/invitations` → all invitations (accepted, pending, expired), newest first (`invitations.service.ts:182-189`). Status is derived client-side from `acceptedAt` / `expiresAt`.
- **Web:** `/users`. **iOS:** `UserService.fetchInvitations` (`ios:Users/Services/UserService.swift:104`).

## USR-05 Change a user's role

- **Actor:** update User. **Steps:** user detail → role chips → `PATCH /users/:id/role {roleId}` (`web:users/[id]/page.tsx:46`; iOS `UserService.changeRole`).
- **Rules:** cannot change your own role → 400 (`users.service.ts:264-266`); role must exist → 404 (`:276-279`); demoting the last active administrator → 400 (`:282-284`, `:299-317`).
- **Side effects:** effective for the user after their next token refresh (role slug lives in the JWT).
- **Web:** `/users/[id]`. **iOS:** `ios:Users/Views/UserDetailView.swift`.

## USR-06 Deactivate / reactivate a user

- **Actor:** delete User (deactivate) / update User (reactivate).
- **Steps:** deactivate `DELETE /users/:id`; reactivate `PATCH /users/:id/reactivate` (`web:users/[id]/page.tsx:68-72`, `web:users/page.tsx:149-150`).
- **Rules:** cannot deactivate yourself → 400 (`users.service.ts:199-201`); cannot deactivate the last active admin → 400 (`:211-213`). Reactivate sets `isActive=true`, **`lockedAt=now`**, counter 0, and mails a REACTIVATION set-password link valid 72 h (`:236-249`, `api:password/password.service.ts:46-50`). The user cannot log in with the old password until they set a new one.
- **Side effects:** none on sessions at deactivation (see auth discrepancy 3).
- **Web:** `/users`, `/users/[id]`. **iOS:** `ios:Users/Views/UserDetailView.swift`.

## USR-07 Send a password-reset link for a user

- **Actor:** admin on `/users`. **Steps:** row action → `POST /auth/forgot-password {email}` (`web:users/page.tsx:130`) → `AUTH-10`.
- **Web:** `/users`. **iOS:** missing.

## USR-08 Edit a user's name

- **Steps:** `PATCH /users/:id {firstName?, lastName?}` (web client sends only names, `apps/web/src/lib/api.ts:1308`).
- **Rules:** email change checked for uniqueness across all orgs → 409 (`users.service.ts:165-172`).
- **Web:** `/users/[id]` / `/profil`. **iOS:** missing (iOS edits only the avatar).

## USR-09 Profile photo

- **Steps:** `POST /users/me/avatar` (multipart `avatar`, any image ≤ `MAX_UPLOAD_BYTES`, re-encoded to 512 px WebP, `api:users/users.controller.ts:58-72`); remove with `DELETE /users/me/avatar`. Admin variant `POST/DELETE /users/:id/avatar` (update User).
- **Web:** `/profil` (`components/image-upload.tsx`). **iOS:** `ios:Settings/Views/ProfileAvatarEditor.swift`.

---

## ROLE-01 View the roles × permissions matrix

- **Actor:** manage Role. **Steps:** `/users?tab=roles` → `GET /roles` + `GET /roles/subjects` + `GET /roles/:id` per role (`web:users/roles-matrix.tsx:79-80`).
- **Rules:** `/roles/subjects` returns `{subjects (without 'all'), actions (without 'manage')}` (`api:roles/roles.service.ts:256-261`).
- **Web:** `/users?tab=roles`. **iOS:** `ios:Roles/Views/RoleListView.swift`, `RoleDetailView.swift`.

## ROLE-02 Create / rename a role

- **Steps:** `POST /roles {name, slug?, description?}` / `PATCH /roles/:id {name?, description?}` (`roles-matrix.tsx:166-167`).
- **Rules:** name unique in org → 409 (`roles.service.ts:107`, `:149-154`); slug auto-generated from name if omitted, unique in org → 409 (`:110-114`); slug format `^[a-z0-9]+(?:-[a-z0-9]+)*$` (`roles/dto/create-role.dto.ts`). New role starts with no permissions.
- **Web:** `/users?tab=roles`. **iOS:** `ios:Roles/Views/RoleFormView.swift`.

## ROLE-03 Set a role's permissions

- **Steps:** toggle cells → `PUT /roles/:id/permissions {permissions:[{action,subject}]}` (`roles-matrix.tsx:135`).
- **Rules:** administrator permissions are read-only → 400 (`roles.service.ts:231-233`); full replace in one transaction (`:236-243`); CASL cache cleared for that slug (`:246`) — but only in the API process that served the request.
- **Not validated:** `action`/`subject` are free strings (`roles/dto/set-permissions.dto.ts`), so typos are stored and silently grant nothing.
- **Web:** `/users?tab=roles`. **iOS:** `ios:Roles/Views/RoleDetailView.swift`.

## ROLE-04 Delete a role

- **Steps:** `DELETE /roles/:id` (`roles-matrix.tsx:189`).
- **Rules:** system roles (`administrator`, `user`) → 400 (`roles.service.ts:195-197`); users on the role are moved to `user` (read Task only) first; missing `user` role → 400 (`:199-218`).
- **Web:** `/users?tab=roles`. **iOS:** `ios:Roles/Views/RoleDetailView.swift`.

---

## Discrepancies

1. **Web ignores server permissions.** Web `can()` uses a hard-coded slug map (`apps/web/src/contexts/auth-context.tsx:183-276`); ROLE-03 edits and custom roles change nothing in the web UI, while iOS follows them (`PermissionManager.swift:34-50`). Specific drift from `role-definitions.ts`: web `sef-cofetar` lacks `create/update Order`; web `cofetar` has **no Order access** at all (API grants read/create/update Order); web gates the invite button on `create User` (`web:users/page.tsx:199`) while the API requires `manage UserInvitation`; web gates the roles tab on `read all` (`:60`) while the API requires `manage Role`.
2. **`PATCH /users/:id` with `roleId` bypasses the role guards.** `update()` writes `roleId` with no self-check and no last-admin check (`users.service.ts:179`), unlike `changeRole` (`:264-284`). It also sets a password without the history rule or session revocation of `AUTH-10` (`:180-182`).
3. **Deactivating a user keeps their sessions alive** (no refresh-token revocation, `users.service.ts:215-219`).
4. **Invitation accept is not transactional.** User is created, then the invitation is marked accepted in a second write (`invitations.service.ts:153-168`); a crash in between leaves a usable invite for an existing email (next accept → 409).
5. **CASL cache is per process.** `clearCache` (`casl-ability.factory.ts:105-115`) only clears the instance that handled `PUT /roles/:id/permissions`; other instances serve stale abilities for up to 60 s.
6. **`GET /users` has no upper bound on `limit`** (`users/dto/user-query.dto.ts:14-18`); web asks for 200.
