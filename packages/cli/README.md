# SolStudio CLI

Local CLI for parsing Anchor, Pinocchio, and Quasar Solana projects into a
visual graph, opening the local SolStudio visualizer, generating code, auditing,
and running framework-aware build/test commands.

## Install

```bash
npm install -g solstudio
```

## Use

```bash
solstudio init .
solstudio parse . --format summary
solstudio view .
```

The local visualizer keeps source edits explicit. Compile/test/deploy actions
use the detected framework adapter:

- Anchor: `anchor build`, `anchor test --skip-local-validator`
- Pinocchio: `cargo build-sbf`, `cargo test`
- Quasar: `cargo build-sbf`, `cargo test`

When a project has `txtx.yml` or `.surfpool`, test runs start Surfpool as the
simnet setup before running the framework test command.

## Publish Checklist

```bash
bun install
bun --cwd packages/cli run build:standalone
bun --cwd packages/cli run publish:check
npm login
npm publish packages/cli
```

Use `npm view solstudio version` before publishing to confirm the next version
number is free.
