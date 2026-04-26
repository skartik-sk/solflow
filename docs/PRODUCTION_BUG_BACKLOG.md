# SolStudio Production Bug Backlog

Last updated: 2026-04-27

This file is the working production backlog for the full SolStudio project. Use
`docs/PROJECT_INDEX.md` for the short project map, and use this file for the
actual bugs, incomplete features, and production-readiness work.

## Product Target

SolStudio currently has three product surfaces:

1. **Visual program builder / IDE** in `apps/web`.
   Users design Solana programs visually, generate Rust for Anchor, Pinocchio,
   and Quasar, test, compile, deploy, and optionally publish/fork templates.

2. **CLI visualizer** in `packages/cli` plus the bundled UI in
   `apps/standalone`.
   Users point the CLI at any local Solana project and see/edit a visual graph
   without losing framework-specific meaning.

3. **Cloud workflow product** in `apps/cloud`, `packages/cloud-engine`,
   `packages/cloud-nodes`, and `packages/cloud-wallet`.
   DeFi builders create automated workflows, triggers, wallet actions, swaps,
   webhooks, and monitoring flows.

The correct platform direction is: **shared auth and DB, separate product
surfaces**. Keep one `User` identity across IDE and Cloud, but treat
`solstudio.fun`, `cloud.solstudio.fun`, and future product routes/domains as
separate apps with their own landing, navigation, and onboarding. For subdomain
SSO, Auth.js cookies must be configured for `.solstudio.fun`; for totally
different root domains, use an explicit login redirect/session handoff flow.

## Severity

- **P0**: blocks production or can create user/data/security failures.
- **P1**: core product promise incomplete or misleading.
- **P2**: important quality, maintainability, or scale issue.
- **P3**: polish or future expansion.

## P0 - Cross-Product Production Blockers

### P0.1 Root typecheck is failing

**Where**

- `packages/rust-parser/src/converters/to-flow.ts`
- `packages/rust-parser/src/parsers/logic-parser.ts`
- `packages/rust-parser/src/parsers/program-parser.ts`
- `packages/cli/src/server/index.ts`

**Observed**

- Root `bun run typecheck` fails in `rust-parser`.
- CLI typecheck also fails because `server/index.ts` uses BigInt literals while
  the CLI TypeScript target is below ES2020.

**Why it matters**

The CLI and parser can pass tests but still fail monorepo typecheck. This blocks
safe production releases and makes package consumers trust code that the compiler
does not accept.

**Fix**

- Normalize `LogicOperation[] | undefined` before assigning nested bodies.
- Handle nullable regex captures before iterating.
- Decide how parsed `AccountInfo` maps into IR: either add a supported IR type
  or map it to an account classification such as `unchecked-account`.
- Move CLI `tsconfig` target to ES2020 or rewrite the local base58 BigInt code.

**Done when**

- Root `bun run typecheck` passes.
- `packages/cli` typecheck passes without relying on skipped parser errors.

### P0.2 Web IDE stores deploy/program secret keys in plaintext DB fields

**Where**

- `packages/db/prisma/schema.prisma`
- `User.deployerKeypair`
- `Project.programKeypair`
- `Deployment.programKeypair`
- `apps/web/src/server/trpc/routers/project.ts`
- `apps/web/src/server/trpc/routers/deploy.ts`

**Observed**

The web product persists deployer and program keypairs as bs58 secret-key
strings. The Cloud product already has encrypted key storage in
`packages/cloud-wallet`, but the IDE deploy path does not use it.

**Why it matters**

Plaintext signing keys in the DB are a production security blocker. A DB leak
would become direct wallet/program compromise.

**Fix**

- Reuse or generalize `packages/cloud-wallet` encryption for IDE keys.
- Move secret material into encrypted fields with IV/tag/salt.
- Add migration path for existing plaintext rows.
- Avoid returning secret keys through tRPC responses.
- Add key-rotation and deletion behavior.

**Done when**

- No Prisma model stores raw private keys.
- Deploy code only receives decrypted key material inside server-only signing
  code.
- Security audit docs and tests prove secret fields are not exposed.

### P0.3 Shared auth is only partly wired for Cloud

**Where**

