# Incomplete / Fake Features Tracker

Status as of 2026-04-20.

## Fixed

| Feature | Fix |
|---------|-----|
| **Dashboard Rename** | Now works — inline rename input with tRPC update call |
| **Test Runner durations** | Removed fake random durations, uses honest `duration: 0` with structural validation |
| **Undo** | Drag-aware batching — no undo spam during drag, normal ops captured immediately |
| **Auto-save** | 30s normal, 3s for framework changes. Never creates version snapshots |
| **Code Compare View** | Monaco DiffEditor with red/green diff highlighting + side-by-side toggle |
| **Account State Inspector** | Recursively deserializes defined types, HashMaps (Borsh), and enums with variant fields |
| **Transaction Builder** | Wallet auto-fill: "Me" button on signer accounts, "Auto-fill signers" batch, fee payer "Wallet" button |
| **User Settings** | Full settings dialog (Editor/Defaults/Build tabs) persisted to localStorage via Zustand |
| **Plugin Panel** | Plugin audit rules now registered into audit engine via `registerAuditRules()`. AuditRule type aligned between plugin-sdk and audit package |
| **Marketplace Search** | Proper pagination with page numbers, result count, tag matching, category preserved in search |
| **Properties Validation** | Real-time validation: identifier format, duplicate field/arg names, semver version, pubkey format, Anchor space minimum |
| **Build Console Filters** | Search highlighting in filtered log lines (yellow background on match) |
| **Floating Browser** | Fixed empty src error (shows placeholder when no URL). Window now opens at 75% viewport size, centered |
| **Project Name Persistence** | Save mutation now includes `name` field — project names persist after sign-in/refresh |
| **Network Selector** | Custom RPC endpoints — add/remove via + button in top bar. Used by TransactionBuilder, AccountStateInspector, and API proxy |
| **Import Dialog** | Better unknown format handling: clear warning message, amber badge for unrecognized formats, explicit error with supported format list on failure |

## Still Incomplete

### High Priority

| Feature | File | What's fake |
|---------|------|-------------|
| **Test Runner** | `server/trpc/routers/test.ts` | Structural validation only (checks signer accounts). Doesn't execute real Solana tests or Docker runners. Needs BullMQ + Docker pipeline. |

## Architecture Notes

- Test runner needs BullMQ + Docker pipeline for real execution
