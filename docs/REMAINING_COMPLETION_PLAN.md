# SolStudio Remaining Completion Plan

Last updated: 2026-04-27

This is the remaining work after the first production-fix batch. The goal is to
make SolStudio complete across all three products: IDE, CLI/local visualizer, and
Cloud workflows.

## Already Fixed In Current Batch

- Root typecheck blockers.
- IDE keypair storage now writes encrypted payloads and keeps legacy rows readable.
- Cloud auth route, sign-in/error pages, and protected page middleware.
- CLI framework detection now supports Anchor, Pinocchio, Quasar, and unknown consistently.
- IR PascalCase validation bug.
- Cloud multi-output branch routing.
- Cloud worker uses encrypted Cloud wallets instead of dummy wallet ops.
- Cloud mock execution fallbacks/results removed.
- Cloud expression engine supports typed whole expressions, `$json`, `$input[n].json`, and `$now`.
- Cloud workers/triggers restore on server startup.
- Cloud workflow/wallet/execution writes use ownership checks before unique writes.
- Cloud action nodes now execute real provider/runtime work for webhook, price
  fetch, AI agent, Jupiter swap, and token transfer.
- Cloud wallet runtime can simulate transactions before signing and sending.
- Cloud credentials now have encrypted CRUD, UI management, editor selectors,
  runtime credential resolution, redacted node output, and `lastUsedAt` updates.
- Cloud workflow runtime now enforces timeout, retry policy, shared abort
  signals, `onError` behavior, and downstream skip semantics.
- Cloud workflow, execution, and node execution statuses now use Prisma enums
  with a migration that safely casts legacy string rows.
- Cloud `/editor/new` now creates a real DB workflow and redirects to the
  persisted workflow ID; editor pages hydrate workflow data from tRPC.
- CLI and IDE generated-test runners now have explicit Surfpool Simnet runtime
  support. The editor can choose Smoke or Simnet, and CLI Anchor setup includes
  Surfpool Anchor compatibility/Test.toml flags when present.
- Cloud outbound provider hardening now blocks private/local outbound webhook
  targets by default and rejects private/custom Jupiter provider bases.
- Plugin marketplace registration now enforces manifest id/version/namespace
  validation, dependency shape checks, and a trust policy for first-party,
  verified, community, and untrusted plugins.
- Plugin SDK now includes browser/Node WebCrypto provenance helpers:
  canonical manifest hashing, SHA-256 digest generation, ECDSA P-256 signature
  verification against trusted publisher keys, and tamper-detection tests.
- Standalone DeFi provider adapters now validate input/response shapes, include
  request timeouts, preserve upstream error bodies, and fail before signing on
  malformed Jupiter swap responses.

## Phase 1 - Production Blockers Still Remaining

### 0. Solana Kit Migration Strategy

Anza renamed the 2.x line of `@solana/web3.js` to `@solana/kit`. Kit is the
right long-term direction because it is modular, tree-shakable, uses native
`bigint`, and exposes composable RPC/signing/transaction internals. Do not do a
blind project-wide swap: wallet adapters, Jupiter serialized transactions, and
SPL helper packages still commonly interoperate with legacy `web3.js` 1.x
transaction classes.

- Add `@solflow/solana-runtime` as the project-owned boundary.
  - Address validation and normalization.
  - RPC send/confirm/simulate APIs.
  - Key generation/import/export.
  - Native SOL transfer builder.
  - Versioned transaction serialization/deserialization helpers.
  - Compatibility adapters for legacy `Transaction` and `VersionedTransaction`.

- Migrate server-only low-risk code first.
  - `packages/auth` public key validation.
  - Cloud wallet public key/balance helpers.
  - Project/program key generation.
  - Marketplace transaction inspection.

- Keep legacy interop where external APIs still require it.
  - Jupiter swap returns serialized transactions that must still be signed and
    sent reliably.
  - Browser wallet adapters generally expect legacy transaction objects today.
  - `@solana/spl-token` helper builders currently return legacy instruction
    shapes.

- Migrate transaction builders after runtime boundary exists.
  - Cloud SOL transfer.
  - Cloud SPL transfer.
  - IDE transaction builder.
  - Marketplace payment.
  - Deployment router buffer/program upgrade transactions.