- `packages/auth/src/config.ts`
- `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- `apps/web/src/middleware.ts`
- `apps/cloud/src/server/trpc/trpc.ts`
- `apps/cloud/src/lib/trpc/server.ts`

**Observed**

Cloud tRPC uses shared `auth()`, but Cloud does not currently have the same
visible auth plumbing as web: no tracked Cloud Auth.js route, sign-in page, or
middleware protecting `/dashboard`, `/editor`, `/wallets`, and tRPC.

**Why it matters**

The desired same-user platform strategy is correct, but Cloud needs a complete
auth entry and route protection layer. Otherwise users can hit protected pages
without a predictable sign-in flow, and cross-subdomain login can fail.

**Fix**

- Add Cloud auth route that exports shared `handlers`.
- Add Cloud middleware matching protected Cloud routes.
- Add Cloud sign-in/error pages or redirect Cloud auth failures to the main web
  sign-in with callback URL.
- Configure Auth.js cookies for `.solstudio.fun` when shipping subdomains.
- Document env vars for local, preview, and production domains.

**Done when**

- Signing in once on `solstudio.fun` works for `cloud.solstudio.fun`.
- Protected Cloud pages redirect cleanly when logged out.
- tRPC returns `UNAUTHORIZED` only for API calls, not broken page loads.

## P0 - CLI And Parser Completeness

### P0.4 Framework detection is inconsistent and Quasar is mishandled

**Where**

- `packages/cli/src/utils/detect.ts`
- `packages/cli/src/server/index.ts`
- `packages/cli/src/commands/view.ts`
- `packages/cli/src/commands/init.ts`

**Observed**

- `utils/detect.ts` only returns `"anchor" | "pinocchio" | "unknown"`.
- It explicitly detects `quasar-lang` but returns `"unknown"`.
- `server/index.ts` has a separate local `detectProjectType` that supports more
  framework cases.
- `view.ts` initializes unknown projects as Anchor:
  `framework: projectType === "pinocchio" ? "pinocchio" : "anchor"`.

**Why it matters**

The CLI promise is "point at any local Solana project and visualize it." Right
now Quasar projects can be detected in one path and treated as unknown/Anchor in
another path. That can generate wrong config, wrong build commands, and wrong
parser/codegen behavior.

**Fix**

- Create one shared detector returning `"anchor" | "pinocchio" | "quasar" |
  "unknown"`.
- Use it everywhere: `init`, `view`, server API routes, watcher, build/deploy.
- Never default unknown to Anchor. Ask for framework, infer from files, or keep
  mode as read-only Rust visualization.
- Add fixture tests for Anchor workspace, single-crate Anchor, Pinocchio,
  Quasar, and unknown Rust crates.

**Done when**

- Same project path gives the same framework in all CLI commands.
- Quasar stays Quasar from detection through parse, build, sync, and deploy.

### P0.5 Parser is regex/balanced-block based and needs a production matrix

**Status**

First production pass is done: local Anchor/Pinocchio/Quasar fixtures exist,
optional adjacent-repo smoke tests are wired, and parse results now include a
report with framework, files parsed/skipped, unsupported constructs, and
confidence. Source coverage options now let CLI/parser users include tests,
examples, benches, migrations, and hidden folders explicitly. Remaining work is
broader fixture coverage, framework component taxonomy, and AST-backed fallback
research for hard syntax.

**Where**

- `packages/rust-parser/src`
- `packages/cli/src/commands/parse.ts`
- `packages/cli/src/server/index.ts`
- Reference repos: `../anchor`, `../pinocchio`, `../quasar`

**Observed**

The parser has good local tests, but production "parse any user project" needs
coverage across real framework styles:

- Anchor macros, modules, account constraints, events, errors, CPI, SPL helpers.
- Pinocchio `entrypoint!`, `program_entrypoint!`, lazy entrypoints, packed data,
  manual account parsing, and numeric discriminators.
- Quasar `quasar-lang`, Quasar IDL/parser patterns, and lint conventions.

**Why it matters**

Regex parsing can work for common examples but miss real user projects with
modules, cfg gates, macro wrappers, nested generics, aliases, or custom
instruction dispatch. The CLI must degrade honestly instead of inventing a wrong
graph.

**Fix**

- Build a parser fixture corpus from:
  - `../anchor/lang`, `../anchor/spl`, `../anchor/tests`
  - `../pinocchio/programs`, `../pinocchio/sdk/src/entrypoint`
  - `../quasar/idl/src/parser`, `../quasar/tests/programs`
- Add a parse result contract:
  - framework detected
  - program name and ID
  - instruction count and names
  - account structs and constraints
  - instruction args
  - state structs and events/errors
  - unsupported constructs captured as warnings, not dropped silently
- For hard Rust syntax, consider adding an AST-backed pass using a Rust-side
  parser or structured JSON extraction, then keep regex helpers as fallback.

**Done when**

- CLI can parse the fixture matrix without crashing. **First local matrix pass
  complete.**
- Unsupported constructs show explicit report entries in CLI and UI. **First
  report pass complete.**
- Flow export round-trips through `flowToIR()` for every supported fixture.

### P0.5A Framework component corpus is missing

**Where**

- Reference repos: `../anchor`, `../pinocchio`, `../quasar`, `../codama`,
  `../kit`
- `packages/rust-parser`
- `packages/codegen`
- `packages/sdk-gen`
- `apps/web` editor palette/properties
- CLI test runner and audit flows

**Observed**

SolStudio needs to understand each supported framework as a product surface,
not just as a codegen target. The editor, parser, SDK generator, test runner,
and audit tab all need a shared inventory of what each framework actually
offers: account wrappers, constraints, CPI helpers, PDA helpers, token helpers,
events/errors, IDL conventions, test workflow, and generated client patterns.

**Why it matters**

Without a corpus, support will stay patchy: parser fixtures may cover one style,
editor nodes another style, and codegen/test/audit may miss framework-specific
behavior. That breaks the promise of "visual builder + CLI visualizer for any
Solana project."

**Fix**

- Inspect `../anchor`, `../pinocchio`, and `../quasar` and write a framework
  component/support matrix.
- Inspect `../codama` for SDK generation conventions and type mappings.
- Inspect `../kit` for Solana Kit runtime/testing patterns.
- Convert the matrix into parser fixtures, editor node requirements, codegen
  tasks, SDK-gen tasks, test-runner workflows, and audit detector requirements.

**Done when**

- One checked-in support matrix drives parser, editor, codegen, SDK-gen, test,
  and audit backlog items for all three frameworks.

### P0.6 Parser/IR validation has real correctness bugs

**Status**

Partially fixed. Identifier validation and raw account type handling were fixed
earlier. Parser-only delegation/set-inner grouping now uses an internal
`parser-group` operation and is flattened before visual node creation, so real
`if-else` branches are no longer overloaded for delegation wrappers.

**Where**

- `packages/ir/src/schema.ts`
- `packages/rust-parser/src/parsers/program-parser.ts`
- `packages/rust-parser/src/parsers/logic-parser.ts`
- `packages/rust-parser/src/converters/to-flow.ts`

**Observed**

- `safePascalName` regex is not end-anchored. It accepts strings that merely
  start with PascalCase.
- `SolanaType` does not accept parsed `AccountInfo`, causing typecheck failure.
- Some parsed logic wraps sequential operations inside synthetic `if-else`
  groups. `to-flow` then has to flatten these, which risks confusing real branch
  logic with parser grouping.

**Why it matters**

Wrong IR validation or synthetic branch nodes can generate misleading visual
graphs and wrong code.

**Fix**

- Anchor `safePascalName` with `$`.
- Model raw account values explicitly: either IR account type, custom type, or
  parser warning.
- Replace synthetic `if-else` grouping with an explicit internal parser group
  type before conversion, so real branches stay distinct.

**Done when**

- Parser output never uses production IR branch types for parser-only grouping.
- Invalid identifiers fail validation.
- `AccountInfo` and unchecked account patterns are represented predictably.

### P0.7 CLI build/deploy/sync path is too framework-assumptive

**Status**

Partially improved. Framework detection and parse reporting now cover
Anchor/Pinocchio/Quasar consistently in the parser and CLI server. A first
framework-adapter boundary now owns compile/test command specs, watch roots,
key-sync strategy, deploy strategy, and unknown-framework refusal. Moving the
manual keypair/deploy internals fully inside adapters and adding include/exclude
scan flags remain.

**Where**

- `packages/cli/src/server/index.ts`

**Observed**

- Key sync guesses keypair paths from package/program names.
- Program ID replacement only rewrites `declare_id!("...")`.
- Build/deploy paths handle Anchor separately and group Pinocchio/Quasar
  together.
- Rust file scan skips `examples`, `tests`, and `benches` unconditionally.

**Why it matters**

For local dev, users often keep important program modules or examples outside
the simplest path. The CLI should understand project layout and not silently
miss source files or patch the wrong program ID.

**Fix**

- Split framework adapters: Anchor adapter, Pinocchio adapter, Quasar adapter.
- Each adapter owns detection, parse roots, build command, deploy command, IDL
  path, keypair sync, and warnings.
- Add CLI flags to include tests/examples/benches when the user wants full graph
  inspection.
- Report exact files parsed and skipped.

**Done when**

- `solstudio view` shows a parse report with framework, files, warnings, and
  unsupported items.
- Build/deploy commands are adapter-specific and test-covered.

## P0 - Cloud Workflow Product

### P0.8 Cloud nodes still execute mock behavior

**Where**

- `apps/cloud/src/components/editor/EditorToolbar.tsx`
- `apps/cloud/src/server/execution-worker/queue.ts`
- `packages/cloud-nodes/src/nodes/action-price-fetch.tsx`
- `packages/cloud-nodes/src/nodes/action-jupiter-swap.tsx`
- `packages/cloud-nodes/src/nodes/action-token-transfer.tsx`
- `packages/cloud-nodes/src/nodes/action-ai-agent.tsx`
- `packages/cloud-nodes/src/nodes/output-webhook.tsx`

**Observed**

Several Cloud nodes return mock signatures, prices, AI responses, webhook
responses, or dummy wallet data. The editor toolbar can silently fall back to
mock execution if tRPC execution fails.

**Why it matters**

This is the biggest Cloud product risk. A workflow automation product cannot
look like it executed on-chain when it only returned mocked data.

**Fix**

- Remove silent mock fallback from the production editor path.
- Wire execution worker to `packages/cloud-wallet/src/signer.ts`.
- Implement real Jupiter quote/swap flow with transaction construction,
  signing, simulation, and send/confirm.
- Implement real SPL token transfer.
- Implement real price providers with provider config and failure behavior.
- Implement real webhook output with request method, headers, retry, timeout,
  response capture, and secret redaction.
- Gate any demo/mock mode behind explicit dev-only settings.

**Done when**

- Every node labeled "action" or "output" either performs the real action or
  refuses with a clear configuration error.
- Execution history stores real signatures/responses and redacts secrets.

### P0.9 Cloud wallet encryption exists but execution does not use it

**Where**

- `apps/cloud/src/server/execution-worker/queue.ts`
- `packages/cloud-wallet/src/encryption.ts`
- `packages/cloud-wallet/src/signer.ts`
- `apps/cloud/src/server/trpc/routers/wallet.ts`

**Observed**

Cloud wallets are encrypted on creation, but the worker uses dummy
`walletOps`. Workflow `walletId` is not loaded, decrypted, or passed into
runtime wallet operations.

**Why it matters**

Users can create wallets but workflows cannot actually sign. This makes the
Cloud product structurally present but not functionally complete.

**Fix**

- Load `workflow.walletId` and the related `CloudWallet` in the worker.
- Require `ENCRYPTION_MASTER_KEY` and per-network RPC URLs.
- Instantiate `WalletSigner`.
- Provide `WalletOperations` that uses the workflow wallet by default and
  validates requested wallet IDs belong to the workflow owner.
- Update `lastUsedAt` after signing/balance checks.

**Done when**

- Manual execution of a token transfer or Jupiter node signs with the selected
  encrypted wallet on devnet.

### P0.10 Branching UI and engine contract do not match

**Where**

- `packages/cloud-nodes/src/nodes/logic-if-else.tsx`
- `packages/cloud-nodes/src/types.ts`
- `packages/cloud-engine/src/executor.ts`
- `packages/cloud-engine/src/dag.ts`

**Observed**

`logic:if-else` returns `[trueItems, falseItems] as any`, but
`CloudNodeDefinition.execute` is typed as `Promise<WorkflowItem[]>`. The
executor stores a single output array per node and does not route by output
handle.

**Why it matters**

The canvas can show true/false handles, but execution cannot reliably send data
down the selected branch. DeFi automation needs correct branching.

**Fix**

- Change execution output to support multiple named/indexed outputs.
- Store output data by `nodeId + sourceHandle`.
- When resolving downstream inputs, use the edge source handle.
- Update tests for if/else, filter, merge, and multi-output nodes.

**Done when**

- True branch and false branch execute different downstream paths in tests and
  in the UI execution preview.

### P0.11 Cloud expression engine is too small for workflow automation

**Where**

- `packages/cloud-engine/src/expression.ts`

**Observed**

Only simple string replacement for `{{ $json.path }}` is supported. It always
returns strings and only reads the first item of the first input.

**Why it matters**

Workflow builders need expressions like `$input[0].json.price`, `$now`,
previous node output references, numeric comparisons, booleans, arrays, and
objects. Current behavior can silently convert numbers/booleans into strings.

**Fix**

- Add expression context with `$json`, `$input`, `$node`, `$now`, `$env` only
  where safe, and item index.
- Preserve type when the whole value is a single expression.
- Add safe evaluation with no arbitrary JS execution.
- Add expression validation in the editor.

**Done when**

- Expressions support multi-input workflows and retain data types.
- Invalid expressions fail before execution with useful errors.

### P0.12 Cloud workflow lifecycle is incomplete

**Where**

- `apps/cloud/server.ts`
- `apps/cloud/src/server/trigger-manager/index.ts`
- `apps/cloud/src/server/trigger-manager/cron-worker.ts`
- `apps/cloud/src/app/api/webhook/[path]/route.ts`

**Observed**

- `restoreActiveTriggers()` exists but is not called on server startup.
- Cron worker starts during activation, not as a durable app lifecycle concern.
- Webhook activation log says `/webhooks/:path`, actual route is
  `/api/webhook/:path`.
- `nextRunAt` update uses current job timestamp, not necessarily the next
  repeat time.

**Why it matters**

Active workflows may not resume after deploy/restart. Users expect Cloud
workflows to keep running.

**Fix**

- Start execution worker and cron worker intentionally in server bootstrap or a
  separate worker process.
- Call trigger restoration at startup for active workflows.
- Standardize webhook public URL and UI copy.
- Add health checks for Redis, DB, worker liveness, and trigger restoration.

**Done when**

- Restarting the Cloud process does not disable active workflows.
- Cron and webhook workflows still trigger after redeploy.

### P0.13 Cloud DB operations rely on unsafe compound where shapes

**Where**

- `apps/cloud/src/server/trpc/routers/workflow.ts`
- `apps/cloud/src/server/trpc/routers/wallet.ts`
- `apps/cloud/src/server/trpc/routers/execution.ts`

**Observed**

Several `update`, `delete`, and `cancel` calls use `where: { id, userId }` or
relation filters in operations that normally require a unique selector unless a
compound unique constraint exists.

**Why it matters**

This can be a runtime failure depending on Prisma client generation, or it can
hide authorization bugs if future schema changes loosen checks.

**Fix**

- Use `findFirst` with ownership check, then update/delete by unique `id`.
- Or add explicit compound unique constraints where truly required.
- Prefer `updateMany` with `{ id, userId }` when the result count is checked.

**Done when**

- Ownership-protected writes are consistent and have tests for cross-user
  denial.

### P0.14 Cloud status values are free strings

**Where**

- `packages/db/prisma/schema.prisma`
- `apps/cloud/src/server/trpc/routers/workflow.ts`
- `apps/cloud/src/server/execution-worker/queue.ts`
- `packages/cloud-engine/src/types.ts`

**Observed**

Workflow and execution status values are plain strings: `DRAFT`, `ACTIVE`,
`INACTIVE`, `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, plus engine
`success/error/skipped`.

