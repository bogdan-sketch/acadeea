# ============================================================
# Stage 1 — Install dependencies
# ============================================================
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace root manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all package manifests so pnpm can resolve the workspace
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# Install all dependencies (including dev for build + prisma CLI)
RUN pnpm install --frozen-lockfile

# ============================================================
# Stage 2 — Build
# ============================================================
FROM node:20-alpine AS build

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy installed node_modules and source from deps stage
COPY --from=deps /app ./

# Copy full source code
COPY . .

# Build workspace deps the API imports at compile time (@horae/shared-types
# → dist/, used by the raw-material allergen DTOs) BEFORE the API itself — a
# clean image has no pre-built dist, so skipping this breaks module resolution.
RUN pnpm --filter @horae/shared-types build

# Generate Prisma client + Build the API
RUN cd apps/api && pnpm exec prisma generate --schema=src/prisma/schema.prisma
RUN pnpm --filter api build

# ============================================================
# Stage 3 — Production image
# ============================================================
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# PostgreSQL client tools (pg_dump/pg_restore) for the backup module —
# major version must match the postgres:16 server image.
RUN apk add --no-cache postgresql16-client

WORKDIR /app

# Copy workspace manifests + package manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# Install all deps (need prisma CLI for db push, @prisma/client for runtime)
RUN pnpm install --frozen-lockfile

# Copy Prisma schema, migrations, and seed; generate client
COPY --from=build /app/apps/api/src/prisma ./apps/api/src/prisma
RUN cd apps/api && pnpm exec prisma generate --schema=src/prisma/schema.prisma

# Copy built output
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Copy shared packages (runtime artifacts)
COPY --from=build /app/packages/shared-types ./packages/shared-types

ENV NODE_ENV=production

# Backup volume mount point must be writable by the runtime user — a named
# volume initialized from this dir inherits the ownership.
RUN mkdir -p /app/backups && chown node:node /app/backups

# Run as non-root user
USER node

EXPOSE 3000

CMD ["node", "apps/api/dist/main.js"]