- Remove direct app/package imports from `@solana/web3.js`.
  - Keep direct imports only inside `@solflow/solana-runtime` compatibility
    modules until all callers use Kit-native APIs.
  - Add a lint/check script that fails on new direct `@solana/web3.js` imports
    outside the runtime boundary.

### 1. Real Cloud Action Implementations

Status: complete for the first production pass. Nodes now perform real
provider/runtime work and return structured execution output. Next hardening
belongs under credentials, runtime policies, and observability.

- Implemented `action:price-fetch`.
  - Birdeye adapter using `BIRDEYE_API_KEY`.
  - DexScreener adapter.
  - Structured provider output and provider errors.

- Implemented `action:jupiter-swap`.
  - Jupiter quote request.
  - Swap transaction request.
  - Wallet signing through `WalletSigner`.
  - Simulation before send through wallet runtime when available.
  - Send/confirm and return real signature.
  - Slippage/error details in node output.

- Implemented `action:token-transfer`.
  - Native SOL transfer.
  - SPL token transfer.
  - Idempotent destination ATA creation.
  - Wallet ownership validation through worker wallet lookup.
  - Real signature output.

- Implemented `output:webhook`.
  - Real `fetch`.
  - Method, headers, body handling.
  - Timeout.
  - Secret redaction in snapshots.
  - Store response status/body safely.

- Implemented `action:ai-agent`.
  - Environment-backed OpenAI/Anthropic calls.
  - Text and JSON response modes.
  - Token usage capture.
  - Credentials are not emitted in node output.

### 2. Cloud Credentials Product

Status: complete for the first production pass. Cloud workflows can now select
encrypted credentials by ID instead of embedding secrets in workflow JSON.

- Implemented credential CRUD page at `/credentials`.
- Implemented encrypted credential creation/update/delete.
- Implemented credential selector property editor.
- Bound provider nodes to credential IDs:
  - `action:price-fetch` for Birdeye.
  - `action:ai-agent` for OpenAI and Anthropic.
  - `action:jupiter-swap` for Jupiter API keys/base URL.
  - `output:webhook` for bearer/API-key/custom header auth.
- Credential data is never returned to the browser or emitted in node output.
- Runtime updates `lastUsedAt` when a credential is resolved.

Follow-up hardening:

- Add credential usage/dependency checks before deletion.
- Add optional credential health checks per provider.
- Add database migration/apply step for `dataSalt` and `lastUsedAt` in deployed environments.

### 3. Cloud Workflow Runtime Policies

Status: complete for the first production pass. The engine now applies workflow
settings during execution instead of only storing them.

- Implemented workflow timeout.
- Implemented shared `AbortController` per execution.
- Implemented node retry policy with attempt counts and retry logs.
- Implemented `onError: stop | continue | branch`.
- Implemented explicit error branch routing through `sourceHandle: "error"`.
- Implemented downstream skip when upstream dependencies fail.
- Mark skipped nodes with clear reasons in node execution errors/log snapshots.
- Worker now uses persisted workflow settings instead of hardcoded defaults.
- Worker maps timeout/cancelled/error results to DB status strings.

Follow-up hardening:

- Add user-facing workflow settings editor controls.
- Add cancellation propagation from the `execution.cancel` route to active workers.
- Add per-node retry overrides only after the workflow-level behavior is stable.

### 4. Cloud Status Enums And Migrations

Status: complete for the first production pass. Cloud workflow statuses are no
longer free strings in Prisma.

- Added Prisma enum `CloudWorkflowStatus`.
- Added Prisma enum `CloudExecutionStatus`.
- Added Prisma enum `CloudNodeExecutionStatus`.
- Added PostgreSQL migration:
  - Casts existing `Workflow.status` strings into `CloudWorkflowStatus`.
  - Casts existing `WorkflowExecution.status` strings into `CloudExecutionStatus`.
  - Casts existing `NodeExecution.status` strings into `CloudNodeExecutionStatus`.
  - Handles legacy aliases such as `SUCCESS`, `ERROR`, `TIMEOUT`, and `CANCELED`.
  - Includes the credential metadata fields introduced in Phase 1.2.
