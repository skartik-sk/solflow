# SolStudio Project Index

Last indexed: 2026-04-26

Read this file first in future sessions before re-scanning the repo. It summarizes the current product architecture, important paths, known blockers, and the reference repos to use for deeper framework work. For the detailed production bug backlog and implementation queue, read `docs/PRODUCTION_BUG_BACKLOG.md`.

## Product Positioning

SolStudio currently has three products sharing one monorepo, one auth package, and one Prisma database.

1. **SolStudio IDE** (`apps/web`, target `solstudio.fun`)
   - Visual Solana program builder.
   - Users build Anchor, Pinocchio, and Quasar programs with React Flow nodes.
   - Core flows: dashboard, editor, marketplace, docs, compile, deploy, audit, SDK generation.

2. **SolStudio CLI / Local Visualizer** (`packages/cli` + `apps/standalone`)
   - Local dev tool: `solstudio view <path>`.
   - Runs an Express/WebSocket server, serves the static standalone editor, parses local Rust projects, watches files, and can compile/test/deploy locally.
   - Intended promise: any local Anchor/Pinocchio/Quasar codebase should become a visual graph without corrupting source files.

3. **SolStudio Cloud** (`apps/cloud`, target `cloud.solstudio.fun`)
   - Solana-native workflow automation for DeFi/operators, like n8n but focused on wallets, swaps, token ops, webhooks, cron, AI agents, and execution history.
   - Correct product architecture: separate app and landing, shared `@solflow/auth`, shared `@solflow/db`, same `User` table.

Recommended domains:

```txt
solstudio.fun          -> IDE / program builder
cloud.solstudio.fun    -> workflow automation platform
```

Use one account across both. For true subdomain SSO in production, configure same `DATABASE_URL`, same `AUTH_SECRET`, same auth providers, and session cookies for `.solstudio.fun`.

## Important Paths

```txt
apps/web/                 Web IDE product
apps/standalone/          Static local editor used by CLI
apps/cloud/               Cloud workflow product
packages/cli/             solstudio CLI and local server
packages/auth/            Shared NextAuth/Auth.js config
packages/db/prisma/       User, Project, Workflow, wallet, marketplace schema
packages/ir/              Canonical visual-program IR
packages/flow-nodes/      Web IDE React Flow node types
packages/rust-parser/     Rust -> visual graph parser
packages/codegen/         IR -> Anchor/Pinocchio/Quasar codegen
packages/audit/           Program audit rules
packages/plugin-sdk/      Visual builder plugin model
plugins/                  SPL Token, Metaplex, Pyth plugin drafts
packages/cloud-nodes/     Cloud workflow node definitions
packages/cloud-engine/    Cloud DAG/expression executor
packages/cloud-wallet/    Encrypted cloud wallet signing layer
packages/cloud-defi/      Birdeye/Jupiter adapters
doc-ref/                  Older architecture docs
docs/superpowers/         Cloud design/implementation plan
```

## Core Pipelines

### IDE Program Builder

```txt
React Flow nodes
  -> packages/ir flowToIR()
  -> packages/codegen generateCode(ir, framework)
  -> compile/deploy/audit routers in apps/web
```

Supported visual node families: program, instruction, account, state, constraint, error, event, logic, custom-code, integration.

### CLI Local Visualizer

```txt
solstudio view
  -> packages/cli server
  -> packages/rust-parser parseProgram()
  -> .solstudio/project.json
  -> apps/standalone visual editor
  -> optional codegen/sync/compile/test/deploy APIs
```

The CLI tests pass when localhost binding is allowed, but typecheck currently fails. See blockers below.

### Cloud Workflow

```txt
React Flow cloud nodes
  -> Workflow.definition JSON in DB
  -> BullMQ execution queue
  -> packages/cloud-engine DAG executor
  -> cloud node execute() handlers
  -> WorkflowExecution + NodeExecution rows
```

Current node set includes manual/cron/webhook triggers, price fetch, Jupiter swap, token transfer, filter, if/else, wait, AI agent, webhook output.

## Verification Snapshot

Commands run on 2026-04-26:

```txt
bun run typecheck
  FAIL: packages/rust-parser has 3 TS errors.

apps/web: bun run typecheck
  PASS

apps/cloud: bun run typecheck
  PASS

packages/cloud-engine: bun run test
  PASS, 17 tests

packages/cloud-nodes: bun run test
  PASS, 180 tests

packages/rust-parser: bun run test
  PASS, 128 tests

packages/codegen: bun run test
  PASS, 419 tests

packages/cli: bun run test
  PASS, 117 tests, requires localhost binding outside sandbox

packages/cli: bun run typecheck
  FAIL: CLI BigInt target issue + rust-parser type errors
```

Known typecheck blockers:

```txt
packages/rust-parser/src/converters/to-flow.ts:271
  LogicOperation[] | undefined assigned to LogicOperation[]

packages/rust-parser/src/parsers/logic-parser.ts:431
  string[] | null used as iterable

packages/rust-parser/src/parsers/program-parser.ts:314
  "AccountInfo" not assignable to SolanaType

packages/cli/src/server/index.ts:842,846,847
  BigInt literals require tsconfig target ES2020+
```

## High Priority Mistakes / Fix Queue

1. **Fix typecheck first.**
   - Rust parser and CLI type errors are the first real engineering blocker.
   - Tests passing is good, but the project should not ship with `bun run typecheck` failing.