**Why it matters**

Free strings make UI filters, migrations, and worker transitions fragile.

**Fix**

- Add Prisma enums for workflow status, execution status, and node execution
  status.
- Add a transition table for valid status changes.
- Keep engine internal status mapped explicitly to DB status.

**Done when**

- Invalid statuses cannot be inserted by application code.

## P1 - Visual Builder / IDE

### P1.1 Plugin system is not actually integrated end to end

**Status**

First registration/render/IR pass is complete: SPL Token, Metaplex, and Pyth are
registered through the web app bootstrap; plugin nodes can be dropped and
rendered on the canvas; connection validation treats them as integrations; and
namespaced plugin nodes now export to IR `integrations[]`. Remaining work is
property-schema editing, config validation, Pinocchio/Quasar plugin codegen, and
Metaplex plugin codegen version hardening. Anchor SPL Token/Pyth codegen is now
implemented with tests; Pinocchio/Quasar emit explicit unsupported-integration
warnings instead of silently omitting plugin behavior.
Metaplex should expand around Token Metadata features such as metadata PDAs,
minting assets, programmable NFTs, verified collections, verified creators,
metadata updates, transfers, burns, locking, and delegated authorities.
MagicBlock should be modeled as a separate plugin family for Ephemeral Rollup
delegation, commit, undelegation, and Magic Actions after commit.

