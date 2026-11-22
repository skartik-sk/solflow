# CLI Reference

The SolStudio CLI is the local-project surface. Use it when the source of truth is on your machine: an Anchor, Pinocchio, Quasar, or unknown Solana project, a single Rust file, or an IDL JSON file.

It also includes `solstudio cloud` for the Cloud workflow platform. Use that namespace when the source of truth is hosted or self-hosted SolStudio Cloud: workflows, executions, credentials, node registry, and Cloud-only self-host setup.

### Install

```bash
npm install -g @solstudio/cli
```

> **Requires** Node.js 20+ (or Bun). After install the `solstudio` binary is available globally.

Want practice instead of reference reading? Open the [CLI Learning Path](/docs/learn/cli) and learn the commands with short exercises.

---

## What The CLI Does

| Job                             | Command           | Result                                                |
| ------------------------------- | ----------------- | ----------------------------------------------------- |
| Create local SolStudio metadata | `solstudio init`   | Writes `.solstudio/config.json`, optionally scaffolds  |
| Open a local visualizer         | `solstudio view`   | Starts a loopback-only server and loads the graph UI   |
| Parse Rust source               | `solstudio parse`  | Emits nodes, edges, stats, warnings, and parse report  |
| Convert an IDL                  | `solstudio idl`    | Emits flow nodes and edges from IDL JSON               |
| Static audit                    | `solstudio audit`  | Summary, JSON, Markdown, or SARIF findings             |
| Run framework tests             | `solstudio test`   | Runs the detected Anchor/Pinocchio/Quasar test command |
| Check local tooling             | `solstudio doctor` | Reports Rust, Solana, Anchor, Surfpool availability    |
| GitHub Actions workflow         | `solstudio ci`     | Prints or writes `.github/workflows/solstudio.yml`     |
| Preview generated code          | `solstudio patch`  | A unified diff; never writes source files              |

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
| `-f, --framework <framework>` | Force `anchor`, `pinocchio`, or `quasar`. Any other value is an error. On an initialized project this updates the saved framework |
| `--scaffold`                  | Create the directory and a minimal buildable program for the chosen framework (default `anchor`) if it has no Rust project yet |

Examples:

```bash
bun run solstudio init .
bun run solstudio init . --framework anchor
bun run solstudio init ./new-program --scaffold
bun run solstudio init ./new-pinocchio --scaffold --framework pinocchio
```

`--scaffold` writes a workspace `Cargo.toml`, `programs/<name>/` (crate `Cargo.toml` and `src/`), `Anchor.toml` for Anchor, and a fresh program keypair in `target/deploy/<name>-keypair.json` whose address is used in `declare_id!`. Existing files are never overwritten.

Use `init` when:

- You want framework detection written before opening the visualizer.
- You want the CLI to remember the project mode.
- You want a tiny scaffold for an empty folder.

If the project is already initialized, `init` prints the existing framework, mode, and config path. Pass `--framework` to change the saved framework.

## `view`

Start the local server and open the visualizer.

```bash
bun run solstudio view [path]
```

| Option              | Meaning                                                |
| ------------------- | ------------------------------------------------------ |
| `-p, --port <port>` | Start the server on a specific port. Default is `6139` |
| `--host <host>`     | Loopback address to bind: `127.0.0.1` (default), `localhost`, or `::1`. Other addresses are refused |
| `--no-open`         | Start the server without opening a browser             |

Examples:

```bash
bun run solstudio view .
bun run solstudio view . --port 6140
bun run solstudio view . --no-open
```

`view` will create `.solstudio/config.json` if the project has not been initialized. When the server starts, it attempts an initial parse if no graph is saved yet, then serves the local UI.

The server only listens on loopback and prints a URL like `http://127.0.0.1:6139/#token=...`. The token is new for every run; the UI sends it with every API call, and requests without it, from another Host name, or from another website's origin are refused. Open the printed URL rather than typing the port by hand, and don't share it.

**Sync to source.** The UI's Sync button shows a diff of every file the generated code would create or overwrite and writes nothing until you confirm. Overwritten files are copied to `.solstudio/backups/<timestamp>/` first. Generated code replaces hand-written handler bodies in the files it touches, so review the diff.

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

