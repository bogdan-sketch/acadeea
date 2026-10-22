# Notifications, push, WebSocket, scheduled jobs

Sources: `api:notifications/*`, `api:websocket/*`, `api:tasks/tasks.service.ts` (`notifyAssignee`), `api:sales-deductions/sales-deductions.service.ts` (`notifySummary`), cron jobs in `api:*/*.job.ts`, web `apps/web/src/components/notification-bell.tsx`, iOS `ios:Notifications/**`, `apps/ios/Horae/Core/WebSocket/WebSocketManager.swift`, `apps/ios/Horae/HoraeApp.swift`.

## Channels

| Channel                     | What                                                                 | Who receives                        | Where                            |
| --------------------------- | -------------------------------------------------------------------- | ----------------------------------- | -------------------------------- |
| Inbox (`Notification` row)  | `type, title, body, data, readAt`                                    | one user                            | `notifications.service.ts:61-85` |
| Push (APNs)                 | same title/body, **no data payload**                                 | every iOS device token of that user | `push-sender.service.ts:106-135` |
| WebSocket (Socket.IO `/ws`) | live events                                                          | org rooms                           | `websocket.gateway.ts`           |
| Web                         | polls `GET /notifications/unread-count` every 60 s; **no WebSocket** | —                                   | `notification-bell.tsx:14,26-34` |

## Notification types

| `type`                                                    | Trigger                                                                                                                | Recipients                                                   | Where                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `TASK_ASSIGNED` "Task nou asignat"                        | task created with an assignee, `PATCH /tasks/:id` with a new assignee, `PATCH /tasks/:id/assign`                       | the assignee, unless they assigned themselves                | `tasks.service.ts:111-139,398,609-616,910` |
| `SALES_DEDUCTION` "Vânzări scăzute din stoc — <location>" | sales deduction confirmed (manual or auto)                                                                             | confirmer + every active administrator                       | `sales-deductions.service.ts:971-1012`     |
| `STOCK_EXPIRING` "Material aproape de expirare"           | daily 08:00 job: raw-material lots with stock whose expiry is within the material's `expiryNotifyLeadDays` (default 7) | active administrators of the org; deduped per lot for 7 days | `expiry-notification.job.ts:13-155`        |

## WebSocket events

Handshake: `token` = access JWT, verified RS256; tokens without `organizationId` are disconnected (`websocket.gateway.ts:50-70`). Rooms joined: `org:<id>`, `org:<id>:role:<slug>`, `user:<id>` (`:76-79`).

| Event                                                                      | Room                      | Emitted by                                                            | Consumers              |
| -------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------- | ---------------------- | ------------------------------------------ | --- |
| `task:update` `{taskId, taskTitle, newStatus, assignedToId}`               | `org:<id>`                | task create / transition / blocked / assign                           | iOS                    |
| `stock:update` `{materialId, materialTitle, newStockCount, movementType IN | OUT                       | ADJUSTMENT}`                                                          | `org:<id>`             | movements, reservations, fulfilment, sales | iOS |
| `stock:low`                                                                | `org:<id>:role:gestionar` | stock ≤ minimum after a write                                         | iOS (gestionar only)   |
| `activity:new` `{type, title, description, metadata}`                      | `org:<id>`                | task/stock/transfer/order events, `STOCK_AVAILABLE` for blocked tasks | iOS `ActivityFeedView` |

---

## NTF-01 Register a device for push

- **Actor:** iOS app after sign-in. **Steps:** ask permission → APNs token → `POST /notifications/device-token {token, platform:'ios'|'android'}` (`HoraeApp.swift:121-150`, `NotificationService.uploadDeviceToken`).
- **Rules:** upsert by token; re-registering moves the token to the current user (`notifications.service.ts:29-36`). Push is a no-op when `APNS_*` env is missing (`push-sender.service.ts:1-40`). Topic = bundle id per env (`ca.horae.app` / `ca.horae.app.test`). Tokens APNs reports dead are pruned (`:137-160`).
- **Web:** n/a. **iOS:** `HoraeApp.swift`.