- Engine-to-DB status mapping is explicit in the worker.
- Execution pages/editor polling now understand `TIMED_OUT` and `SKIPPED`.

Follow-up hardening:

- Apply the migration in the deployed database before deploying enum-backed code.
- Add filters for enum statuses in execution/workflow list pages.

### 5. Cloud New Workflow Route

Status: complete for the first production pass. New workflow creation now goes
through the real Cloud workflow API.

- `/editor/new` creates a workflow through tRPC.
- Redirects to `/editor/{workflow.id}` using the real DB workflow ID.
- Shows a visible retryable error state when creation fails.
- `/editor/[workflowId]` now fetches workflow data through tRPC.
- Saved workflow definitions hydrate back into React Flow nodes/edges.

Follow-up hardening:

- Add name/settings editing in the editor shell.
- Add better unknown-node recovery for plugin nodes after plugin registration is complete.

## Phase 2 - CLI And Parser Completion

### 6. Parser Fixture Matrix

Status: first matrix pass complete. The parser now has stable local fixtures for
Anchor, Pinocchio, and Quasar plus optional smoke coverage against adjacent
framework repos when present.

- Added local Anchor workspace fixture.
  - Workspace layout under `programs/*`.
  - PDA seeds/bump constraints.
  - Init/mut/signers.
  - Events/errors.
  - Logic parsing for `require!`, checked math, and `emit!`.

- Added local Pinocchio fixture.
  - `entrypoint!`.
  - Numeric discriminator dispatch.
  - Instruction data structs.

- Added local Quasar fixture.
  - `quasar-lang` project detection.
  - `Ctx<T>` program handlers.
  - Accounts in module files.
  - Account state, event, and error parsing.

- Added expected parse summary tests.
  - framework detection
  - program name
  - version
  - instruction names
  - account count
  - states
  - events/errors
  - valid React Flow edge references

- Added optional external repo smoke tests.
  - `../anchor/tests/events`
  - `../quasar/tests/programs/test-sysvar`
  - `../pinocchio/programs/token`

Follow-up expansion:

- Add Anchor CPI/SPL-specific fixtures from `../anchor/tests/spl`.
- Add Pinocchio `program_entrypoint!` and `lazy_program_entrypoint!` fixtures.
- Add Pinocchio manual account parsing summaries beyond instruction detection.
- Add Quasar token-validation fixtures from `../quasar/tests/programs/test-token-validate`.
- Expand warning/confidence assertions across the external repo smoke matrix.

### 7. Parser Warnings And Parse Report

Status: complete for the first production pass. The parser now reports what it
scanned, what it skipped, the detected framework, unsupported constructs, and a
confidence level. The CLI server and standalone UI expose the report.

The CLI must tell users what it understood and what it skipped.

- Added `ParseReport` to `@solflow/rust-parser`.
- Included files parsed/skipped.
- Included unsupported constructs requiring manual review.
- Included parse confidence and confidence reasons.
- Returned report from `parseProgram`, `parseFile`, CLI JSON output, and
  CLI `/api/parse`.
- Persisted parse reports in standalone `project.json` snapshots.
- Showed parse report summary in the standalone source editor.
- Added parser report regression tests and CLI `/api/parse` response coverage.

Follow-up hardening:

- Add CLI include/exclude flags for tests/examples/benches/migration dirs.
- Make module-reachable files distinct from all scanned Rust files in the
  report.
- Add source-line locations for unsupported constructs.
- Add richer parse report panel with full file lists in the standalone UI.

### 8. Parser Internal Model Cleanup

Status: complete for the first production pass. Parser-only delegation wrappers
now use an internal `parser-group` operation instead of pretending to be
runtime `if-else` branches. The flow converter flattens parser groups into
sequential visual nodes while preserving real branch logic.

Some parser-only grouping is still represented as synthetic `if-else`.

- Added internal parser group operation type.
- Converted parser groups to sequential visual nodes.
- Kept real `if/else` distinct from parser delegation wrappers.
- Added tests for delegated handlers, real branches, and flow conversion.

Follow-up hardening:

- Add richer source location metadata to parser groups before flattening.
- Add a dedicated `match`/branch model if visual match routing becomes a
  product requirement instead of flattening parsed match bodies.
