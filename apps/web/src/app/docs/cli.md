# CLI Reference

The SolStudio CLI is the local-project surface. Use it when the source of truth is on your machine: an Anchor, Pinocchio, Quasar, or unknown Solana project, a single Rust file, or an IDL JSON file.

It also includes `solstudio cloud` for the Cloud workflow platform. Use that namespace when the source of truth is hosted or self-hosted SolStudio Cloud: workflows, executions, credentials, node registry, and Cloud-only self-host setup.

### Install

```bash
npm install -g @solstudio/cli
```

> **Requires** Node.js 18+ or Bun. After install the `solstudio` binary is available globally.

Want practice instead of reference reading? Open the [CLI Learning Path](/docs/learn/cli) and learn the commands with short exercises.

---

## What The CLI Does

| Job                             | Command           | Result                                                |
| ------------------------------- | ----------------- | ----------------------------------------------------- |
| Create local SolStudio metadata | `solstudio init`  | Writes `.solstudio/config.json`                       |
| Open a local visualizer         | `solstudio view`  | Starts a local server and loads the graph UI          |
| Parse Rust source               | `solstudio parse` | Emits nodes, edges, stats, warnings, and parse report |
| Convert an IDL                  | `solstudio idl`   | Emits flow nodes and edges from IDL JSON              |

In this repo the examples use `bun run solstudio`. If the CLI is installed as a binary, use the same arguments after `solstudio`.

## Recommended Local Flow

Use this sequence when you are opening an existing Solana codebase for the first time:

```bash
bun run solstudio init .
bun run solstudio parse . --format summary
bun run solstudio view .
```

For Cloud control:

```bash
solstudio cloud login --endpoint https://cloud.solstudio.fun --token sst_your_token
solstudio cloud whoami
solstudio cloud workflow list
solstudio cloud nodes list
```

Use this sequence when you only have an IDL file:

```bash
bun run solstudio idl ./target/idl/vault.json --format summary
bun run solstudio idl ./target/idl/vault.json --output vault-flow.json
```

## Project Files

The CLI stores local metadata in `.solstudio`.

| File                      | Created by                   | Purpose                                                  |
| ------------------------- | ---------------------------- | -------------------------------------------------------- |
| `.solstudio/config.json`  | `init` or `view`             | Project name, detected framework, mode, and default port |
| `.solstudio/project.json` | Local server parse/save flow | Last visual graph for the local project                  |
| `~/.solstudio/cloud.json` | `cloud login`                | Hosted/self-hosted Cloud endpoint profiles and tokens    |

The config shape is:

```json
{
  "name": "my-program",
  "framework": "anchor",
  "mode": "rust",
  "port": 6139
}
```

`framework` can be `anchor`, `pinocchio`, `quasar`, or `unknown`. `mode` is `rust` when the CLI can read source structure and `editor` when the project is unknown or scaffolded visually.

## `init`

Initialize a directory for local SolStudio use.

```bash
bun run solstudio init [path]
```

| Option                        | Meaning                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `-f, --framework <framework>` | Force `anchor`, `pinocchio`, or `quasar` when detection is not enough            |
| `--scaffold`                  | Create the directory and a minimal Anchor-style `src/lib.rs` if no source exists |

Examples:

```bash
bun run solstudio init .
bun run solstudio init . --framework anchor
bun run solstudio init ./new-program --scaffold
```

Use `init` when:

- You want framework detection written before opening the visualizer.
- You want the CLI to remember the project mode.
- You want a tiny scaffold for an empty folder.

If the project is already initialized, `init` prints the existing framework, mode, and config path instead of overwriting the config.

## `view`

Start the local server and open the visualizer.

```bash
bun run solstudio view [path]
```

| Option              | Meaning                                                |
| ------------------- | ------------------------------------------------------ |
| `-p, --port <port>` | Start the server on a specific port. Default is `6139` |
| `--no-open`         | Start the server without opening a browser             |

Examples:

```bash
bun run solstudio view .
bun run solstudio view . --port 6140
bun run solstudio view . --no-open
```

`view` will create `.solstudio/config.json` if the project has not been initialized. When the server starts, it attempts an initial parse if no graph is saved yet, then serves the local UI.

Use `view` when:

- You want to inspect local Rust visually.
- You want the graph to update after parsing local files.
- You want a local-only workflow without uploading the project to the hosted app.

## `parse`

Parse a project directory or one `.rs` file.

```bash
bun run solstudio parse [path]
```

| Option                  | Meaning                                            |
| ----------------------- | -------------------------------------------------- |
| `-f, --format <format>` | `json`, `ir`, or `summary`. Default is `json`      |
| `-o, --output <file>`   | Write output to a file instead of stdout           |
| `--include-tests`       | Include `tests/` directories                       |
| `--include-examples`    | Include `examples/` directories                    |
| `--include-benches`     | Include `benches/` directories                     |
| `--include-migrations`  | Include `migration/` and `migrations/` directories |
| `--include-hidden`      | Include hidden directories                         |

Examples:

