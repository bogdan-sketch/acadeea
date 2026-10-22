# Test matrix

Every documented flow, with its priority. Coverage columns are for the test writers: put the spec file (and test name) that covers the flow, or leave blank. Existing suites today: `apps/api/test/smoke.e2e-spec.ts` (GET sweep < 500 + one client lifecycle) and `apps/api/test/tenant-isolation.e2e-spec.ts` (handoff once, by-slug branding, own org, per-org roles, cross-org invisibility, per-tenant location names); no web e2e suite exists yet.

Priority: **P0** = money, stock, auth or tenant data can be wrong or leak; **P1** = daily operational flow; **P2** = secondary / read-only / admin tooling.

| ID      | Flow                                                                   | Doc                                        | Priority | API e2e | Web e2e | iOS UI test | Notes |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------ | -------- | ------- | ------- | ----------- | ----- |
| AUTH-01 | Log in with email and password                                         | [auth.md](auth.md)                         | P0       |         |         |             |       |
| AUTH-02 | Log in on the apex domain (horae.ca) → handoff to org subdomain        | [auth.md](auth.md)                         | P1       |         |         |             |       |
| AUTH-03 | Redeem a handoff code                                                  | [auth.md](auth.md)                         | P0       |         |         |             |       |
| AUTH-04 | Log in on the wrong org's subdomain                                    | [auth.md](auth.md)                         | P2       |         |         |             |       |
| AUTH-05 | Restore the session on launch                                          | [auth.md](auth.md)                         | P1       |         |         |             |       |
| AUTH-06 | Refresh the access token                                               | [auth.md](auth.md)                         | P0       |         |         |             |       |
| AUTH-07 | Log out                                                                | [auth.md](auth.md)                         | P1       |         |         |             |       |
| AUTH-08 | Sign in with Apple or Google                                           | [auth.md](auth.md)                         | P0       |         |         |             |       |
| AUTH-09 | Link / unlink a provider on my account                                 | [auth.md](auth.md)                         | P1       |         |         |             |       |
| AUTH-10 | Forgot password → reset                                                | [auth.md](auth.md)                         | P0       |         |         |             |       |
| AUTH-11 | Accept an invitation                                                   | [auth.md](auth.md)                         | P0       |         |         |             |       |
| AUTH-12 | Delete my own account                                                  | [auth.md](auth.md)                         | P1       |         |         |             |       |
| AUTH-13 | Account lockout and recovery                                           | [auth.md](auth.md)                         | P0       |         |         |             |       |
| USR-01  | List and search users                                                  | [users-roles.md](users-roles.md)           | P1       |         |         |             |       |
| USR-02  | Create a user directly (with password)                                 | [users-roles.md](users-roles.md)           | P2       |         |         |             |       |
| USR-03  | Invite a user                                                          | [users-roles.md](users-roles.md)           | P0       |         |         |             |       |
| USR-04  | List invitations                                                       | [users-roles.md](users-roles.md)           | P2       |         |         |             |       |
| USR-05  | Change a user's role                                                   | [users-roles.md](users-roles.md)           | P0       |         |         |             |       |
| USR-06  | Deactivate / reactivate a user                                         | [users-roles.md](users-roles.md)           | P0       |         |         |             |       |
| USR-07  | Send a password-reset link for a user                                  | [users-roles.md](users-roles.md)           | P2       |         |         |             |       |
| USR-08  | Edit a user's name                                                     | [users-roles.md](users-roles.md)           | P2       |         |         |             |       |
| USR-09  | Profile photo                                                          | [users-roles.md](users-roles.md)           | P2       |         |         |             |       |
| ROLE-01 | View the roles × permissions matrix                                    | [users-roles.md](users-roles.md)           | P2       |         |         |             |       |
| ROLE-02 | Create / rename a role                                                 | [users-roles.md](users-roles.md)           | P1       |         |         |             |       |
| ROLE-03 | Set a role's permissions                                               | [users-roles.md](users-roles.md)           | P0       |         |         |             |       |
| ROLE-04 | Delete a role                                                          | [users-roles.md](users-roles.md)           | P1       |         |         |             |       |
| REC-01  | Browse recipes (bento dial + list)                                     | [recipes.md](recipes.md)                   | P2       |         |         |             |       |
| REC-02  | Cofetar sees only recipes of their active tasks                        | [recipes.md](recipes.md)                   | P0       |         |         |             |       |
| REC-03  | Create a recipe                                                        | [recipes.md](recipes.md)                   | P0       |         |         |             |       |
| REC-04  | Edit a recipe                                                          | [recipes.md](recipes.md)                   | P0       |         |         |             |       |
| REC-05  | Semipreparate inside a recipe                                          | [recipes.md](recipes.md)                   | P1       |         |         |             |       |
| REC-06  | Declare a byproduct                                                    | [recipes.md](recipes.md)                   | P1       |         |         |             |       |
| REC-07  | Duplicate a recipe                                                     | [recipes.md](recipes.md)                   | P1       |         |         |             |       |
| REC-08  | Draft / publish                                                        | [recipes.md](recipes.md)                   | P1       |         |         |             |       |
| REC-09  | Archive / restore                                                      | [recipes.md](recipes.md)                   | P1       |         |         |             |       |
| REC-10  | Delete a recipe (single)                                               | [recipes.md](recipes.md)                   | P1       |         |         |             |       |
| REC-11  | Bulk delete recipes (with cascade)                                     | [recipes.md](recipes.md)                   | P1       |         |         |             |       |
| REC-12  | Photo                                                                  | [recipes.md](recipes.md)                   | P1       |         |         |             |       |
| REC-13  | Version history                                                        | [recipes.md](recipes.md)                   | P2       |         |         |             |       |
| REC-14  | Yield history                                                          | [recipes.md](recipes.md)                   | P2       |         |         |             |       |
| REC-15  | Nutrition                                                              | [recipes.md](recipes.md)                   | P2       |         |         |             |       |
| PRC-01  | See production cost and margin                                         | [recipes.md](recipes.md)                   | P0       |         |         |             |       |
| PRC-02  | Set the selling price                                                  | [recipes.md](recipes.md)                   | P0       |         |         |             |       |
| PRC-03  | Manual cost override (labour and overheads)                            | [recipes.md](recipes.md)                   | P1       |         |         |             |       |
| PRC-04  | Price history                                                          | [recipes.md](recipes.md)                   | P2       |         |         |             |       |
| STK-01  | Create a raw material                                                  | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-02  | Edit / discontinue / hard-delete a raw material                        | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-03  | Consumables (boxes, ribbons…)                                          | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-04  | Suppliers                                                              | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-05  | Receive stock (single intake)                                          | [stock.md](stock.md)                       | P0       |         |         |             |       |
| STK-06  | Receive a delivery (batch / NIR)                                       | [stock.md](stock.md)                       | P0       |         |         |             |       |
| STK-07  | Adjust stock (absolute count)                                          | [stock.md](stock.md)                       | P0       |         |         |             |       |
| STK-08  | Test consumption (R&D / test bakes)                                    | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-09  | Lots: list, hold, FIFO                                                 | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-10  | Movements log and export                                               | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-11  | Low stock                                                              | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-12  | Expiring stock                                                         | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-13  | Item availability snapshot                                             | [stock.md](stock.md)                       | P2       |         |         |             |       |
| STK-14  | Stock export / import (.xlsx)                                          | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-15  | Stock review ("Revizie stocuri") export / import                       | [stock.md](stock.md)                       | P0       |         |         |             |       |
| STK-16  | Requirements plan (procurement)                                        | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-17  | Finished goods / semipreparate stock                                   | [stock.md](stock.md)                       | P1       |         |         |             |       |
| STK-18  | Unit conversions                                                       | [stock.md](stock.md)                       | P2       |         |         |             |       |
| LOC-01  | Locations: create, edit, deactivate                                    | [stock.md](stock.md)                       | P1       |         |         |             |       |
| LOC-02  | Delete a location                                                      | [stock.md](stock.md)                       | P0       |         |         |             |       |
| LOC-03  | Default location (org setting)                                         | [stock.md](stock.md)                       | P1       |         |         |             |       |
| LOC-04  | Assign users to a location                                             | [stock.md](stock.md)                       | P1       |         |         |             |       |
| LOC-05  | Location stock and dashboard                                           | [stock.md](stock.md)                       | P2       |         |         |             |       |
| TRF-01  | Create a transfer                                                      | [stock.md](stock.md)                       | P0       |         |         |             |       |
| TRF-02  | Approve / reject a transfer                                            | [stock.md](stock.md)                       | P1       |         |         |             |       |
| TRF-03  | Ship, receive or cancel                                                | [stock.md](stock.md)                       | P0       |         |         |             |       |
| TRF-04  | Aviz de însoțire (delivery note), signature and conformity declaration | [stock.md](stock.md)                       | P1       |         |         |             |       |
| TASK-01 | Create a single task                                                   | [tasks.md](tasks.md)                       | P0       |         |         |             |       |
| TASK-02 | Create several tasks at once (family)                                  | [tasks.md](tasks.md)                       | P1       |         |         |             |       |
| TASK-03 | See tasks (board, list, "Ziua mea")                                    | [tasks.md](tasks.md)                       | P1       |         |         |             |       |
| TASK-04 | Edit a task                                                            | [tasks.md](tasks.md)                       | P1       |         |         |             |       |
| TASK-05 | Assign / reassign                                                      | [tasks.md](tasks.md)                       | P1       |         |         |             |       |
| TASK-06 | Start a task (reserve stock) / blocked by stock                        | [tasks.md](tasks.md)                       | P0       |         |         |             |       |
| TASK-07 | Shopping list from blocked tasks                                       | [tasks.md](tasks.md)                       | P1       |         |         |             |       |
| TASK-08 | Material requirements and preview                                      | [tasks.md](tasks.md)                       | P1       |         |         |             |       |
| TASK-09 | Finish a task (yield capture, byproducts, output location)             | [tasks.md](tasks.md)                       | P0       |         |         |             |       |
| TASK-10 | Cancel a task                                                          | [tasks.md](tasks.md)                       | P0       |         |         |             |       |
| TASK-11 | Delete a task                                                          | [tasks.md](tasks.md)                       | P1       |         |         |             |       |
| TASK-12 | Bulk actions on tasks                                                  | [tasks.md](tasks.md)                       | P1       |         |         |             |       |
| TASK-13 | Traceability sheet                                                     | [tasks.md](tasks.md)                       | P2       |         |         |             |       |
| TASK-14 | Production calendar                                                    | [tasks.md](tasks.md)                       | P2       |         |         |             |       |
| ORD-01  | Create a manual order                                                  | [orders.md](orders.md)                     | P0       |         |         |             |       |
| ORD-02  | Import an order from WooCommerce                                       | [orders.md](orders.md)                     | P1       |         |         |             |       |
| ORD-03  | Browse orders                                                          | [orders.md](orders.md)                     | P1       |         |         |             |       |
| ORD-04  | Move an order through its statuses                                     | [orders.md](orders.md)                     | P0       |         |         |             |       |
| ORD-05  | Edit order details and assignee                                        | [orders.md](orders.md)                     | P1       |         |         |             |       |
| ORD-06  | Add, change, remove products                                           | [orders.md](orders.md)                     | P1       |         |         |             |       |
| ORD-07  | Pickup vs delivery                                                     | [orders.md](orders.md)                     | P1       |         |         |             |       |
| ORD-08  | Invoice attachment                                                     | [orders.md](orders.md)                     | P1       |         |         |             |       |
| ORD-09  | Delivery note ("foaie de drum") and customer signature                 | [orders.md](orders.md)                     | P1       |         |         |             |       |
| ORD-10  | Conformity certificate                                                 | [orders.md](orders.md)                     | P1       |         |         |             |       |
| ORD-11  | Archive                                                                | [orders.md](orders.md)                     | P1       |         |         |             |       |
| ORD-12  | Order calendar                                                         | [orders.md](orders.md)                     | P2       |         |         |             |       |
| ORD-13  | Order stats                                                            | [orders.md](orders.md)                     | P2       |         |         |             |       |
| ORD-14  | Status history and revenue                                             | [orders.md](orders.md)                     | P2       |         |         |             |       |
| ORD-15  | Bulk actions and delete                                                | [orders.md](orders.md)                     | P1       |         |         |             |       |
| SALE-01 | Draft from an eBriza (POS) report                                      | [sales-deductions.md](sales-deductions.md) | P1       |         |         |             |       |
| SALE-02 | Manual deduction (with CSV template)                                   | [sales-deductions.md](sales-deductions.md) | P1       |         |         |             |       |
| SALE-03 | Draft from site (WooCommerce) orders in a period                       | [sales-deductions.md](sales-deductions.md) | P1       |         |         |             |       |
| SALE-04 | Review and confirm                                                     | [sales-deductions.md](sales-deductions.md) | P0       |         |         |             |       |
| SALE-05 | Discard a draft / revert a confirmed deduction                         | [sales-deductions.md](sales-deductions.md) | P0       |         |         |             |       |
| SALE-06 | Automatic deduction when a site order reaches "în procesare"           | [sales-deductions.md](sales-deductions.md) | P0       |         |         |             |       |
| ORG-01  | Company identity and VAT                                               | [organization.md](organization.md)         | P1       |         |         |             |       |
| ORG-02  | Default production location                                            | [organization.md](organization.md)         | P1       |         |         |             |       |
| ORG-03  | Logo (login and in-app, light/dark)                                    | [organization.md](organization.md)         | P1       |         |         |             |       |
| ORG-04  | Colour scheme (personal, per device)                                   | [organization.md](organization.md)         | P2       |         |         |             |       |
| ORG-05  | Public branding before login                                           | [organization.md](organization.md)         | P2       |         |         |             |       |
| ORG-06  | Categories (bento dial)                                                | [organization.md](organization.md)         | P1       |         |         |             |       |
| ORG-07  | Organisation snapshots (backup / restore)                              | [organization.md](organization.md)         | P0       |         |         |             |       |
| ORG-08  | Whole-database backups (platform operator)                             | [organization.md](organization.md)         | P2       |         |         |             |       |
| ORG-09  | Reset data                                                             | [organization.md](organization.md)         | P0       |         |         |             |       |
| ORG-10  | System journal ("Jurnal sistem")                                       | [organization.md](organization.md)         | P1       |         |         |             |       |
| ORG-11  | Changelog / "Noutăți"                                                  | [organization.md](organization.md)         | P2       |         |         |             |       |
| ORG-12  | Tutorial and help                                                      | [organization.md](organization.md)         | P2       |         |         |             |       |
| ORG-13  | Provision a new organisation (platform)                                | [organization.md](organization.md)         | P2       |         |         |             |       |
| ORG-14  | Dashboard                                                              | [organization.md](organization.md)         | P2       |         |         |             |       |
| ORG-15  | Analytics                                                              | [organization.md](organization.md)         | P2       |         |         |             |       |
| ORG-16  | Activity feed                                                          | [organization.md](organization.md)         | P2       |         |         |             |       |
| INT-01  | Connect a WooCommerce shop                                             | [integrations.md](integrations.md)         | P1       |         |         |             |       |
| INT-02  | Map shop products to recipes                                           | [integrations.md](integrations.md)         | P1       |         |         |             |       |
| INT-03  | Receive a WooCommerce webhook                                          | [integrations.md](integrations.md)         | P0       |         |         |             |       |
| INT-04  | Poll WooCommerce every 15 minutes                                      | [integrations.md](integrations.md)         | P1       |         |         |             |       |
| INT-05  | Sync pending external orders into Horae orders                         | [integrations.md](integrations.md)         | P0       |         |         |             |       |
| INT-06  | Backfill the last 90 days                                              | [integrations.md](integrations.md)         | P1       |         |         |             |       |
| INT-07  | Review imported external orders                                        | [integrations.md](integrations.md)         | P2       |         |         |             |       |
| INT-08  | eBriza                                                                 | [integrations.md](integrations.md)         | P2       |         |         |             |       |
| NTF-01  | Register a device for push                                             | [notifications.md](notifications.md)       | P1       |         |         |             |       |
| NTF-02  | Unregister a device                                                    | [notifications.md](notifications.md)       | P1       |         |         |             |       |
| NTF-03  | Inbox                                                                  | [notifications.md](notifications.md)       | P1       |         |         |             |       |
| NTF-04  | Live updates (iOS)                                                     | [notifications.md](notifications.md)       | P1       |         |         |             |       |
| NTF-05  | Scheduled jobs (all times server time unless noted)                    | [notifications.md](notifications.md)       | P2       |         |         |             |       |