- Audit downstream codegen assumptions for nested branch bodies.

### 9. CLI Framework Adapters

Status: first adapter pass complete. CLI server compile/test/deploy/key-sync,
watch roots, and codegen framework resolution now go through a framework
adapter boundary instead of scattered switch statements.

Build/test/deploy/key sync should be adapter-specific.

- Added Anchor adapter.
- Added Pinocchio adapter.
- Added Quasar adapter.
- Added unknown/read-only adapter for codegen/deploy refusal.
- Adapter-owned watch roots.
- Adapter-owned build/test command specs.
- Adapter-owned key-sync/deploy strategy selection.
- Added adapter regression tests.

Follow-up hardening:

- Move low-level keypair discovery and manual Solana deployment into adapter
  implementations.
- Add adapter-owned IDL/output path discovery.
- Add user-facing include/exclude source roots through adapter parse options.
- Add per-framework command availability checks before rendering toolbar
  actions.

### 10. CLI Source Coverage Options

Status: complete for the first production pass. Parser/source scanning can now
include tests, examples, benches, migrations, and hidden folders by explicit
option instead of silently hardcoding every optional folder out.

Current scanner skips some folders unconditionally.

- Added parser `sourceCoverage` options.
- Added CLI parse flags:
  - `--include-tests`
  - `--include-examples`
  - `--include-benches`
  - `--include-migrations`
  - `--include-hidden`
- Parse reports now show optional folders as skipped with the include option
  needed to scan them.
- Standalone `/api/source` can honor matching query flags for source listing.
- Added source coverage regression tests.

Follow-up hardening:

- Add checkboxes in the standalone source panel for optional folders.
- Distinguish module-reachable files from extra coverage files in the report.
- Add per-framework default coverage recommendations in CLI help.

### 11. Framework Component Corpus

Status: first corpus pass complete. Added
`docs/FRAMEWORK_COMPONENT_CORPUS.md` with framework/API inventory and concrete
parser, editor, codegen, SDK, test-runner, and audit implications.

Build a complete framework/component inventory from adjacent framework repos so
parser, editor nodes, codegen, SDK generation, tests, and audit coverage match
real-world framework APIs instead of only local examples.

- Inspect `../anchor`.
  - Account constraints, account wrappers, CPI helpers, SPL helpers, events,
    errors, access control, IDL patterns, test workflow.
- Inspect `../pinocchio`.
  - `entrypoint!`, `program_entrypoint!`, `lazy_program_entrypoint!`, account
    parsing, PDA helpers, CPI helpers, packed data, token helpers, tests.
- Inspect `../quasar`.
  - `quasar-lang`, `Ctx<T>`, account validation, event/error patterns, token
    validation, IDL/parser conventions, tests.
- Inspect `../codama` for SDK generation conventions.
  - IDL/type model.
  - Instruction/account/client generation patterns.
  - Cross-language SDK assumptions.
- Inspect `../kit` for Solana Kit testing/runtime patterns.
  - RPC client setup.
  - Transaction send/simulate/confirm.
  - Test utilities and local validator workflow.
- Produce one framework corpus document with:
  - Parser fixtures to add.
  - Editor node types/properties to support.
  - Codegen features per framework.
  - SDK generation mapping.
  - Test runner workflow per framework.
  - Audit rules that need framework-specific detectors.

## Phase 3 - Plugin System Completion

### 12. Register Built-In Plugins

Status: complete for the first production pass. The web app now bootstraps the
first-party plugin packages and verifies registration with a focused test.

- Imported SPL Token, Metaplex, and Pyth plugin packages into a built-in plugin
  bootstrap.
- Registered them with `pluginRegistry` idempotently so hot reload/test imports
  do not double-register.
- Wired the bootstrap into the node palette and plugin panel.
- Added web package dependencies for the first-party plugin workspaces.
- Added a registry test covering plugin IDs and plugin node type registration.

### 13. Render Plugin Nodes In Canvas

Status: complete for the first production pass. Registered plugin nodes can now
be created from the palette, rendered by React Flow, connected using integration
connection semantics, saved, and reloaded by their namespaced node type.

