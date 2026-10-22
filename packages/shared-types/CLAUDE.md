# packages/shared-types — `@horae/shared-types`

Tiny TypeScript package of enums + error codes shared by the **TypeScript** apps (`apps/api`,
`apps/web`). Native apps don't consume it — they re-declare the same values (iOS
`Core/Theme/Enums.swift` + `APIError.swift`, android `domain/model/Enums.kt`), so changes here must be
mirrored by hand into all clients.

## Contents

```
src/
├── enums.ts        UserRole, UnitType, StorageType, MaterialStatus, RecipeType, TaskStatus,
│                   StockMovementType, PieceType
├── error-codes.ts  Domain error codes (AUTH_*, STOCK_*, TASK_*, RECIPE_*) — the canonical list
└── index.ts        re-exports both
```

## ⚠️ `UserRole` is legacy — do not key authorization off it

`UserRole` (`ADMINISTRATOR, SEF_LABORATOR, SEF_EVENIMENTE, COFETAR, PATISER, AJUTOR_COFETAR,
MAGAZIONER`) is a **static enum that no longer matches the backend's roles**. The backend uses
**dynamic, DB-defined roles** seeded in `apps/api/src/prisma/seed.ts` (slugs: `administrator`,
`sef-cofetar`, `cofetar`, `gestionar`, `sofer`, `user`) and enforces access via CASL abilities.

Use this enum only for legacy display mapping. New permission logic must check CASL abilities
(action × subject), not role names. See the root `CLAUDE.md` role warning.

## Conventions

- This package is the **source of truth for error codes** — when the API adds one, add it here and
  mirror into each client's error mapper (web `lib/api.ts`, iOS `APIError.swift`, android error layer).
- Keep enums aligned with `apps/api/src/prisma/schema.prisma`. The Prisma schema wins on conflicts.
- Pure types/constants — no runtime deps, no side effects.
  </content>
