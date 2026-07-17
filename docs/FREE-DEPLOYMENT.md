# Free-tier deployment (no VM)

Goal: run **web + cloud** for **$0/month**, no always-on VM, no Docker compiler.

## Architecture (what was built)

```
WEB (editor)     → Vercel Hobby (free Next.js)
                   - Anchor compile    → solpg.io API (free)
                   - Pinocchio/Quasar  → GitHub Actions on-demand (free)
                   - Deploy            → browser web3.js (already)
                   - DB                → Neon free (sleeps — no always-on worker)

CLOUD (autom.)   → Vercel Hobby (free Next.js)
                   - Execution         → runs INLINE in Vercel functions via
                                         queueExecution() serverless mode
                                         (no always-on worker, scales to zero)
                   - Cron triggers     → Upstash QStash schedules → /api/cron/fire
                   - Webhook triggers  → /api/webhook/[path] (already request-driven)
                   - Queue/Redis       → Upstash Redis (BullMQ over Upstash)
                   - DB                → Neon free
```

No Lambda required for the common case (workflows < ~300s). If you later have
workflows longer than Vercel's function cap, move execution to a Lambda — the
`executeWorkflow` logic is unchanged.

## Build status (verified on branch test/solpg-pinocchio-quasar)
- Web:  `tsc --noEmit` 0 errors · `next build` passes
- Cloud: `tsc --noEmit` 0 errors · `turbo build --filter=@solflow/cloud...` passes

## Phase 1 — WEB app (code complete + builds)

Env vars (Vercel):
```
DATABASE_URL=            # Neon
AUTH_SECRET=             # openssl rand -base64 32
AUTH_URL=https://<web-domain>
AUTH_TRUST_HOST=true
ENCRYPTION_MASTER_KEY=   # openssl rand -base64 32
GITHUB_TOKEN=            # fine-grained PAT: Contents r/w + Actions read on the compiler repo
GITHUB_COMPILER_OWNER=   # e.g. skartik-sk
GITHUB_COMPILER_REPO=    # e.g. solflow-gh-compiler
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```
Compiler repo: push `gh-actions-compiler/` contents to a repo (e.g. `solflow-gh-compiler`).
Deploy: `cd apps/web && vercel --prod`

## Phase 2 — CLOUD app (code complete + builds)

Env vars (Vercel):
```
CLOUD_RUNTIME_MODE=api          # CRITICAL — no embedded workers (serverless)
DATABASE_URL=                   # Neon (same DB is fine)
AUTH_SECRET / AUTH_URL / AUTH_TRUST_HOST / AUTH_COOKIE_DOMAIN
ENCRYPTION_MASTER_KEY=
REDIS_URL=                      # Upstash Redis (rediss://...)
QSTASH_TOKEN=                   # Upstash QStash token (for cron schedules)
CLOUD_PUBLIC_BASE_URL=https://<cloud-domain>   # QStash posts back here
CRON_SECRET=                    # random string; QStash forwards as x-cron-secret
DEVNET_RPC_URL / MAINNET_RPC_URL / LOCALNET_RPC_URL
NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_WEB_URL / NEXT_PUBLIC_CLOUD_URL
```
Deploy: `cd apps/cloud && vercel --prod`

Cron setup: when a user activates a workflow cron trigger, the trigger-manager
creates a QStash schedule (configured automatically when QSTASH_TOKEN +
CLOUD_PUBLIC_BASE_URL are set). No always-on cron worker.

## Cost: $0/month at low volume
Free-tier limits to watch:
- Neon 100 CU-hrs/mo · GH Actions 2000 min/mo (private) / unlimited (public)
- Upstash Redis 10k cmd/day · QStash 500 msg/day
- Vercel Hobby function 300s max · bandwidth/CPU generous at low traffic