- Merged `pluginRegistry.getNodeTypes()` with built-in `nodeTypes`.
- Added a plugin-aware editor node factory.
- Used plugin `defaultData` to create node data and initial config.
- Drag/drop now creates the correct namespaced type.
- Connection validation treats namespaced plugin nodes as integration nodes.
- Saved/reloaded plugin nodes render through the editor node type map.

### 14. Plugin IR Integration

Status: complete for the first production pass. Namespaced plugin nodes are now
converted into IR `integrations[]` entries without making `@solflow/ir` depend
on the web plugin registry.

- `flowToIR()` collects built-in integration nodes and namespaced plugin nodes.
- Plugin ID and integration ID are read from node data, with type-based fallback.
- Attached instruction is inferred from instruction-to-plugin canvas edges.
- Plugin config is preserved in the IR.
- Added IR regression coverage for SPL Token plugin node conversion.

Follow-up hardening:

- Add config validation against plugin property schemas.
- Add Metaplex and Pyth IR tests once property editing is wired.

### 15. Plugin Codegen

Status: Anchor first pass complete. SPL Token and Pyth integrations now produce
real Anchor codegen, and unsupported framework/plugin combinations emit explicit
warnings instead of silently dropping plugin behavior.

- Added Anchor SPL Token codegen for:
  - create mint
  - mint tokens
  - transfer tokens
- Added Anchor Pyth read-price codegen.
- Added Cargo dependency injection for `anchor-spl` and
  `pyth-solana-receiver-sdk`.
- Added plugin account-field injection into generated Anchor instruction account
  structs.
- Added codegen tests for SPL Token, Pyth, and unsupported framework warnings.
- Pinocchio and Quasar now warn clearly when plugin integrations are present but
  framework-specific plugin codegen is not implemented.

Follow-up hardening:

- Implement Pinocchio SPL Token plugin codegen using `pinocchio-token`.
- Implement Quasar SPL Token plugin codegen using `quasar-spl`.
- Expand Metaplex as a full plugin family, not just one NFT node:
  - Token Metadata PDA helpers.
  - Create token metadata.
  - Mint NFT.
  - Mint programmable NFT.
  - Create/verify collection.
  - Verify creator.
  - Update metadata.
  - Transfer/burn/lock/delegate where the generated framework can express the
    required accounts safely.
- Add a MagicBlock plugin family:
  - Delegate account to Ephemeral Rollup.
  - Commit delegated state.
  - Undelegate account.
  - Magic Actions for post-commit base-layer instructions/workflows.
- Lock exact dependency/API versions before generating Metaplex or MagicBlock
  code across all three frameworks.
- Add plugin property-schema validation before codegen.
- Compile generated plugin examples.
- Wire third-party plugin install flows to `verifyPluginSignature()` before
  registration; registry-level validation and SDK verification helpers are now
  available.

## Phase 4 - IDE Production Completion

### 16. Real Test Runner

Status: first production pass complete. The IDE test route no longer fakes
structural pass/fail results. It now regenerates IR if needed, generates Rust,
writes an isolated temp project, runs a real framework smoke command, persists
logs/results, and returns those results directly to the UI.

- Creates isolated temp workspaces per test run.
- Runs `cargo test --manifest-path programs/<program>/Cargo.toml --lib` against
  generated Anchor, Pinocchio, and Quasar projects.
- Persists command, logs, results, summary, duration, and final status in
  `TestRun`.
- Returns result items directly to the test panel so the UI does not wait for a
  missed WebSocket event.
- Still broadcasts test result/completion messages when WebSocket subscribers
  are connected.
- Enforces a five-minute test command timeout.
- Added local test-runner unit coverage.
- Added optional Surfpool Simnet runtime for generated tests:
  - Starts `surfpool start --ci --daemon --no-studio --no-tui --yes --offline`
    before the generated cargo test command.
  - Adds `--legacy-anchor-compatibility` for generated Anchor runs.
  - Exposes Smoke/Simnet selection in the editor tests panel.
- CLI project testing now uses Surfpool as the simnet setup when a project has
  `txtx.yml` or `.surfpool`; Anchor tests run with `anchor test
  --skip-local-validator` so the CLI does not silently spawn
  `solana-test-validator`. Anchor setup also passes
  `--legacy-anchor-compatibility` and discovered `Test.toml` files through
  `--anchor-test-config-path`.