## `audit`

Run the static audit and deterministic stress checks.

```bash
solstudio audit [path]
solstudio audit . --format sarif --output solstudio-audit.sarif
solstudio audit . --generate-tests ./solstudio-generated-tests
```

| Option                           | Meaning                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `-f, --format <format>`          | `summary` (default), `json`, `markdown`, or `sarif`                     |
| `-o, --output <file>`            | Write to a file instead of stdout                                       |
| `--generate-tests <dir>`         | Write smoke-test scaffolds: a stress-case table plus tests that check it. They do not call your program yet; turn each case into a real instruction test |
| `--test-framework <framework>`   | `anchor`, `pinocchio`, `quasar`, `litesvm`, or `mollusk` for generated tests |
| `--include-tests` etc.           | Same coverage flags as `parse`                                          |

SARIF results use file paths relative to the current directory (or the project root when it is outside it) with line numbers, so GitHub code scanning can annotate the right lines. Exit codes: `0` no findings, `1` findings, `2` usage or tool error.

## `test`

Run the detected framework's test command (`anchor test`, or `cargo test` for Pinocchio and Quasar). On Linux, Anchor projects start Surfpool first unless you pass `--no-setup`.

```bash
solstudio test .
solstudio test . --json
solstudio test . --no-setup
```

If a required tool (`anchor`, `cargo`, `solana`, `surfpool`) is missing, the command exits with code `127` and prints where to install it.

## `doctor`

Check that Rust, the Solana CLI, Anchor, and Surfpool are installed, and what framework the project uses.

```bash
solstudio doctor .
solstudio doctor . --json
```

## `ci`

Print or write a GitHub Actions workflow that installs Rust, the Solana CLI and Anchor, parses and audits the project, uploads SARIF to code scanning, starts `solana-test-validator` for Anchor projects, and runs `solstudio test . --no-setup`. It uses `permissions: contents: read, security-events: write` and pins the CLI version.

```bash
solstudio ci                 # print
solstudio ci --write         # .github/workflows/solstudio.yml
solstudio ci --output ci.yml
```

The workflow assumes the Solana project is at the repository root.

## `patch`

Generate a unified diff of what SolStudio codegen would produce for the project, mapped onto the crate that exists on disk (a workspace member under `programs/` or a crate at the root). It never writes source files.

```bash
solstudio patch . --output solstudio.patch
solstudio patch ./programs/vault/src/lib.rs
git apply --check solstudio.patch
```

| Option                        | Meaning                                                  |
| ----------------------------- | -------------------------------------------------------- |
| `-f, --framework <framework>` | Target `anchor`, `pinocchio`, or `quasar` (default: detected) |
| `-o, --output <file>`         | Write the patch to a file                                |

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
solstudio cloud self-host deploy ./solstudio-cloud --domain cloud.example.com --yes
solstudio cloud self-host check ./solstudio-cloud
solstudio cloud self-host status ./solstudio-cloud
solstudio cloud self-host logs ./solstudio-cloud --tail 100
```

The default self-host image is `ghcr.io/skartik-sk/solstudio-cloud:latest`. Pass `--image` if you mirror the image to another registry.

`self-host deploy` asks before starting Docker; pass `--yes` in scripts (without a terminal and without `--yes` it refuses). The generated `.env` is written with mode `0600` and contains a random `POSTGRES_PASSWORD`, which `docker-compose.yml` reads. If you created a stack with an older CLI, add `POSTGRES_PASSWORD=solstudio` (the old fixed password) to its `.env` before redeploying, then rotate it.

Create CLI tokens in Cloud under **CLI tokens** (`/settings`): name it, pick an expiry, copy it once, and revoke it there when you no longer need it. Store it with `cloud login`. Tokens are stored server-side as SHA-256 hashes.

## Common Fixes

| Problem                                  | Fix                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Port already in use                      | Run `solstudio view . --port 6140`                                      |
| Invalid port                             | Use a number from `1` to `65535`                                        |
| Framework detected as unknown            | Run `solstudio init . --framework anchor` (or `pinocchio` / `quasar`); this also updates an existing config |
| Visualizer says "Missing or invalid session token" | Open the exact URL `solstudio view` printed (it includes `#token=...`) |
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