**Where**

- `packages/plugin-sdk`
- `plugins/plugin-spl-token`
- `plugins/plugin-metaplex`
- `plugins/plugin-pyth`
- `apps/web/src/components/editor/NodePalette.tsx`
- `apps/web/src/components/editor/FlowCanvas.tsx`
- `packages/flow-nodes/src/index.ts`
- `packages/ir/src/transformer.ts`

**Observed**

- Plugin packages export plugin objects, but no app bootstrap registers them.
- Palette reads from `pluginRegistry`, but registry is empty unless something
  registers plugins.
- `FlowCanvas` only passes built-in `nodeTypes` to React Flow.
- `createNodeFromType()` only supports static built-in node types.
- `flowToIR()` only collects nodes with type `integration`, not namespaced
  plugin node types such as `spl-token:create-mint`.
- Plugin codegen hook type has `anchor` and `pinocchio`, but no `quasar`.
- Plugin TODOs still exist for Pinocchio implementations.

**Why it matters**

The UI can imply plugin support, but enabled plugin nodes will not render,
create, transform, or generate code reliably.

**Fix**

- Add a web-side plugin bootstrap that imports and registers built-in plugins.
- Merge `pluginRegistry.getNodeTypes()` into React Flow `nodeTypes`.
- Add a generic plugin-node factory with plugin defaults.
- Make `flowToIR()` call plugin `toIR()` hooks or convert plugin nodes to
  integration IR.