- Added optional external parser smoke coverage for:
  - `/Users/singupallikartik/Developer/anchor-contract/vault`
  - `/Users/singupallikartik/Developer/anchor-contract/escrow`
  - `/Users/singupallikartik/Developer/anchor-contract/amm`
  - `/Users/singupallikartik/Developer/anchor-contract/calculator`
  - `/Users/singupallikartik/Developer/anchor-contract/marketplace`
  - `/Users/singupallikartik/Developer/anchor-contract/staking`
  - `/Users/singupallikartik/Developer/pinocchio-contract/vault`
  - `/Users/singupallikartik/Developer/pinocchio-contract/basic/hello-solana`
  - `/Users/singupallikartik/Developer/pinocchio-contract/basic/Counter`
  - `/Users/singupallikartik/Developer/pinocchio-contract/basic/account-data`
  - `/Users/singupallikartik/Developer/pinocchio-contract/basic/checking-accounts`
  - `/Users/singupallikartik/Developer/pinocchio-contract/token/escrow`
  - `/Users/singupallikartik/Developer/pinocchio-contract/token/transfer-token`

Follow-up hardening:

- Expand generated transaction assertions beyond the current Surfpool-backed
  command/runtime layer.
- Add Pinocchio/Mollusk-style generated tests where project dependencies allow.
- Add Quasar framework-native generated test fixtures.
- Use `../kit`/Solana Kit patterns for RPC, transaction simulation, and
  Surfpool-backed simnet workflows.
- Persist test artifacts when `SOLFLOW_KEEP_TEST_WORKDIR=1` or an artifact
  retention setting is enabled.

### 17. Compile-Backed Templates

Status: first production gate complete for checked-in templates. The repository
currently has checked-in template JSON for Token Vault and Token Escrow; both
now have a production regression gate that generates Anchor, Pinocchio, and
Quasar code and fails if generated Rust contains TODO/unimplemented placeholder
text.

- Token Vault checked-in template:
  - Anchor generation.
  - Pinocchio generation.
  - Quasar generation.
  - No codegen errors.
  - No TODO/unimplemented placeholder Rust.
- Token Escrow checked-in template:
  - Anchor generation.
  - Pinocchio generation.
  - Quasar generation.
  - No codegen errors.
  - No TODO/unimplemented placeholder Rust.

Missing advertised template fixtures still to add:

- Counter.
- Token mint/transfer standalone.
- PDA vault standalone.
- Multisig/authority.
- Oracle read.
- NFT mint/metadata.

For each new checked-in template:

- Anchor compile.
- Pinocchio compile.
- Quasar compile.
- CI failure if generated code contains TODOs for supported features.

Follow-up hardening:

- Move the broader script-only examples into checked-in template JSON or remove
  them from user-facing claims.
- Add optional toolchain compile jobs using the Phase 16 generated-project test
  runner where `cargo`, Anchor, and SBF toolchains are available.
- Add artifact output paths for generated template projects.

### 18. Deployment Key Migration

Status: first production migration pass complete. The app now has an explicit
dry-run-by-default operator script for migrating legacy plaintext deploy/program
keys into the encrypted `enc:v1:` payload format.

- Added `migrateStoredSecretKey()` helper that:
  - Reads legacy bs58 and encrypted payloads.
  - Encrypts only legacy plaintext values.
  - Verifies the public key is identical before/after encryption.
  - Leaves already encrypted values unchanged.
- Added `apps/web/scripts/migrate-deploy-keys.ts`.
  - Scans `User.deployerKeypair`.
  - Scans `Project.programKeypair`.
  - Scans `Deployment.programKeypair`.
  - Defaults to dry-run mode.
  - Requires `--write` before updating DB rows.
  - Uses compare-on-original-value updates to avoid racing concurrent writes.
  - Avoids logging secret material.
- Added app package script `migrate:deploy-keys`.
- Added crypto regression tests for legacy migration and encrypted no-op.

Follow-up hardening:

- Run the migration in staging and production with a DB backup.
- Add an audit command that fails CI/deploy if plaintext key rows remain.
- Reject plaintext writes after the production migration is complete.
- Add API response redaction tests for all key-bearing routes.

