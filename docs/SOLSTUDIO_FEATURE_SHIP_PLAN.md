# SolStudio Feature Ship Plan

This file is the single source of truth for the next product batch. Do not ship
piecemeal releases from this list; finish a coherent batch, verify it, then make
one commit.

## Batch A - Safety Workflow

1. Audit -> Generate Tests
   - Convert deterministic stress cases into runnable generated test harnesses.
   - Support Anchor TypeScript, Pinocchio Rust, Quasar Rust, and future LiteSVM
     or Mollusk harnesses.
   - Expose this from CLI and the web Audit tab.

2. Audit -> Fix Suggestion
   - Every finding should show an exact, actionable fix.
   - Prefer Apply to graph for deterministic fixes.
   - Defer direct source patches until round-trip patch safety is complete.

3. Real Test Runner UX
   - Test results must show runner, runtime, command, setup command, duration,
     status, logs, warnings, errors, and a copyable repro command.
   - The UI should make cached compiler-container runs versus cold runs obvious.

4. CI Mode
   - `solstudio audit . --format sarif`
   - `solstudio parse .`
   - `solstudio test .`
   - Provide a GitHub Actions workflow template users can copy or generate.

5. Round-Trip Safety
   - Existing source -> visual graph -> edit -> minimal patch.
   - Default behavior must never overwrite a source tree silently.
   - Source writes require a preview/dry-run first.

6. Audit Report Export
   - JSON, Markdown, and SARIF exports.
   - Include severity, rule IDs, standard IDs, node target, recommendation,
     fix suggestion, and generated stress cases.

## Batch B - Template Trust Loop

7. One-Click Working Templates
   - Each template should show preview graph, generated code, compile status,
     audit score, test status, and deploy notes.

8. Template Fork Flow
   - Use Template creates a real project with defaults and immediately offers
     Compile, Audit, and Test.

9. Framework Coverage Dashboard
   - Show honest Anchor, Pinocchio, and Quasar support for parsing, codegen,
     compile, tests, deploy, audit rules, and templates.

10. Local CLI Doctor
   - `solstudio doctor`
   - Check Node, Bun, Rust, Cargo, Solana, Anchor, cargo-build-sbf, Surfpool,
     Docker, project framework, and parser coverage flags.
   - Print exact fix commands for missing tools.

## Batch C - Cloud Operator Safety

11. Cloud Safety Controls
   - Wallet spend limits.
   - Simulation required before signing.
   - Manual approval node.
   - Max slippage guard.
   - Allowed token mint list.
   - Webhook destination allowlist.

12. Cloud Run Replay
   - Replay any execution with the same trigger data and definition snapshot.
   - Replay should show diff against the original node outputs.

## Batch D - Public Sharing And Social Preview

13. Public Share Link
   - Share read-only visual graphs and audit reports without exposing user
     secrets, wallets, private keys, environment values, or credentials.
   - Public pages must use sanitized flow data only.

14. Social Preview Images
   - Every public landing, marketplace listing, and read-only shared graph must
     emit correct Open Graph and Twitter metadata.
   - Use absolute image URLs, `summary_large_image`, 1200x630 dimensions, and
     dynamic share images for graph/report pages.
   - Fix the generic site preview so links pasted into X/Twitter, Discord, and
     Telegram show a professional SolStudio card.
