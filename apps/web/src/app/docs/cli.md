# CLI

The CLI is for using SolStudio with local projects. It can initialize a project, parse Rust or IDL files into flow data, and launch a local visualizer.

Want a guided command path? Open the [CLI Learning Path](/docs/learn/cli) and practice the local project commands.

---

## Commands

| Command           | Purpose                                         |
| ----------------- | ----------------------------------------------- |
| `solstudio init`  | Create SolStudio config for a project directory |
| `solstudio view`  | Start the local visualizer for a project        |
| `solstudio parse` | Parse Rust source or a project into graph data  |
| `solstudio idl`   | Convert an IDL JSON file into graph data        |

## Initialize A Project

Run this inside an existing Solana project:

```bash
bun run solstudio init .
```

Force a framework when detection is not enough:

```bash
bun run solstudio init . --framework anchor
```

Scaffold a minimal project when the target folder is empty:

```bash
bun run solstudio init ./my-program --scaffold
```

## Open The Local Viewer

Start the local server and open the visualizer:

```bash
bun run solstudio view .
```

Use another port if `6139` is already busy:

```bash
bun run solstudio view . --port 6140
```

Keep the browser closed and copy the URL yourself:

```bash
bun run solstudio view . --no-open
```

## Parse Rust

Print graph JSON:

```bash
bun run solstudio parse ./programs/vault/src/lib.rs
```

Print a quick summary:

```bash
bun run solstudio parse . --format summary
```

Write intermediate representation to a file:

```bash
bun run solstudio parse . --format ir --output flow-ir.json
```

## Parse IDL

Convert an Anchor, Codama, Kinobi, or compatible IDL into flow data:

```bash
bun run solstudio idl ./target/idl/vault.json --output vault-flow.json
```

Inspect only the counts:

```bash
bun run solstudio idl ./target/idl/vault.json --format summary
```

## When To Use The CLI

- You already have a Rust codebase and want to understand its structure visually.
- You received an IDL and want to see instructions, accounts, errors, and events as nodes.
- You want to run SolStudio locally without depending on the hosted app.
- You want graph JSON or IR output for tests, debugging, or custom tooling.

## Common Fixes

| Problem                                | Fix                                                         |
| -------------------------------------- | ----------------------------------------------------------- |
| Port already in use                    | Run `solstudio view . --port 6140`                          |
| Framework detected as unknown          | Run `solstudio init . --framework anchor`                   |
| IDL warning about missing instructions | Confirm the file is a Solana IDL and not client config JSON |
| Parse output is too large              | Use `--format summary` first                                |
