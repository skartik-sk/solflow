# =============================================================================
# SolFlow — Production Dockerfile
# Builds the Next.js app + custom server for VPS deployment.
# =============================================================================

FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g bun
WORKDIR /app

# ─── Stage 1: Install dependencies ────────────────────────────────────────────
FROM base AS deps
COPY package.json bun.lock* package-lock.json* yarn.lock* ./
COPY packages/ir/package.json ./packages/ir/package.json
COPY packages/codegen/package.json ./packages/codegen/package.json
COPY packages/sdk-gen/package.json ./packages/sdk-gen/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/flow-nodes/package.json ./packages/flow-nodes/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/audit/package.json ./packages/audit/package.json
COPY packages/versioning/package.json ./packages/versioning/package.json
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/solana-utils/package.json ./packages/solana-utils/package.json
COPY packages/anchor-templates/package.json ./packages/anchor-templates/package.json
COPY packages/pinocchio-templates/package.json ./packages/pinocchio-templates/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY plugins/plugin-pyth/package.json ./plugins/plugin-pyth/package.json
COPY plugins/plugin-metaplex/package.json ./plugins/plugin-metaplex/package.json
COPY plugins/plugin-spl-token/package.json ./plugins/plugin-spl-token/package.json

# Install with bun (matches local dev environment)
RUN bun install --frozen-lockfile 2>&1 | tail -5

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .

# Generate Prisma client from the db workspace so Bun resolves the local prisma binary correctly
RUN bun run --cwd packages/db db:generate

# Build all workspace packages first, then the web app
RUN npx turbo build --filter=@solflow/web

# Compile custom server.ts for production using the app workspace's local TypeScript binary
RUN ./apps/web/node_modules/.bin/tsc --project apps/web/tsconfig.server.json

# ─── Stage 3: Production image ────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/dist-server ./apps/web/dist-server
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/server.ts ./apps/web/server.ts

# Copy node_modules (production only)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/packages ./packages

# Copy root package files
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["node", "dist-server/server.js"]