## Cross-cutting checks

| ID   | Check                                                                                                                                                                                           | Doc                                | Priority | API e2e | Web e2e | iOS UI test | Notes |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------- | ------- | ------- | ----------- | ----- |
| X-01 | Unknown body field → 400 on every write route (whitelist + forbidNonWhitelisted)                                                                                                                | [README.md](README.md)             | P0       |         |         |             |       |
| X-02 | Tenant isolation: `GET /activity` returns only own-org task history                                                                                                                             | [organization.md](organization.md) | P0       |         |         |             |       |
| X-03 | Tenant isolation: `GET /analytics/production` and `/analytics/orders` use only own-org data                                                                                                     | [organization.md](organization.md) | P0       |         |         |             |       |
| X-04 | Tenant isolation: `GET /stock/lots` (with and without filters) returns only own-org lots                                                                                                        | [stock.md](stock.md)               | P0       |         |         |             |       |
| X-05 | Tenant isolation: `GET /stock/expiring` returns only own-org finished goods                                                                                                                     | [stock.md](stock.md)               | P0       |         |         |             |       |
| X-06 | Tenant isolation: stock review import ignores foreign `RecipeStock` ids                                                                                                                         | [stock.md](stock.md)               | P0       |         |         |             |       |
| X-07 | Woo webhook rejects unsigned / forged payloads                                                                                                                                                  | [integrations.md](integrations.md) | P0       |         |         |             |       |
| X-08 | Role change and deactivation take effect without waiting for token expiry                                                                                                                       | [auth.md](auth.md)                 | P0       |         |         |             |       |
| X-09 | Throttles: login 10/min, refresh 60/min, handoff 10/min, forgot-password 10/min, global 600/min → 429                                                                                           | [auth.md](auth.md)                 | P1       |         |         |             |       |
| X-10 | Web `can()` agrees with server permissions for every seeded role and a custom role                                                                                                              | [users-roles.md](users-roles.md)   | P1       |         |         |             |       |
| X-11 | Every bulk-delete resource: preview dependents, refuse without cascade, cascade cleans dependents                                                                                               | [README.md](README.md)             | P1       |         |         |             |       |
| X-12 | Error body shape `{statusCode, errorCode, message, correlationId, timestamp}` and domain codes (STOCK*001/002/004, TASK_BLOCKED_INSUFFICIENT_STOCK, SALES_001/002, ACCOUNT_LOCKED, PROVIDER*\*) | [README.md](README.md)             | P1       |         |         |             |       |
| X-13 | Formatting: dates day-first, 24 h, Monday-first weeks, metric units in every screen                                                                                                             | [README.md](README.md)             | P2       |         |         |             |       |