2. **Cloud auth is conceptually right but incomplete in tracked files.**
   - `apps/cloud` uses `@solflow/auth` in tRPC context, but currently lacks its own tracked `/api/auth/[...nextauth]` route, sign-in page, and middleware.
   - Add Cloud auth route or explicit redirect SSO flow, then protect `/dashboard`, `/workflows`, `/editor`, `/wallets`, `/executions`, and `/api/trpc`.

3. **Cloud execution still has mocks.**
   - `apps/cloud/src/server/execution-worker/queue.ts` uses mock wallet operations.
   - `packages/cloud-nodes/src/nodes/action-jupiter-swap.tsx` returns a mock swap result.
   - Wire `WalletSigner`, `JupiterAdapter`, `BirdeyeAdapter`, transaction signing, audit logs, and rate limits before calling it a real automation product.

4. **Cloud worker lifecycle needs production wiring.**
   - `restoreActiveTriggers()` exists but is not called from `apps/cloud/server.ts`.
   - Start execution worker/cron worker intentionally, restore active workflows on boot, and close workers on shutdown.

5. **Web IDE plugin system is not fully connected.**
   - Plugin packages exist, but no runtime registration was found for SPL Token, Metaplex, or Pyth.
   - `NodePalette` can list enabled plugin nodes only if registry has plugins.
   - `FlowCanvas` only passes built-in `nodeTypes`, so plugin node types will not render correctly yet.
   - `flowToIR()` only collects nodes with type `"integration"`, but plugin nodes are namespaced like `spl-token:create-mint`; their `toIR()` hooks are not used.

6. **Program/deployer keypairs are stored plaintext in DB.**
   - `Project.programKeypair` and `User.deployerKeypair` are bs58 encoded secret keys.
   - Cloud wallets use encryption; the IDE deployer/program keys should be moved to the same encrypted pattern before serious production use.

7. **Parser strategy should become more AST-backed.**
   - Current parser is regex/balanced-block based with good tests, but full Anchor/Pinocchio/Quasar coverage will be hard with regex only.
   - Use Quasar's local `../quasar/idl/src/parser/*` as a model for `syn`-style parsing and account graph linting.

8. **Generated CLI static assets need hygiene.**
   - `packages/cli/static/_next/static/...` has multiple build hashes committed.
   - Decide whether static build artifacts are release artifacts or generated files; avoid accumulating stale Next build outputs.

## Reference Repos To Use

Local sibling references found:

```txt
../n8n
../anchor
../pinocchio
../quasar
```

Use them like this:

- `../n8n`
  - Study `packages/workflow/src/interfaces.ts` for mature node/property/credential models.
  - Study `packages/core/src/execution-engine/workflow-execute.ts` for execution stack, cancellation, partial execution, run data, and error handling.
  - Study `packages/core/src/nodes-loader/*` for plugin/node discovery and lazy loading.
  - Study `packages/nodes-base/nodes/Webhook/*` for webhook auth, response mode, and response-node design.

- `../anchor`
  - Use `lang/src/lib.rs`, `spl/src/*`, and `tests/*` as canonical Anchor syntax coverage.
  - Important parser cases: `#[program]`, `#[derive(Accounts)]`, `#[account(...)]`, SPL constraints, events, errors, custom discriminators, optional accounts, realloc, close, seeds, remaining accounts.

- `../pinocchio`
  - Use `README.md`, `sdk/src/entrypoint/*`, and `programs/*` for Pinocchio patterns.
  - Important parser cases: `entrypoint!`, `program_entrypoint!`, `lazy_program_entrypoint!`, manual account parsing, discriminator match arms, no-alloc/no-std code.

- `../quasar`
  - Use `idl/src/parser/*` for AST-backed parsing.
  - Use `idl/src/lint/*` for graph-based account validation ideas.
  - Use `tests/programs/*` and `tests/suite/*` for Quasar syntax cases: `Ctx<T>`, `CtxWithRemaining<T>`, `#[instruction(discriminator = N)]`, `Account<T>`, `Signer`, optional/dynamic accounts, zero-copy state.

## Roadmap For Next Work

P0:

- Fix rust-parser and CLI typecheck.
- Add Cloud auth route/middleware/sign-in or redirect SSO.
- Wire Cloud execution to real wallets/adapters instead of mocks.
- Register visual-builder plugins and convert plugin nodes into IR/codegen.

P1:

- Expand Cloud expression engine beyond `$json.field`; add `$input[n]`, `$now`, typed values, arrays, and safe expression errors.
- Add trigger restoration and worker shutdown in Cloud server.
- Add encrypted storage for IDE deployer/program keys.
- Keep expanding the parser fixture matrix from `../anchor`, `../pinocchio`,
  `../quasar`, and the real `anchor-contract`/`pinocchio-contract` projects.

P2:

- Add n8n-style credential abstraction for Cloud nodes.
- Add plugin marketplace/versioning/security policy.
- Add transaction-level generated tests on top of the current real compile smoke
  runner; CLI project tests should use Surfpool simnet setup, not
  `solana-test-validator`.

Current readiness:

```txt
IDE: usable but security/key storage and plugin integration need work.
CLI: framework-aware compile/test commands are in place; parser breadth and
framework-native test fixtures remain the main risk.
Cloud: scaffold is good, but not production-ready until auth, workers, wallet signing, and real DeFi adapters are wired.
Mainnet-ready: no.
```
