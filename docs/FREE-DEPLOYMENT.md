# Free-tier deployment (no VM)

Same app, same features, same auth, same schema/data — only WHERE it runs changes
(paid VM → free Vercel + GitHub Actions + Neon + Upstash). Build-verified:
both apps pass `next build` (Vercel's build path) and `tsc --noEmit` = 0 errors.

## Architecture
```
WEB (editor)    → Vercel Hobby. Anchor→solpg API; Pinocchio/Quasar→GitHub Actions.
CLOUD (autom.)  → Vercel Hobby. Execution inline (serverless); cron→QStash; Redis→Upstash.
Compiler repo   → github.com/<owner>/solflow-gh-compiler (separate, tiny; proven working).
DB              → Neon (same schema you already have, just a new empty database).
```

## WEB env vars (real names, from `apps/web/src` + `packages/auth`)

Required:
```
DATABASE_URL=                    # Neon (read by Prisma)
AUTH_SECRET=                     # openssl rand -base64 32
AUTH_URL=https://<web-domain>
AUTH_TRUST_HOST=true
AUTH_GITHUB_ID=  AUTH_GITHUB_SECRET=      # your existing GitHub OAuth (unchanged)
AUTH_GOOGLE_ID=  AUTH_GOOGLE_SECRET=      # your existing Google OAuth (unchanged)
AUTH_COOKIE_DOMAIN=.yourdomain.com         # only if sharing login across subdomains
ENCRYPTION_MASTER_KEY=           # openssl rand -base64 32
REDIS_URL=                       # Upstash Redis (rate-limit + compile queue)
GITHUB_TOKEN=                    # fine-grained PAT: Contents R/W + Actions read on solflow-gh-compiler
GITHUB_COMPILER_OWNER=skartik-sk
GITHUB_COMPILER_REPO=solflow-gh-compiler
DEVNET_RPC_URL=  MAINNET_RPC_URL=
NEXT_PUBLIC_APP_URL=https://<web-domain>
NEXT_PUBLIC_CLOUD_URL=https://<cloud-domain>
NEXT_PUBLIC_SOLANA_RPC_URL=
```
Optional (have defaults / features off):
```
GEMINI_API_KEY=  GEMINI_MODEL=             # AI assistant (works without)
CLOUD_BUILD_URL=                          # solpg build API (default https://api.solpg.io)
SOLFLOW_TREASURY_WALLET=  NEXT_PUBLIC_SOLFLOW_TREASURY_WALLET=
NEXT_PUBLIC_SENTRY_DSN=  NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT=
AXIOM_TOKEN=  AXIOM_DATASET=  AUDIT_API_KEY=  AUDIT_API_URL=
```

## CLOUD env vars (real names, from `apps/cloud/src`)

Required:
```
CLOUD_RUNTIME_MODE=api           # CRITICAL — serverless, no embedded workers
DATABASE_URL=                    # Neon (same DB as web is fine)
REDIS_URL=                       # Upstash Redis
QSTASH_TOKEN=                    # Upstash QStash
CLOUD_PUBLIC_BASE_URL=https://<cloud-domain>   # set after first deploy, then redeploy
CRON_SECRET=                     # openssl rand -base64 32 (QStash sends as x-cron-secret)
ENCRYPTION_MASTER_KEY=
AUTH_SECRET=  AUTH_URL=  AUTH_TRUST_HOST=  AUTH_COOKIE_DOMAIN=
AUTH_GITHUB_ID=  AUTH_GITHUB_SECRET=  AUTH_GOOGLE_ID=  AUTH_GOOGLE_SECRET=
DEVNET_RPC_URL=  MAINNET_RPC_URL=  LOCALNET_RPC_URL=
NEXT_PUBLIC_SOLANA_RPC_URL=
NEXT_PUBLIC_CLOUD_URL=  NEXT_PUBLIC_WEB_URL=  NEXT_PUBLIC_STUDIO_URL=
```
Optional:
```
GEMINI_API_KEY=  GEMINI_MODEL=
CLOUD_QUOTA_ENFORCEMENT=  CLOUD_FREE_ACTIVE_WORKFLOWS=  CLOUD_TRIAL_DAYS=
CLOUD_WEBHOOK_MAX_BODY_KB=  CLOUD_WEBHOOK_REPLAY_STORE=  CLOUD_HEALTH_DETAILS_TOKEN=
```

## Steps to go live (all your account actions)
1. **Neon** → `DATABASE_URL`, then create the same tables once:
   `DATABASE_URL="..." bun run --cwd packages/db prisma db push`
2. **Upstash Redis** → `REDIS_URL`  ·  **Upstash QStash** → `QSTASH_TOKEN`
3. **GitHub PAT** (fine-grained, `solflow-gh-compiler`, Contents R/W + Actions Read) → web's `GITHUB_TOKEN`
4. `cd apps/web && vercel --prod` (+ web env vars)
5. `cd apps/cloud && vercel --prod` (+ cloud env vars; set `CLOUD_PUBLIC_BASE_URL` to the URL Vercel gives you, then redeploy)

## Notes
- `transpilePackages` is set in both `next.config.ts` → Vercel resolves all `@solflow/*` workspace packages.
- The custom `server.ts` is NOT used on Vercel (Vercel runs Next.js natively). WebSocket log streaming becomes a no-op; compile logs return in the API response instead.
- Cost $0/mo at low volume. Limits: Neon 100 CU-hrs, GH Actions 2000 min (private)/unlimited (public), Upstash Redis 10k cmd/day, QStash 500 msg/day.
