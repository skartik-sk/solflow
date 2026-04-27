# =============================================================================
# SolFlow — Production Dockerfile
# Builds the Next.js app + custom server for VPS deployment.
# =============================================================================

FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g bun@1.3.10
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
COPY packages/cloud-defi/package.json ./packages/cloud-defi/package.json
COPY packages/cloud-engine/package.json ./packages/cloud-engine/package.json
COPY packages/cloud-nodes/package.json ./packages/cloud-nodes/package.json
COPY packages/cloud-wallet/package.json ./packages/cloud-wallet/package.json
COPY packages/versioning/package.json ./packages/versioning/package.json
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/package.json
COPY packages/tsconfig/package.json ./packages/tsconfig/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/solana-utils/package.json ./packages/solana-utils/package.json
COPY packages/anchor-templates/package.json ./packages/anchor-templates/package.json
COPY packages/pinocchio-templates/package.json ./packages/pinocchio-templates/package.json
COPY packages/idl-import/package.json ./packages/idl-import/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/rust-parser/package.json ./packages/rust-parser/package.json
COPY apps/cloud/package.json ./apps/cloud/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/standalone/package.json ./apps/standalone/package.json
COPY plugins/plugin-pyth/package.json ./plugins/plugin-pyth/package.json
COPY plugins/plugin-metaplex/package.json ./plugins/plugin-metaplex/package.json
COPY plugins/plugin-spl-token/package.json ./plugins/plugin-spl-token/package.json

# Install with bun (matches local dev environment).
# Keep the full command status visible so dependency install failures stop the image build.
RUN bun install --frozen-lockfile

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM deps AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ENV TURBO_TELEMETRY_DISABLED=1
COPY . .

# Generate Prisma client from the db workspace so Bun resolves the local prisma binary correctly
RUN bun run --cwd packages/db db:generate
# Build all workspace packages needed by the production web and cloud apps
RUN ./node_modules/.bin/turbo build --filter=@solflow/web --filter=@solflow/cloud

# Compile custom server.ts entrypoints for production
RUN ./apps/web/node_modules/.bin/tsc --project apps/web/tsconfig.server.json
RUN ./apps/cloud/node_modules/.bin/tsc --project apps/cloud/tsconfig.server.json

# ─── Stage 3: Production image ────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# The web app can use the local compiler path for Pinocchio/Quasar builds.
# That path shells out to `docker exec solflow-compiler`, so the web runner
# needs the Docker CLI when the host Docker socket is mounted by compose.
RUN apt-get update && apt-get install -y --no-install-recommends docker.io && rm -rf /var/lib/apt/lists/*

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

# ─── Stage 4: Cloud production image ──────────────────────────────────────────
FROM base AS cloud-runner
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/cloud/.next ./apps/cloud/.next
COPY --from=builder --chown=nextjs:nodejs /app/apps/cloud/dist-server ./apps/cloud/dist-server
COPY --from=builder --chown=nextjs:nodejs /app/apps/cloud/public ./apps/cloud/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/cloud/package.json ./apps/cloud/package.json
COPY --from=builder --chown=nextjs:nodejs /app/apps/cloud/next.config.ts ./apps/cloud/next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/apps/cloud/server.ts ./apps/cloud/server.ts

COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/cloud/node_modules ./apps/cloud/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/packages ./packages
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

WORKDIR /app/apps/cloud

USER nextjs

EXPOSE 3001

CMD ["node", "dist-server/server.js"]
