# Visual Builder

The visual builder is the best first place to learn SolStudio. It runs at `/editor` and lets you model a Solana program as connected nodes before generating Rust for Anchor, Pinocchio, or Quasar.

Want the full step-by-step path instead of only reading? Open the [Visual Builder Learning Path](/docs/learn/visual-builder) and build the Vault or Escrow exercises.

---

## Reference Map

The Visual Builder reference owns the deeper Solana-program docs. These are not separate products; they are the detailed parts of building programs visually.

| Section                  | Use it for                                                                                                  | Detailed page                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| First editor walkthrough | Opening the editor, adding first nodes, and generating early                                                | [Getting Started](/docs/getting-started)           |
| Node behavior            | What each Program, Instruction, Account, State, Constraint, Logic, Error, Event, and Custom Code node means | [Node Reference](/docs/node-reference)             |
| Valid graph edges        | What connects to what and why the editor rejects invalid handles                                            | [Connection Rules](/docs/connection-rules)         |
| Generated Rust           | How graph nodes become IR, Anchor, Pinocchio, and Quasar code                                               | [Code Generation Guide](/docs/codegen-guide)       |
| Account validation       | `mut`, `signer`, `init`, `close`, token constraints, PDA seeds, and bump handling                           | [Flags & Constraints](/docs/flags-and-constraints) |

If you are building a Solana program in SolStudio, start here and use those sections as the detailed reference chapters.

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

## Editor Surface

| Area               | What it controls                      | Use it when                                                                                                    |
| ------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Canvas             | Nodes and edges                       | You are modeling program structure                                                                             |
| Palette            | Available node types                  | You need to add a program, instruction, account, state, constraint, event, error, logic, or custom code        |
| Properties panel   | Selected node fields                  | You need to name nodes, set account flags, add state fields, configure constraints, or choose logic operations |
| Output panel       | Generated code, warnings, and exports | You need to verify what the graph produces                                                                     |
| Connection handles | Valid source and target edges         | You need to express ownership, runtime inputs, validation, or execution order                                  |

The canvas is the source of truth. If a node is missing from the graph, the generator cannot infer it safely. Add the node explicitly, connect it, then inspect generated code.

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

## Node Palette At A Glance

| Node        | Job                                        | Common connection                                                                                |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Program     | Root metadata and generated module         | `Program -> Instruction`                                                                         |
| Instruction | Callable entry point                       | `Instruction -> Account`, `Instruction -> Logic`, `Instruction -> Event`, `Instruction -> Error` |
| Account     | Runtime account passed into an instruction | `Instruction -> Account`, `Account -> Constraint`                                                |
| State       | Stored data struct                         | `State -> Account`                                                                               |
| Constraint  | Validation on an account                   | `Account -> Constraint`                                                                          |
| Logic       | Handler body operation                     | `Instruction -> Logic`, `Logic -> Logic`                                                         |
| Event       | Structured emitted output                  | `Instruction -> Event`                                                                           |
| Error       | Custom error enum variant                  | `Instruction -> Error`                                                                           |
| Custom Code | Escape hatch for unsupported snippets      | Usually attached where generated logic needs a manual block                                      |

Detailed property rules live in [Node Reference](/docs/node-reference). Use that page when you need exact field names, data types, defaults, and framework-specific behavior.

## Properties Panel

Select a node to edit its properties.

- Program names become crate and module names.
- Instruction names become Rust function names.
- Account names become fields in generated account structs.
- State fields become serialized data in generated state structs.
- Flags such as `isMut`, `isSigner`, `isInit`, and `isClose` become framework-specific validation code.

## Account Flags And Constraints

Account flags are for common account behavior. Constraint nodes are for explicit validation rules.

| Need                                       | Use             | Example                        |
| ------------------------------------------ | --------------- | ------------------------------ |
| Account must be writable                   | Account flag    | `mut`                          |
| Transaction must include signer            | Account flag    | `signer`                       |
| Account is created by the instruction      | Account flag    | `init`                         |
| Account closes after the instruction       | Account flag    | `close`                        |
| Account must derive from seeds             | Constraint node | PDA seeds and bump             |
| Account must match another account field   | Constraint node | `has_one = authority`          |
| Token account must match mint or authority | Constraint node | token mint and token authority |

Read [Flags & Constraints](/docs/flags-and-constraints) when you are modeling PDAs, token accounts, close behavior, or validation that should be visible in generated Rust.

## Code Generation

The same graph can generate different Rust styles:

| Target    | Use when                                                                                |
| --------- | --------------------------------------------------------------------------------------- |
| Anchor    | You want the most common Solana framework, IDL support, and familiar account validation |
| Pinocchio | You want low-level, compute-focused, dependency-light programs                          |
| Quasar    | You want zero-copy performance with a more ergonomic framework surface                  |

Generation flow:

1. The editor reads React Flow nodes and edges.
2. Nodes become SolStudio IR.
3. The selected framework adapter turns IR into Rust files.
4. Warnings are shown when the graph is incomplete or cannot safely map to the target framework.

Read [Code Generation Guide](/docs/codegen-guide) when you need exact IR mapping, framework differences, generated file structure, or deterministic output behavior.

## Visual Builder Reference Chapters

Use these chapters while building:

| Task                               | Open                                               |
| ---------------------------------- | -------------------------------------------------- |
| Learn the first editor workflow    | [Getting Started](/docs/getting-started)           |
| Check what each node property does | [Node Reference](/docs/node-reference)             |
| Debug why a connection is rejected | [Connection Rules](/docs/connection-rules)         |
| Understand generated Rust          | [Code Generation Guide](/docs/codegen-guide)       |
| Model account validation correctly | [Flags & Constraints](/docs/flags-and-constraints) |

## Visual Builder Checklist

- Use exactly one Program node.
- Connect every Instruction to the Program.
- Give every Instruction the accounts it reads or writes.
- Bind State nodes to program-owned Account nodes.
- Use Account flags for simple validation.
- Use Constraint nodes for explicit or advanced validation.
- Generate early and inspect warnings before the graph grows.