### 19. API Response Redaction Audit

Status: first Cloud/web audit pass complete. The highest-risk leak was Cloud
workflow/wallet responses because Cloud is where future n8n-style provider
credentials will keep growing.

- Confirmed web project/deploy/user responses select or strip:
  - `programKeypair`
  - `deployerKeypair`
  - deployment `programKeypair`
- Added shared Cloud public selects for:
  - Cloud wallets.
  - Cloud credentials.
  - Cloud workflows.
  - Cloud workflow versions.
- Fixed Cloud wallet delete to return only public wallet fields instead of the
  deleted row with encrypted key payloads.
- Fixed Cloud workflow list/get/create/update/delete/duplicate responses to use
  public selects.
- Fixed Cloud workflow `get` so nested `wallet` no longer includes encrypted key
  payload fields.
- Excluded workflow `webhookSecret` from public workflow responses.
- Added `findSecretResponseFields()` regression helper covering:
  - deploy/program keys.
  - encrypted wallet payloads.
  - encrypted credential payloads.
  - webhook secrets.
- Added Cloud redaction tests and a Cloud `test` script.

Follow-up hardening:

- Add the same redaction helper as a response assertion in development/test tRPC
  middleware.
- Add endpoint-level tests for web project/deploy routers and Cloud routers with
  mocked Prisma contexts.
- Extend node execution redaction to scan output/input snapshots before DB
  persistence, not only API response shapes.

## Phase 5 - Security And Reliability

### 20. CSP And Security Headers

Status: first pass complete.

- Added app-level CSP to web and cloud.
- Added frame protection, referrer policy, permissions policy, and content-type
  protection to web and cloud.
- Removed Google `next/font` build-time network dependency so production builds
  do not fail offline.
- Made web sitemap dynamic and build-safe so it no longer contacts the database
  during `next build`.
- Fixed Cloud signin Suspense boundary so `next build` can prerender safely.
- Added Cloud DeFi provider adapter tests for Birdeye price and Jupiter quote
  behavior.
- Verified with web/cloud typecheck, web/cloud production build, and root tests.

Remaining hardening:

- Add response-header assertions in app tests or smoke tests.
- Split CSP by environment once exact production wallet/script origins are
  finalized.

### 21. Rate Limits

Status: first pass complete.

- Web nonce, compile, and deploy limits are active.
- Added web and cloud auth POST limits.
- Added Cloud manual execution limits.
- Added Cloud workflow activation/deactivation limits.
- Added Cloud webhook trigger limits keyed by path and client IP.
- Added limiter tests for web and cloud.

Remaining hardening:

- Move limiter storage from in-memory maps to Redis for multi-instance
  production deployments.
- Add dedicated per-provider budgets for AI, Jupiter, price, and outbound
  webhook nodes inside the execution worker.

### 22. Webhook Security

Status: first pass complete.

- Added server-side webhook request body size limits.
- Added per-webhook-node `maxBodyKb` validation before execution queueing.
- Added optional replay protection on webhook trigger nodes.
- Replay protection requires `X-Webhook-Timestamp` and
  `X-Webhook-Signature`, where the signature is HMAC-SHA256 over
  `<timestamp>.<rawBody>` using the workflow webhook secret.
- Added Redis-backed replay-key tracking to reject duplicate signed payloads
  inside the replay window across app instances. The in-memory replay store is
  retained only for tests or explicit local fallback.
- Redacted secret-like webhook headers before persisting trigger data.
- Added structured JSON webhook logs for not-found, method rejection, auth
  rejection, replay rejection, body rejection, and queued events.
- Added webhook trigger UI fields for replay protection and per-node body size
  limits.
- Added webhook security tests for HMAC validation, stale timestamp rejection,
  replay rejection, and header redaction.

Remaining hardening:

- Add UI help text showing users exactly how to compute replay signatures.
- Add route-level integration tests around `/api/webhook/[path]`.

### 23. Observability

Status: first pass complete.

- Added structured JSON logs for execution worker lifecycle events.
- Added structured JSON logs for cron worker lifecycle events.
- Added `/api/health` for Cloud.
- Health report includes service status, timestamp, uptime, DB health, Redis
  health, worker status, and execution queue depth.
