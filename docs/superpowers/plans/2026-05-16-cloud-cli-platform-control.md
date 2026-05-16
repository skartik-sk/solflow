# Cloud CLI Platform Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add terminal control and self-host setup for SolStudio Cloud without splitting the public CLI into a second required binary.

**Architecture:** Keep `@solstudio/cli` as the install surface and add a `solstudio cloud` namespace. Hosted and self-hosted Cloud instances expose a bearer-token JSON API under `/api/cli/v1`, while browser sessions can mint one-time-visible CLI tokens through `/api/cli/token`.

**Tech Stack:** Commander, Bun/Node fetch, Next.js route handlers, Prisma, existing Cloud workflow/credential/execution packages.

---

### Task 1: CLI Profile And API Client

**Files:**
- Create: `packages/cli/src/utils/cloud-config.ts`
- Create: `packages/cli/src/utils/cloud-client.ts`
- Test: `packages/cli/src/__tests__/cloud-config.test.ts`
- Test: `packages/cli/src/__tests__/cloud-client.test.ts`

- [x] Write tests for endpoint normalization, global Cloud profile storage, token redaction, bearer headers, JSON payloads, and API error messages.
- [x] Implement profile storage at `~/.solstudio/cloud.json`, keeping it separate from project-local `.solstudio/`.
- [x] Implement `CloudClient` for `/api/cli/v1` requests.
- [x] Verify with `bun run --cwd packages/cli test` and `bun run --cwd packages/cli typecheck`.

### Task 2: `solstudio cloud` Namespace

**Files:**
- Create: `packages/cli/src/commands/cloud.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/src/__tests__/cloud-command.test.ts`

- [x] Add `cloud login/logout/whoami/status`.
- [x] Add `cloud profile list/use`.
- [x] Add `cloud profile set` to retarget an existing profile to a hosted or self-hosted URL/IP.
- [x] Add workflow, execution, credential, node, self-host, and agent subcommands.
- [x] Register the command in the main CLI entrypoint.

### Task 3: Cloud CLI API

**Files:**
- Create: `apps/cloud/src/server/cli-api/tokens.ts`
- Create: `apps/cloud/src/server/cli-api/auth.ts`
- Create: `apps/cloud/src/server/cli-api/handlers.ts`
- Create: `apps/cloud/src/app/api/cli/v1/[...segments]/route.ts`
- Create: `apps/cloud/src/app/api/cli/token/route.ts`
- Modify: `apps/cloud/src/server/trpc/routers/credential.ts`
- Test: `apps/cloud/src/server/cli-api-tokens.test.ts`

- [x] Generate `sst_...` CLI tokens and store SHA-256 hashes in the existing `ApiKey` table.
- [x] Authenticate `/api/cli/v1` with bearer tokens.
- [x] Expose workflow list/get/create/update/delete/activate/deactivate/run.
- [x] Expose execution list/get, credential list/create/update/delete, and node registry listing.
- [x] Verify with `bun run --cwd apps/cloud test` and `bun run --cwd apps/cloud typecheck`.

### Task 4: Self-Host And Agent Docs

**Files:**
- Create: `packages/cli/src/utils/cloud-self-host.ts`
- Test: `packages/cli/src/__tests__/cloud-self-host.test.ts`
- Modify: `packages/cli/README.md`
- Modify: `apps/web/src/app/docs/cli.md`
- Create: `llms.txt`

- [x] Generate Cloud-only `docker-compose.yml`, `.env.example`, and README.
- [x] Add `self-host deploy/check/status/logs` so a VPS can bootstrap, validate envs, run Docker Compose, and inspect the stack from one CLI surface.
- [x] Document hosted login, self-host login, workflow commands, credential commands, and agent usage.
- [x] Add a root `llms.txt` that tells agents which commands to use and where secrets belong.
