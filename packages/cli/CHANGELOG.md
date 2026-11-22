# Changelog

## 0.1.6

Security
- `view`: the local server binds to `127.0.0.1` only (`--host` accepts loopback addresses only),
  rejects Host headers other than `localhost`/`127.0.0.1` with its port (DNS rebinding),
  rejects cross-origin requests, requires a per-run session token (printed in the URL) on every
  `/api` call and WebSocket, and requires `Content-Type: application/json` on writes.
- `view`: Sync no longer overwrites source silently. It previews a diff, writes only after
  confirmation, refuses if files changed since the preview, and backs up overwritten files to
  `.solstudio/backups/<timestamp>/`. Source edits under hidden or build directories are refused.
- `cloud self-host`: `.env` is written with mode `0600`, the Postgres password is random
  (`POSTGRES_PASSWORD`), and `deploy` needs `--yes` or an interactive confirmation.

Fixes
- `init`: validates `--framework`; `--scaffold` creates an Anchor, Pinocchio or Quasar program
  with a workspace `Cargo.toml`, a fresh keypair and a matching `declare_id!`;
  `--framework` updates an existing config.
- `patch` (and Sync) map generated `programs/<crate>/...` paths onto the crate on disk.
- `ci`: installs Rust, Solana CLI and Anchor, starts a validator for Anchor tests, adds a
  `permissions` block, and pins the CLI version.
- `test`: clear message and exit code 127 when a toolchain is missing.
- `audit`: SARIF uses relative file URIs with line regions; `--generate-tests` output is
  labelled as smoke tests.
- Path containment checks use `path.relative` (Windows-safe).

Upgrade notes
- Self-host stacks created by 0.1.5 or earlier need `POSTGRES_PASSWORD=solstudio` added to
  their `.env` before redeploying.