- Add plugin codegen hook support for Quasar.
- Finish SPL Token, Metaplex, and Pyth codegen for Anchor, Pinocchio, and
  Quasar.

**Done when**

- Dragging a plugin node from the palette renders on canvas.
- The node saves, reloads, converts to IR, and appears in generated Rust.

### P1.2 Test runner needs deeper transaction coverage

**Where**

- `apps/web/src/server/trpc/routers/test.ts`
- `apps/web/INCOMPLETE_FEATURES.md`
- `doc-ref/FRAMEWORK_IMPLEMENTATION_NOTES.md`

**Observed**

The first production pass now runs generated projects in isolated temp
workspaces and exposes a Surfpool Simnet runtime from the editor. The remaining
gap is deeper transaction-level assertion generation across Anchor, Pinocchio,
and Quasar.

**Why it matters**

For a production IDE, "tested" must mean the generated program was built and
executed under a real or sandboxed Solana test runtime, not only validated as
JSON/IR.

**Fix**

- Add isolated project workspace creation.
- Generate framework-specific tests.
- Run `anchor test --skip-local-validator`, Pinocchio tests, or Quasar tests
  in a sandbox/container with Surfpool as the simnet setup.
- Use Solana Kit patterns from `../kit` for runtime setup, simulation, and
  Surfpool-backed simnet workflows where applicable.