```bash
bun run solstudio parse .
bun run solstudio parse ./programs/vault/src/lib.rs
bun run solstudio parse . --format summary
bun run solstudio parse . --format json --output flow.json
bun run solstudio parse . --format ir --output flow-ir.json
```

Output formats:

| Format    | Contains                                        | Use when                                      |
| --------- | ----------------------------------------------- | --------------------------------------------- |
| `json`    | Nodes, edges, stats, warnings, and parse report | You want visual graph data                    |
| `ir`      | Canonical SolStudio intermediate representation | You are debugging codegen or building tooling |
| `summary` | Counts, framework, confidence, files, warnings  | You want a quick health check                 |

`summary` prints instruction, account, state, error, event, logic, node, and edge counts. It also reports parser confidence, files parsed, files skipped, unsupported constructs, and warnings.

## `idl`

Convert an IDL JSON file into flow data.

```bash
bun run solstudio idl <path>
```

| Option                  | Meaning                                  |
| ----------------------- | ---------------------------------------- |
| `-f, --format <format>` | `json` or `summary`. Default is `json`   |
| `-o, --output <file>`   | Write output to a file instead of stdout |

Examples:

```bash
bun run solstudio idl ./target/idl/vault.json
bun run solstudio idl ./target/idl/vault.json --format summary
bun run solstudio idl ./target/idl/vault.json --output vault-flow.json
```

Use `idl` when:

- You have an Anchor, Codama, Kinobi, or compatible Solana IDL.
- You want instructions, accounts, errors, and events as graph nodes.
- You do not have the original Rust source.

## Choosing The Right Command

| Situation                             | Use                                                   |
| ------------------------------------- | ----------------------------------------------------- |
| Existing Rust project, first setup    | `solstudio init .`                                    |
| Existing Rust project, open UI        | `solstudio view .`                                    |
| Existing Rust project, inspect counts | `solstudio parse . --format summary`                  |
| Single Rust file                      | `solstudio parse ./path/to/lib.rs`                    |
| IDL file only                         | `solstudio idl ./target/idl/name.json`                |
| Need graph JSON for another tool      | `solstudio parse . --format json --output flow.json`  |
| Need canonical IR                     | `solstudio parse . --format ir --output flow-ir.json` |
| Need to control Cloud workflows       | `solstudio cloud workflow ...`                        |
| Need to self-host the Cloud app       | `solstudio cloud self-host deploy`                    |

## `cloud`

Control hosted or self-hosted SolStudio Cloud from the terminal.

```bash
solstudio cloud login --endpoint https://cloud.solstudio.fun --token sst_your_token
solstudio cloud whoami
solstudio cloud status
solstudio cloud workflow list
solstudio cloud workflow create --name "SOL price alert" --definition workflow.json
solstudio cloud workflow run <workflow-id> --data payload.json
solstudio cloud execution list --workflow <workflow-id>
solstudio cloud credential create --label helius --type helius --set apiKey=...
solstudio cloud wallet list
solstudio cloud wallet create --label ops --network devnet
solstudio cloud nodes list
solstudio cloud profile set selfhost --endpoint https://203.0.113.10 --active
```

Profiles let one machine control hosted and self-hosted instances:

```bash
solstudio cloud login --profile hosted --endpoint https://cloud.solstudio.fun --token sst_hosted
solstudio cloud login --profile local --endpoint http://localhost:3001 --token sst_local
solstudio cloud profile use local
```

Self-host Cloud without the main IDE:

```bash
solstudio cloud self-host deploy ./solstudio-cloud --domain cloud.example.com
solstudio cloud self-host check ./solstudio-cloud
solstudio cloud self-host status ./solstudio-cloud
solstudio cloud self-host logs ./solstudio-cloud --tail 100
```

The default self-host image is `ghcr.io/skartik-sk/solstudio-cloud:latest`. Pass `--image` if you mirror the image to another registry.

Create API tokens from the Cloud app session with `POST /api/cli/token`, then store the returned token once with `cloud login`. New tokens are stored server-side as SHA-256 hashes.

## Common Fixes

| Problem                                  | Fix                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Port already in use                      | Run `solstudio view . --port 6140`                                      |
| Invalid port                             | Use a number from `1` to `65535`                                        |
| Framework detected as unknown            | Run `solstudio init . --framework anchor` or choose the right framework |
| Directory does not exist                 | Use `solstudio init ./name --scaffold` if you want it created           |
| Parse output is too large                | Run `solstudio parse . --format summary` first                          |
| IDL warning about missing instructions   | Confirm the file is a Solana IDL and not client config JSON             |
| Tests or examples are missing from parse | Add `--include-tests` or `--include-examples`                           |

## CLI Versus Other Surfaces

| Need                                                      | Use                                                   |
| --------------------------------------------------------- | ----------------------------------------------------- |
| Build a new program visually                              | [Visual Builder](/docs/visual-editor)                 |
| Inspect or visualize local source                         | CLI                                                   |
| Convert IDL to a graph                                    | CLI                                                   |
| Generate or inspect codegen behavior                      | CLI plus [Code Generation Guide](/docs/codegen-guide) |
| Run scheduled workflows, webhooks, wallets, or AI actions | [Cloud](/docs/cloud)                                  |