- Redis health uses the existing BullMQ execution queue connection.
- DB health uses a lightweight `SELECT 1`.
- Added health status aggregation tests.

Remaining hardening:

- Add authenticated/admin-only detailed health output if public health should be
  reduced to a simple status.
- Export health metrics to a real metrics backend.
- Add alert thresholds for queue depth and worker downtime.
- Trigger restore status.
- Error reporting integration.

### 24. Solana Audit Rules

Status: first pass complete.

Implement a framework-aware Solana audit engine for CLI, editor, generated
templates, and marketplace publishing. The first rule set should cover:

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

Completed:

- Existing `SOL-*` detectors now map to the product-facing `SW001-SW010`
  standard.
- Audit findings are annotated with matching `standardIds`.
- The audit package exports `SOLANA_SECURITY_STANDARD_RULES` and
  `getStandardIdsForAuditRule()`.
- Added tests proving all ten `SW` rules are covered by at least one detector.

Remaining hardening:

- Map each detector across Anchor, Pinocchio, and Quasar patterns.
- Show findings in the audit tab with source file/line, severity, explanation,
  and framework-specific fix guidance.
- Run the same audit in CLI parse/report output and template publish checks.
- Add fixture tests per rule and per framework.

## Phase 6 - Product Finish

### 25. Product Navigation And Positioning

Status: first pass complete.

- `solstudio.fun`: IDE/program builder.
- `cloud.solstudio.fun`: workflow automation.
- Shared account.
- Separate onboarding.
- Separate landing pages.
- Clear switching between products.

Completed:

- Added Cloud link to the main web landing navigation.
- Added Builder and Docs links to the Cloud app shell.
- Added `docs/PRODUCT_ARCHITECTURE.md` to preserve the intended product
  boundary and subdomain model.

Remaining hardening:

- Add a polished shared product switcher component used consistently in web,
  cloud, dashboard, and marketplace headers.
- Confirm deployed cookie/domain config for shared auth across all subdomains.

### 26. Docs

Status: first pass complete.

- CLI docs.
- Parser support matrix.
- Framework support matrix.
- Cloud workflow docs.
- Credential/security docs.
- Deployment docs.
- Plugin developer docs.

Completed:

- Added product architecture and launch-boundary docs.
- Existing docs include visual builder, CLI, Cloud, and learning paths.

Remaining hardening:

- Add webhook signature examples.
- Add health endpoint/runbook docs.
- Add framework-specific audit rule docs for Anchor, Pinocchio, and Quasar.

Additional completed hardening:

- Added `docs/CLOUD_SECURITY_RUNBOOK.md` with webhook HMAC examples, health
  endpoint behavior, and cloud secret-handling notes.
- Hardened public health output so production does not expose DB/Redis error
  detail unless `CLOUD_HEALTH_DETAILS_TOKEN` authorizes the request.
- Added TTL and max-entry limits to decrypted cloud wallet keypair caching.
- Unref'd long-lived server cleanup/heartbeat intervals.
- Fixed landing-page animation timeout retention.

### 27. Final Production Gate

Status: first pass mostly complete.

Before launch:

- Root typecheck passes.
- All package tests pass.
- Web and Cloud build.
- CLI tests pass.
- Parser fixture matrix passes.
- Template compile matrix passes.
- No plaintext secret writes.
- No mock production execution.
- Security headers active.
- Rate limits active.
- Worker restore tested.
- Cloud workflows tested on devnet with real wallet actions.

Latest verified locally:

- Root typecheck passes.
- Root package tests pass.
- Web production build passes.
- Cloud production build passes.
- CLI tests pass inside the root test suite.
- Parser fixture matrix passes inside the root test suite.
- Checked-in template production gate passes inside the root test suite.
- Security headers, rate limits, webhook replay protection, health endpoint, and
  API redaction tests are active.

Still requires environment-backed launch verification:

- Shared auth cookie behavior across final production subdomains.
- Worker restore against production Redis.
- Cloud workflows on devnet with real encrypted wallets and provider keys.
- Template compile matrix against real Solana toolchains when those toolchains
  are available in CI.
