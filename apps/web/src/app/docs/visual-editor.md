# Visual Builder

The visual builder is the best first place to learn SolStudio. It runs at `/editor` and lets you model a Solana program as connected nodes before generating Rust for Anchor, Pinocchio, or Quasar.

Want the full step-by-step path instead of only reading? Open the [Visual Builder Learning Path](/docs/learn/visual-builder) and build the Vault or Escrow exercises.

---

## What You Build

A visual builder project is a graph:

| Layer          | Node        | What it means                                                                           |
| -------------- | ----------- | --------------------------------------------------------------------------------------- |
| Program        | Program     | The root crate/module metadata and program id                                           |
| Entry points   | Instruction | Callable functions such as `initialize`, `deposit`, or `claim_rewards`                  |
| Runtime inputs | Account     | Solana accounts passed to each instruction                                              |
| Stored data    | State       | Structs saved inside program-owned accounts                                             |
| Validation     | Constraint  | Rules such as PDA seeds, owner checks, signer checks, or token checks                   |
| Behavior       | Logic       | Instruction body operations such as transfers, math, require checks, and event emission |

Start small: one Program, one Instruction, one Account, one State, and one Logic node.

## First Flow

1. Open `/editor/new`.
2. Add a **Program** node named `vault_program`.
3. Add an **Instruction** node named `initialize`.
4. Connect `Program -> Instruction`.
5. Add an **Account** node named `vault`.
6. Connect `Instruction -> Account`.
7. Add a **State** node named `Vault`.
8. Add fields such as `authority: Pubkey` and `total_deposits: u64`.
9. Connect `State -> Account`.
10. Generate code and inspect the output panel.

## How To Connect Nodes

Use the handles on each node. The editor rejects invalid edges, so a failed connection usually means the source and target handles represent different concepts.

| Build intent                           | Connection               |
| -------------------------------------- | ------------------------ |
| Add an instruction to a program        | `Program -> Instruction` |
| Make an instruction receive an account | `Instruction -> Account` |
| Bind account data to a struct          | `State -> Account`       |
| Validate an account                    | `Account -> Constraint`  |
| Add executable behavior                | `Instruction -> Logic`   |
| Chain behavior in order                | `Logic -> Logic`         |

Read [Connection Rules](/docs/connection-rules) when a handle does not connect.

## Properties Panel

Select a node to edit its properties.

- Program names become crate and module names.
- Instruction names become Rust function names.
- Account names become fields in generated account structs.
- State fields become serialized data in generated state structs.
- Flags such as `isMut`, `isSigner`, `isInit`, and `isClose` become framework-specific validation code.

## Code Generation

The same graph can generate different Rust styles:

| Target    | Use when                                                                                |
| --------- | --------------------------------------------------------------------------------------- |
| Anchor    | You want the most common Solana framework, IDL support, and familiar account validation |
| Pinocchio | You want low-level, compute-focused, dependency-light programs                          |
| Quasar    | You want zero-copy performance with a more ergonomic framework surface                  |

## Visual Builder Checklist

- Use exactly one Program node.
- Connect every Instruction to the Program.
- Give every Instruction the accounts it reads or writes.
- Bind State nodes to program-owned Account nodes.
- Use Account flags for simple validation.
- Use Constraint nodes for explicit or advanced validation.
- Generate early and inspect warnings before the graph grows.
