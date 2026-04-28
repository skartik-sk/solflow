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
```

`solstudio audit` exits `0` when no findings are detected, `1` when findings
are detected, and `2` for tool or usage errors.

SolStudio is designed for builders who want a fast local view of how a Solana
project is structured before they compile, test, audit, or extend it.
