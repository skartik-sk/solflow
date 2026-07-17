# Free-tier deployment (no VM)

Goal: run **web + cloud** frontends for **$0/month**, no always-on VM, no Docker compiler.

## Architecture

```
Web (editor)    → Vercel Hobby (free)
                  - Anchor compile   → solpg.io API (free)
                  - Pinocchio/Quasar → GitHub Actions on-demand (free)
                  - Deploy           → browser web3.js (already)
                  - DB               → Neon free (sleeps, no always-on worker)

Cloud (autom.)  → Vercel Hobby (free)
                  - Execution worker → AWS Lambda (free 1M req/mo)
                  - Cron/webhook     → Upstash QStash (free 500 msg/day)
                  - Redis            → Upstash Redis (free 10k cmd/day)
                  - DB               → Neon free
```

## Phase 1 — Web app (READY)

### Env vars for Vercel (web)
```
DATABASE_URL=            # Neon connection string
AUTH_SECRET=             # openssl rand -base64 32
AUTH_URL=https://<your-web-domain>
AUTH_TRUST_HOST=true
ENCRYPTION_MASTER_KEY=   # openssl rand -base64 32
# GitHub Actions compiler (Pinocchio/Quasar):
GITHUB_TOKEN=            # fine-grained PAT: Contents r/w + Actions read on the compiler repo
GITHUB_COMPILER_OWNER=   # e.g. skartik-sk
GITHUB_COMPILER_REPO=    # e.g. solflow-gh-compiler
# Public:
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet
```

### The compiler repo (GitHub Actions)
The workflow lives in `gh-actions-compiler/.github/workflows/compile.yml`. Create a repo
(e.g. `solflow-gh-compiler`) and push that folder's contents. The web app commits source
to `programs/program/`, the push triggers the workflow, the runner polls + downloads the `.so`.

### Deploy web to Vercel
```bash
cd apps/web
vercel link          # link/create the project (your account)
vercel env add ...   # add the vars above
vercel --prod
```

## Phase 2 — Cloud app (next)

Execution worker → AWS Lambda (extract `executeWorkflow` from
`apps/cloud/src/server/execution-worker/queue.ts` into a Lambda handler).
Triggers → Upstash QStash. Redis → Upstash Redis. Then `cd apps/cloud && vercel --prod`.

## Cost
$0/month at low volume. Free-tier limits to watch:
- Neon 100 CU-hrs/mo · GH Actions 2000 min/mo (private) / unlimited (public)
- Lambda 1M req + 400k GB-sec/mo · Upstash Redis 10k cmd/day · QStash 500 msg/day
