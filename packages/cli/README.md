# SolStudio CLI

SolStudio CLI is the terminal surface for SolStudio. It has two jobs:

1. Work with local Solana projects without uploading source code.
2. Control SolStudio Cloud workflows from a terminal, agent, CI job, hosted Cloud,
   or self-hosted Cloud instance.

Version `0.1.5` adds the Cloud platform commands while keeping the existing local
visualizer, parser, audit, test, patch, and CI commands in the same `solstudio`
binary.

## Install

```bash
npm install -g @solstudio/cli
solstudio --version
solstudio --help
```

Requirements:

- Node.js `>=20`
- Docker, only for `solstudio cloud self-host ...` commands
- Your normal Solana, Anchor, Pinocchio, Quasar, or Surfpool toolchains for
  local compile/test flows

## Quick Start

Local project workflow:

```bash
solstudio init .
solstudio parse . --format summary
solstudio audit .
solstudio test .
solstudio view .
```

Hosted Cloud workflow:

```bash
solstudio cloud login --endpoint https://cloud.solstudio.fun --token sst_your_token
solstudio cloud whoami
solstudio cloud nodes list
solstudio cloud workflow list
```

Self-hosted Cloud workflow:

```bash
solstudio cloud self-host deploy ./solstudio-cloud --domain cloud.example.com --yes
solstudio cloud self-host status ./solstudio-cloud
solstudio cloud login --profile selfhost --endpoint https://cloud.example.com --token sst_your_token
solstudio cloud workflow list --profile selfhost
```

## Local Project Commands

Use these commands when the source of truth is a local Solana codebase.

```bash
solstudio init .
solstudio parse . --format json
solstudio parse . --format summary
solstudio idl ./target/idl/my_program.json
solstudio audit .
solstudio audit . --format markdown --output audit.md
solstudio audit . --format sarif --output solstudio-audit.sarif
solstudio audit . --generate-tests ./solstudio-generated-tests
solstudio test .
solstudio test . --json
solstudio doctor .
solstudio ci
solstudio ci --write
solstudio patch . --output solstudio.patch
solstudio view .
solstudio view . --host 127.0.0.1 --port 6139
```

What local mode does:

- Parses Anchor, Pinocchio, and Quasar projects into a visual graph.
- Shows programs, accounts, instructions, constraints, CPIs, events, errors, and
  tests.
- Opens a local browser visualizer from the CLI package.
- Runs framework-aware test/build checks.
- Produces audit summaries, JSON, Markdown, SARIF, and optional generated tests.
- Keeps local project metadata under `.solstudio/`.

Supported framework defaults:

| Framework | Build/test behavior |
| --- | --- |
| Anchor | `anchor build`, `anchor test --skip-local-validator` |
| Pinocchio | `cargo build-sbf`, `cargo test` |
| Quasar | `cargo build-sbf`, `cargo test` |
| Surfpool projects | Uses Surfpool when `txtx.yml` or `.surfpool` is present |

`solstudio audit` exits with:

- `0` when no findings are detected
- `1` when findings are detected
- `2` for tool or usage errors

## Cloud CLI

Use `solstudio cloud` when the source of truth is SolStudio Cloud, not a local
Rust project. The same commands work against hosted Cloud and self-hosted Cloud
as long as the endpoint exposes the SolStudio Cloud CLI API.

Cloud profiles are stored at:

```text
~/.solstudio/cloud.json
```

On supported filesystems the file is written with mode `0600`. Tokens are shown
redacted in profile lists.

### Login and Profiles

```bash
solstudio cloud login --endpoint https://cloud.solstudio.fun --token sst_your_token
solstudio cloud login --profile prod --endpoint https://cloud.solstudio.fun --token sst_prod_token
solstudio cloud login --profile local --endpoint http://localhost:3001 --token sst_local_token

solstudio cloud profile list
solstudio cloud profile use prod
solstudio cloud profile set prod --endpoint https://new-cloud.example.com --active
solstudio cloud logout prod
```

You can also pass the token with an environment variable:

```bash
export SOLSTUDIO_CLOUD_TOKEN=sst_your_token
solstudio cloud login --endpoint https://cloud.solstudio.fun
```

### Cloud Status

```bash
solstudio cloud whoami
solstudio cloud status
solstudio cloud nodes list
solstudio cloud nodes list --json
```

### Workflows

Create a workflow from a JSON graph:

```bash
solstudio cloud workflow create \
  --name "SOL price alert" \
  --description "Check SOL price and route alerts" \
  --definition workflow.json \
  --tag trading \
  --tag alert
```

Manage workflows:

```bash
solstudio cloud workflow list
solstudio cloud workflow list --json
solstudio cloud workflow get <workflow-id>
solstudio cloud workflow update <workflow-id> --name "New name"
solstudio cloud workflow update <workflow-id> --definition workflow.json
solstudio cloud workflow activate <workflow-id>
solstudio cloud workflow deactivate <workflow-id>
solstudio cloud workflow run <workflow-id>
solstudio cloud workflow run <workflow-id> --data payload.json
solstudio cloud workflow export <workflow-id> --out workflow-export.json
solstudio cloud workflow import workflow-export.json --name "Imported workflow"
solstudio cloud workflow delete <workflow-id> --yes
```

Minimal workflow definition shape:

```json
{
  "nodes": [
    {
      "id": "manual",
      "type": "trigger:manual",
      "position": { "x": 0, "y": 0 },
      "data": { "label": "Manual trigger" }
    }
  ],
  "edges": []
}
```

Use `solstudio cloud nodes list --json` before generating workflow JSON from an
agent so node types and data fields match the active server.

### Executions

