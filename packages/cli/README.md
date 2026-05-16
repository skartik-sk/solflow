# SolStudio CLI

SolStudio CLI turns local Solana projects into a visual workspace for parsing,
inspecting, auditing, generating, and testing programs across Anchor, Pinocchio,
and Quasar.

## Install

```bash
npm install -g @solstudio/cli
```

## Use

```bash
solstudio init .
solstudio parse . --format summary
solstudio audit .
solstudio audit . --format sarif --output solstudio-audit.sarif
solstudio audit . --generate-tests ./solstudio-generated-tests
solstudio test .
solstudio doctor .
solstudio patch . --output solstudio.patch
solstudio view .
solstudio cloud login --endpoint https://cloud.solstudio.fun --token sst_your_token
solstudio cloud workflow list
solstudio cloud self-host deploy ./solstudio-cloud --domain cloud.example.com
```

## What It Does

- Parses Solana codebases into a visual graph of programs, accounts, instructions,
  constraints, CPIs, events, errors, and tests.
- Opens a local visualizer so teams can inspect project structure without
  uploading source code.
- Detects Anchor, Pinocchio, and Quasar layouts and uses the matching framework
  adapter for build and test flows.
- Supports IDL import, code generation, audit checks, and framework-aware
  project initialization.
- Uses Surfpool automatically for compatible local simnet test setups when the
  project includes `txtx.yml` or `.surfpool`.
- Controls SolStudio Cloud workflows from the terminal through `solstudio cloud`
  without mixing hosted automation state into local `.solstudio` project files.

## Supported Frameworks

- Anchor: `anchor build`, `anchor test --skip-local-validator`
- Pinocchio: `cargo build-sbf`, `cargo test`
- Quasar: `cargo build-sbf`, `cargo test`

## Commands

```bash
solstudio init .
solstudio parse . --format json
solstudio parse . --format summary
solstudio audit . --format summary
solstudio audit . --format json
solstudio audit . --format markdown --output audit.md
solstudio audit . --format sarif --output solstudio-audit.sarif
solstudio audit . --generate-tests ./solstudio-generated-tests
solstudio test .
solstudio test . --json
solstudio doctor .
solstudio ci
solstudio ci --write
solstudio patch . --output solstudio.patch
solstudio idl ./target/idl/my_program.json
solstudio view .
solstudio view . --host 127.0.0.1 --port 6139
solstudio cloud login --endpoint https://cloud.solstudio.fun --token sst_your_token
solstudio cloud whoami
solstudio cloud status
solstudio cloud nodes list
solstudio cloud workflow list
solstudio cloud workflow create --name "SOL price alert" --definition workflow.json
solstudio cloud workflow run <workflow-id> --data payload.json
solstudio cloud execution list --workflow <workflow-id>
solstudio cloud credential create --label helius --type helius --set apiKey=...
solstudio cloud wallet list
solstudio cloud wallet create --label ops --network devnet
solstudio cloud profile set selfhost --endpoint https://203.0.113.10 --active
solstudio cloud self-host deploy ./solstudio-cloud --domain cloud.example.com
```

`solstudio audit` exits `0` when no findings are detected, `1` when findings
are detected, and `2` for tool or usage errors.

SolStudio is designed for builders who want a fast local view of how a Solana
project is structured before they compile, test, audit, or extend it.

## Cloud CLI

Use `solstudio cloud` when the source of truth is SolStudio Cloud, not a local
Rust project. The CLI supports hosted and self-hosted endpoints through profiles:

```bash
solstudio cloud login --endpoint https://cloud.solstudio.fun --token sst_your_token
solstudio cloud profile list
solstudio cloud workflow list
```

Cloud profiles are stored in `~/.solstudio/cloud.json` with file mode `0600` on
supported systems. The local visualizer still uses project-local `.solstudio/`
metadata.

To create a Cloud-only self-host kit:

```bash
solstudio cloud self-host deploy ./solstudio-cloud --domain cloud.example.com
```

That writes a `docker-compose.yml`, `.env.example`, non-placeholder `.env`, and
README for the Cloud app, worker, database sync job, Postgres, and Redis only.
It validates required env values before running Docker Compose.

Useful self-host operations:

```bash
solstudio cloud self-host check ./solstudio-cloud
solstudio cloud self-host status ./solstudio-cloud
solstudio cloud self-host logs ./solstudio-cloud --tail 100
```

To switch a saved CLI profile from hosted Cloud to a self-hosted URL or IP:

```bash
solstudio cloud profile set selfhost --endpoint https://203.0.113.10 --active
```

The default self-host image is `ghcr.io/skartik-sk/solstudio-cloud:latest`.
Use `--image registry.example.com/solstudio-cloud:tag` when you want the CLI to
deploy a custom image from your own registry.