- Stream logs and persist artifacts.
- Enforce timeouts and resource limits.
- Keep the existing Smoke/Simnet switch and expand the Simnet path with
  generated instruction transactions and failure assertions.

**Done when**

- A generated token/vault/counter project can compile and run tests from the UI.
  **First Smoke/Surfpool runtime pass complete.**

### P1.3 Security headers and CSP are unfinished

**Where**

- `doc-ref/security-audit.md`
- Next.js app config/middleware

**Observed**

Security docs note CSP work, but app-level enforcement is not clearly complete.

**Why it matters**

The product handles auth sessions, wallet keys, generated code, and marketplace
content. CSP and security headers are not optional in production.

**Fix**

- Add strict CSP per app.
- Add frame, referrer, permissions, and content-type headers.
- Audit third-party scripts and wallet flows.
- Add rate limits to auth, compile, deploy, webhook, and AI endpoints.

**Done when**

- Security headers are visible in deployed responses and covered in docs/tests.

### P1.4 Marketplace/plugin trust model needs hardening

**Where**

- `apps/web/src/app/marketplace`
- `packages/plugin-sdk`
- `plugins`

**Observed**

Marketplace and plugin surfaces exist. Built-in plugin registration now enforces
manifest id/version/namespace/dependency validation and a trust-level policy,
but publish/install UX still needs provenance display and template lint/audit
scoring.