```bash
solstudio cloud execution list
solstudio cloud execution list --workflow <workflow-id>
solstudio cloud execution list --workflow <workflow-id> --limit 10
solstudio cloud execution get <execution-id>
```

### Credentials

Credentials are encrypted by the Cloud server. Store provider keys there instead
of writing secrets into workflow JSON.

```bash
solstudio cloud credential list
solstudio cloud credential create --label helius --type helius --set apiKey=...
solstudio cloud credential create --label webhook --type webhook --data credential.json
solstudio cloud credential delete <credential-id> --yes
```

### Wallets

Cloud wallets are encrypted by the Cloud server and can be used by wallet-backed
workflow nodes.

```bash
solstudio cloud wallet list
solstudio cloud wallet create --label ops --network devnet
solstudio cloud wallet create --label treasury --network mainnet
solstudio cloud wallet delete <wallet-id> --yes
```

## Self-Hosted Cloud

Self-host mode creates a Cloud-only stack. It does not run the main SolStudio IDE
or local visualizer. The generated stack contains:

- SolStudio Cloud app
- Cloud worker
- Database sync job
- Postgres
- Redis

One-command deploy:

```bash
solstudio cloud self-host deploy ./solstudio-cloud --domain cloud.example.com --yes
```

What deploy does:

1. Creates `docker-compose.yml`, `.env.example`, `.env`, and `README.md`.
2. Generates non-placeholder secrets for `AUTH_SECRET`,
   `ENCRYPTION_MASTER_KEY`, and `CLOUD_HEALTH_DETAILS_TOKEN`.
3. Validates required env values.
4. Runs Docker Compose pull/up/status unless `--dry-run` is used.

Self-host commands:

```bash
solstudio cloud self-host init ./solstudio-cloud --domain cloud.example.com
solstudio cloud self-host check ./solstudio-cloud
solstudio cloud self-host deploy ./solstudio-cloud --domain cloud.example.com --yes
solstudio cloud self-host deploy ./solstudio-cloud --domain cloud.example.com --dry-run
solstudio cloud self-host status ./solstudio-cloud
solstudio cloud self-host logs ./solstudio-cloud --tail 100
solstudio cloud self-host logs ./solstudio-cloud --follow
```

Use a custom image:

```bash
solstudio cloud self-host deploy ./solstudio-cloud \
  --domain cloud.example.com \
  --image registry.example.com/solstudio-cloud:0.1.5 \
  --yes
```

The default image reference is:

```text
ghcr.io/skartik-sk/solstudio-cloud:latest
```

Important self-host env keys:

| Key | Purpose |
| --- | --- |
| `AUTH_URL` | Public Cloud URL used by auth |
| `NEXT_PUBLIC_APP_URL` | Public Cloud app URL |
| `NEXT_PUBLIC_CLOUD_URL` | Public Cloud URL used by the frontend |
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `AUTH_SECRET` | Auth/session signing secret |
| `ENCRYPTION_MASTER_KEY` | Encrypts Cloud wallets and credentials |
| `CLOUD_HEALTH_DETAILS_TOKEN` | Optional detailed health endpoint token |

Do not lose `ENCRYPTION_MASTER_KEY`. Existing encrypted wallets and credentials
cannot be recovered without it.

## Agent Usage

Print the built-in agent instructions:

```bash
solstudio cloud agent
```

Recommended agent flow:

```bash
solstudio cloud whoami
solstudio cloud nodes list --json
solstudio cloud workflow create --name "Agent workflow" --definition workflow.json
solstudio cloud workflow run <workflow-id> --data payload.json
solstudio cloud execution get <execution-id>
```

Agent rules:

- Verify the active profile before changing workflows.
- Query node types from the server before creating graph JSON.
- Store API keys with `cloud credential create`.
- Do not put secrets into workflow definitions.
- Use `--profile` when switching between hosted and self-hosted Cloud.
- Use `workflow export` before large edits if you need a rollback file.

## Config and State Locations

| Path | Used by | Notes |
| --- | --- | --- |
| `.solstudio/` | Local project commands | Project-local visualizer/parser metadata |
| `~/.solstudio/cloud.json` | Cloud commands | Hosted/self-hosted endpoint profiles and tokens |
| `./solstudio-cloud/.env` | Self-host stack | Generated deployment env, keep private |
| `./solstudio-cloud/docker-compose.yml` | Self-host stack | Cloud-only Docker Compose stack |

## Security Notes

- Local `parse`, `audit`, `test`, and `view` commands do not require uploading
  source code to SolStudio Cloud.
- Cloud commands use bearer tokens against `/api/cli/v1`.
- Cloud API tokens are stored server-side as hashes.
- The local CLI stores Cloud tokens in `~/.solstudio/cloud.json`; protect that
  file like any other developer credential.
- Self-hosted credentials and wallets depend on `ENCRYPTION_MASTER_KEY`.

## Troubleshooting

No Cloud profile:

```bash
solstudio cloud login --endpoint https://cloud.solstudio.fun --token sst_your_token
```

Wrong endpoint:

```bash
solstudio cloud profile list
solstudio cloud profile set default --endpoint https://cloud.example.com --active
```

Self-host env is incomplete:

```bash
solstudio cloud self-host check ./solstudio-cloud
```

Docker stack is not healthy:

```bash
solstudio cloud self-host status ./solstudio-cloud
solstudio cloud self-host logs ./solstudio-cloud --tail 200
```

Need a local visual graph:

```bash
solstudio view .
```

Need machine-readable output:

```bash
solstudio parse . --format json
solstudio audit . --format sarif --output solstudio-audit.sarif
solstudio cloud workflow list --json
solstudio cloud nodes list --json
```