## NTF-02 Unregister a device

- **Steps:** `DELETE /notifications/device-token?token=…` (`notifications.controller.ts:81-85`).
- **Rules:** deletes by token string, no ownership check.
- **iOS:** never called (see discrepancies).

## NTF-03 Inbox

- **Steps:** web bell → `GET /notifications/unread-count` (poll 60 s) → open → `GET /notifications?page&limit` → click → `PATCH /notifications/:id/read`; "Marchează tot" → `PATCH /notifications/read-all`. iOS `NotificationInboxView` same calls.
- **Rules:** only the caller's rows; marking another user's id → 404 (`notifications.service.ts:117-128`); `readAt` kept on re-read.
- **Web:** `components/notification-bell.tsx`. **iOS:** `ios:Notifications/Views/NotificationInboxView.swift`.

## NTF-04 Live updates (iOS)

- **Steps:** after login iOS connects to `/ws` with the token and refreshes boards/lists on `task:update`, `stock:update`, `stock:low`, `activity:new` (`WebSocketManager.swift:85-120`).
- **Web:** none (polling/refetch only). **iOS:** `WebSocketManager`.

## NTF-05 Scheduled jobs (all times server time unless noted)

| Job                | Schedule                  | Does                                     | Where                                            |
| ------------------ | ------------------------- | ---------------------------------------- | ------------------------------------------------ |
| Org snapshots      | 01:30                     | snapshot every active org, keep 30 auto  | `api:backups/backups.job.ts:26`                  |
| DB dump            | 03:00 UTC + boot catch-up | pg_dump, retention                       | `api:backup/backup.service.ts`                   |
| Order auto-archive | 03:30                     | archive LIVRATA/ANULATA closed > 60 days | `api:orders/order-archive.job.ts:10,29`          |
| System-log purge   | 03:30 Europe/Bucharest    | delete logs > 90 days                    | `api:system-logs/system-log-retention.job.ts:18` |
| Expiry warnings    | 08:00                     | `STOCK_EXPIRING` to admins               | `api:notifications/expiry-notification.job.ts`   |
| WooCommerce poll   | every 15 min              | import + auto-deduct + sync              | `api:integrations/woo-poll.job.ts:40`            |

---

## Discrepancies

1. **Logout keeps the device registered.** iOS never calls `DELETE /notifications/device-token` (only `uploadDeviceToken` exists, `ios:Notifications/Services/NotificationService.swift:49-58`); after logout, or when a shared shop iPad switches user, the previous user's pushes keep arriving until someone else logs in on it.
2. **`DELETE /notifications/device-token` has no ownership check** (`notifications.service.ts:38-41`): any signed-in user can unregister any token they know.
3. **Per-user WebSocket room is broken.** The gateway joins `user:${payload.userId}` but the raw JWT carries `sub`, not `userId` (`websocket.gateway.ts:59-79`, token shape `auth.service.ts:768-774`); every socket joins `user:undefined`. Nothing emits to user rooms today, so it is latent.
4. **`task:update` goes to the whole org,** including users who cannot see that task under task visibility (`websocket.gateway.ts:105-107` vs `tasks.service.ts:259-266`); the title is in the payload.
5. **`stock:low` reaches only the `gestionar` role** (`websocket.gateway.ts:110-115`); administrators and custom roles never get it live.
6. **Push has no payload data** (`push-sender.service.ts:118-123`): tapping a push cannot deep-link to the task/deduction; the ids exist only in the inbox row.
7. **Android tokens are accepted but never pushed** (`platform: 'ios'` filter, `push-sender.service.ts:112-114`; no FCM sender).
8. **Expiry warnings ignore finished goods and consumables.** The job only scans raw-material lots (`expiry-notification.job.ts:83-100`); `RecipeStock.expiryDate` (cakes) is never notified.
9. **`docs/ARCHITECTURE.md` §2 lists only four events and says the socket joins user rooms for targeting**; no service uses user rooms.