**Why it matters**

Templates and plugins can influence generated Rust and potentially deployment
behavior. Users need provenance and safety checks.

**Fix**

- Add template linting and audit score before publish.
- Add plugin manifest signing for non-built-in plugins.
- Display generated dependency changes.
- Prevent marketplace downloads from including hidden secret-bearing data.
- Keep first-party plugin security metadata required for built-ins.

**Done when**

- Publishing and installing templates/plugins includes validation and clear
  warnings. **Registry-level manifest/trust enforcement complete for first-party
  and local plugins.**

### P1.4A Solana audit rule engine needs production detectors

**Where**

- `packages/audit`
- CLI parse/report output
- `apps/web` audit tab
- Marketplace/template publish checks

**Observed**

The audit tab exists, but the product needs framework-aware Solana detectors
that produce actionable findings instead of generic placeholders.

**Rule Set**

- `SW001`: missing signer or pubkey-only authority validation.
- `SW002`: missing owner check on deserialization.
- `SW003`: arbitrary CPI target risk.
- `SW004`: non-canonical PDA derivation risk.
- `SW005`: unsafe arithmetic or narrowing cast.
- `SW006`: missing account discriminator validation.
- `SW007`: unchecked account usage without validation.
- `SW008`: missing post-CPI account reload.
- `SW009`: missing token mint validation.
- `SW010`: missing token authority validation.

**Fix**

- Map each rule to Anchor, Pinocchio, and Quasar code patterns.
- Add fixtures for positive and negative cases per framework.
- Show findings in editor/CLI with file, line, severity, explanation, and
  framework-specific remediation.
- Run the same audit on generated templates and marketplace publish.

**Done when**

- The audit engine catches each SW001-SW010 rule across all three frameworks
  with regression tests and no dummy findings.

## P1 - Codegen And Framework Coverage

### P1.5 Generated code must compile for every supported framework

**Where**

- `packages/codegen/src/generators/anchor`
- `packages/codegen/src/generators/pinocchio`
- `packages/codegen/src/generators/quasar`
- `packages/codegen/scripts`

**Observed**

The codegen package has many tests and scripts, but production support means
every built-in node and plugin path needs compile-backed framework coverage.

**Fix**

- Create canonical generated projects for:
  - counter
  - token mint/transfer
  - PDA vault
  - multisig/authority pattern
  - oracle read
  - NFT mint/metadata
- Compile each for Anchor, Pinocchio, and Quasar.
- Fail CI if generated code contains TODO placeholders for supported features.

**Done when**

- Each supported template compiles under each advertised framework.

### P1.6 Unsupported framework features need explicit warnings

**Where**

- Parser, IR transformer, codegen, CLI UI

**Observed**

Some features are supported in one framework but not another, especially plugin
operations and CPI helpers.

**Why it matters**

Silent partial support is worse than an explicit limitation. Users need to know
when a visual graph cannot generate safe code for their framework.

**Fix**

- Add feature capability matrix:
  - Anchor
  - Pinocchio
  - Quasar
  - Cloud only
- Surface unsupported nodes in editor and CLI parse output.
- Block generation/deploy when critical framework support is missing.

**Done when**

- User cannot accidentally generate a framework target with unsupported nodes.

## P2 - Cloud Quality And Scale

### P2.1 Workflow settings are stored but not enforced

**Where**

- `apps/cloud/src/server/trpc/routers/workflow.ts`
- `packages/cloud-engine/src/executor.ts`
- `apps/cloud/src/server/execution-worker/queue.ts`

**Observed**

Workflow settings include timeout, retry policy, and `onError`, but executor
does not enforce them. Worker hardcodes settings during execution.

**Fix**

- Load workflow settings into executor.
- Add timeout cancellation with a shared `AbortController`.
- Add retry policy per node or per workflow.
- Honor `onError: stop | continue`.

**Done when**

- Timeout, retry, and on-error behavior are covered by engine tests.

### P2.2 Error handling allows downstream execution after upstream failure

**Where**

- `packages/cloud-engine/src/executor.ts`

**Observed**

Node errors are recorded, but the batching loop can continue scheduling later
nodes unless the whole executor aborts.

**Fix**

- Compute runnable nodes only when required upstream outputs succeeded.
- Apply workflow `onError` policy.
- Mark blocked downstream nodes as skipped with cause.

**Done when**

- Failing upstream nodes do not trigger unsafe downstream DeFi actions.

### P2.3 Secrets and credentials need a complete product model

**Where**

- `CloudCredential`
- Cloud node property type `"credential"`
- Cloud editor forms

**Observed**

Credential model exists, but node-level credential selection, masking,
rotation, and usage audit are not complete.

**Fix**

- Add credential CRUD UI.
- Add node property binding to credential IDs.
- Mask/redact secrets in execution logs and snapshots.
- Track credential last used and owner.

**Done when**

- Webhook/API/AI nodes can use credentials without storing secrets inside
  workflow JSON.

## P2 - CLI UX And Reliability

### P2.4 CLI server binds without explicit local host

**Where**

- `packages/cli/src/server/index.ts`

**Observed**

The CLI starts a server by port only. Tests needed elevated permission in this
environment because listening was blocked by sandbox rules.

**Fix**

- Add host option, default to `127.0.0.1` for local CLI.
- Print exact URL.
- Test host binding behavior.

**Done when**

- `solstudio view --host 127.0.0.1 --port 6139` is explicit and reliable.

### P2.5 CLI parse report should be first-class

**Where**

- `packages/cli/src/server/index.ts`
- `apps/standalone`

**Observed**

Users need to know what the parser found, skipped, and could not understand.

**Fix**

- Add parse summary endpoint:
  - framework
  - project root
  - files parsed
  - files skipped
  - warnings
  - unsupported constructs
  - parse confidence
- Show this report in the standalone UI.

**Done when**

- A user can tell whether the graph is complete or only a partial view.

## P3 - Product Positioning And Packaging

### P3.1 Domain/product layout should be explicit

**Recommended layout**

- `solstudio.fun`: main IDE, project dashboard, docs, marketplace, pricing.
- `cloud.solstudio.fun`: Cloud workflow product.
- `solstudio.fun/editor/:id`: visual program builder.
- `cloud.solstudio.fun/editor/:workflowId`: workflow builder.
- `docs.solstudio.fun` or `solstudio.fun/docs`: docs, depending on SEO and
  deployment simplicity.

**Important**

Do not merge all products into one landing page. Keep one account and one DB,
but separate product onboarding and navigation so the value is clear.

### P3.2 Shared packages should become platform contracts

**Where**

- `packages/auth`
- `packages/db`
- `packages/ir`
- `packages/codegen`
- `packages/rust-parser`
- `packages/cloud-engine`
- `packages/plugin-sdk`

**Fix**

- Treat these packages as stable internal APIs.
- Add package-level README contract for each.
- Add changelog entries when IR/schema/auth contracts change.

## Production Definition Of Done

The project is production-ready only when:

- Root typecheck, package tests, and framework compile checks pass.
- No plaintext private keys are stored in DB.
- Same-auth works across web and Cloud domains.
- CLI detection is consistent for Anchor, Pinocchio, Quasar, and unknown Rust.
- CLI parser has fixture coverage from real framework repos.
- Parser warnings are visible to users.
- Cloud workflows execute real actions or fail clearly.
- Cloud branching, expressions, retries, timeouts, and status transitions are
  engine-supported.
- Plugin nodes can be registered, dragged, rendered, saved, converted to IR, and
  generated into code.
- Generated code compiles for advertised framework support.
- Security headers, rate limits, and secret redaction are active.

## Suggested Implementation Order

1. Fix root typecheck and CLI typecheck.
2. Remove plaintext IDE key storage by adopting encrypted key handling.
3. Finish Cloud auth route/middleware/sign-in for shared auth.
4. Replace Cloud mock wallet ops with encrypted wallet signer.
5. Fix Cloud multi-output execution for branches.
6. Unify CLI framework detection and add Quasar support everywhere.
7. Build the real parser fixture matrix from Anchor, Pinocchio, and Quasar refs.
8. Integrate plugins end to end in editor, IR, and codegen.
9. Replace Cloud mock nodes with real providers/actions.
10. Add production security headers, rate limits, and deployment health checks.
