# Getting Started with SolStudio

SolStudio has three surfaces: the [Visual Builder](/docs/visual-editor) for designing Solana programs, the [CLI](/docs/cli) for inspecting local Rust and IDL projects, and [Cloud](/docs/cloud) for running Solana automations. This guide focuses on the visual builder path.

---

## Table of Contents

1. [The Canvas](#the-canvas)
2. [Creating Your First Program](#creating-your-first-program)
3. [Node Types Overview](#node-types-overview)
4. [Connecting Nodes](#connecting-nodes)
5. [Configuring Properties](#configuring-properties)
6. [Generating Code](#generating-code)
7. [Understanding the Output](#understanding-the-output)
8. [Workflow Tips](#workflow-tips)

---

## The Canvas

The editor is a node-based flow canvas powered by React Flow. You place nodes representing Solana program components and draw edges between them to define relationships.

**Key concepts:**

- **Nodes** represent program components: the program itself, instructions, accounts, states, constraints, logic operations, errors, events, and custom code.
- **Edges** (connections) define how these components relate. An edge from a Program node to an Instruction node means "this instruction belongs to this program."
- **Handles** are the small connection points on each node. Each handle accepts specific connection types.

---

## Creating Your First Program

### Step 1: Add a Program Node

Every flow starts with exactly one **Program** node. This is the root of your program definition.

1. Drag a Program node from the node palette onto the canvas.
2. In the Properties Panel (right sidebar), configure:
   - **name** (snake_case): e.g., `my_token`
   - **version**: e.g., `0.1.0`
   - **programId**: your on-chain program address (optional at design time)
   - **description**: human-readable description

### Step 2: Add Instructions

A Solana program is a collection of instructions. Each instruction is an entry point that client code can call.

1. Drag an **Instruction** node onto the canvas.
2. Connect it from the Program node's bottom handle to the Instruction node's top handle.
3. Configure in the Properties Panel:
   - **name** (snake_case): e.g., `initialize`, `transfer`, `mint`
   - **args**: click to add instruction arguments (name + type pairs), e.g., `amount: u64`
   - **accessControl**: `none`, `admin_only`, or `custom`

### Step 3: Add Accounts

Each instruction operates on a set of accounts. These are the Solana accounts the instruction will read or modify.

1. Drag an **Account** node onto the canvas.
2. Connect it from the Instruction node's right handle to the Account node's top handle.
3. Configure:
   - **name** (snake_case): e.g., `payer`, `vault`, `authority`
   - **accountType**: choose from the 14 account types (see below)
   - **Flags**: toggle `isMut`, `isSigner`, `isInit`, `isInitIfNeeded`, `isClose` as needed

### Step 4: Define State Structs

If your program stores data on-chain, define state structs.

1. Drag a **State** node onto the canvas.
2. Add fields with name and type (e.g., `authority: Pubkey`, `balance: u64`).
3. Connect the State node's right handle to the Account node's left handle to bind the account to this data structure.

### Step 5: Add Logic

Logic nodes define what happens inside an instruction's body.

1. Drag a **Logic** node onto the canvas.
2. Connect it from the Instruction node's bottom handle to the Logic node's top handle.
3. Choose the logic type (e.g., `set-field`, `transfer-sol`, `require`).
4. Configure parameters in the Properties Panel.

### Step 6: Generate Code

1. Select your target framework: **Anchor**, **Pinocchio**, or **Quasar**.
2. Click **Generate**.
3. The code panel shows the complete Rust project with all files.

---

## Node Types Overview

| Node Type       | Purpose                             | Connects From        | Connects To                                  |
| --------------- | ----------------------------------- | -------------------- | -------------------------------------------- |
| **Program**     | Root node defining the program      | --                   | Instructions                                 |
| **Instruction** | A program instruction handler       | Program              | Accounts, Logic, Errors, Events, Custom Code |
| **Account**     | An account passed to an instruction | Instruction          | Constraints, State                           |
| **State**       | On-chain data struct definition     | --                   | Accounts                                     |
| **Constraint**  | Validation rule for an account      | Account              | --                                           |
| **Logic**       | Operation in instruction body       | Instruction or Logic | Logic (for if-else bodies)                   |
| **Error**       | Custom error variant                | Instruction          | --                                           |
| **Event**       | Event that can be emitted           | Instruction          | --                                           |
| **Custom Code** | Raw Rust code injection             | Instruction or Logic | --                                           |
| **Integration** | Plugin integration point            | Instruction          | Accounts                                     |

---

## Connecting Nodes

Connections enforce rules. The editor only allows valid connections:

1. **Drag from an output handle** (right side or bottom of a node) to an **input handle** (left side or top of another node).
2. Handles are color-coded and labeled. A handle will highlight when a compatible connection is possible.
3. Invalid connections are rejected automatically.

See [connection-rules.md](connection-rules.md) for the complete connection reference.

---

## Configuring Properties

Select any node to see its properties in the **Properties Panel** on the right side of the editor.

### Common Properties

- **name**: Identifier for the node. Must follow naming conventions:
  - snake_case for instructions, accounts, fields, constraints
  - PascalCase for state structs, errors, events
- **description**: Optional documentation string

### Account Flags

Account nodes have toggle flags that control behavior:

| Flag             | Meaning                                       |
| ---------------- | --------------------------------------------- |
| `isMut`          | The instruction will write to this account    |
| `isSigner`       | This account must sign the transaction        |
| `isInit`         | Create this account during the instruction    |
| `isInitIfNeeded` | Create this account only if it does not exist |
| `isClose`        | Close this account and reclaim its rent       |

Additional fields appear contextually:

- When `isInit` or `isInitIfNeeded` is set: **payer** (who pays rent) and **space** (account size in bytes, or "auto")
- When `isClose` is set: **closeTarget** (where the lamports go)
- When `accountType` is `token-account`: **tokenAuthority** and **tokenMint**
- When `accountType` is `mint`: **mintAuthority** and **mintDecimals**
- When `accountType` is `associated-token`: **associatedAuthority** and **associatedMint**
- When `accountType` is `unchecked-account`: **safetyComment** (required safety justification)

### Constraint Nodes

Instead of using flags, you can attach explicit Constraint nodes to an Account for fine-grained control. Constraint nodes have their own configuration parameters. See [flags-and-constraints.md](flags-and-constraints.md) for details.

### Logic Nodes

Logic nodes have type-specific parameters:

| Logic Type       | Key Parameters                                                |
| ---------------- | ------------------------------------------------------------- |
| `set-field`      | account, field, value                                         |
| `transfer-sol`   | from, to, amount                                              |
| `transfer-token` | from, to, authority, amount                                   |
| `mint-to`        | mint, to, authority, amount                                   |
| `burn`           | mint, from, authority, amount                                 |
| `require`        | condition, errorCode                                          |
| `if-else`        | condition (then/else bodies via child connections)            |
| `emit-event`     | event name, field values                                      |
| `return-error`   | errorCode                                                     |
| `math`           | operation (add/sub/mul/div/mod), left, right, result, checked |
| `cpi`            | targetProgram, instruction, accounts, data                    |
| `custom-code`    | code (raw Rust), inputs, outputs                              |

---

## Generating Code

Click the framework selector in the toolbar and choose:

### Anchor

The standard Solana framework. Generates a full Anchor project with:

- `Cargo.toml` with anchor-lang and optional anchor-spl dependencies
- `src/lib.rs` with `#[program]` module and `declare_id!`
- `src/instructions/<name>.rs` per instruction (handler + Accounts struct)
- `src/state/<name>.rs` per state struct with `#[account]` derive
- `src/errors.rs` with `#[error_code]` enum
- `src/events.rs` with `#[event]` structs
- `src/constants.rs` for program constants

Best for: most Solana programs, projects that benefit from Anchor's IDL generation, accounts struct validation, and the Anchor ecosystem.

### Pinocchio

A `no_std`, zero-dependency, compute-optimized framework. Generates:

- `Cargo.toml` with pinocchio, pinocchio-system, pinocchio-token dependencies
- `src/lib.rs` with `program_entrypoint!` and discriminator-based dispatch
- `src/instructions/<name>.rs` per instruction with manual account validation
- `src/state/<name>.rs` per state with zero-copy byte-offset accessors
- `src/errors.rs` with `From<T> for ProgramError` conversion
- `src/utils.rs` with PDA verification helper (only when PDA seeds are used)

Best for: high-performance programs, compute-unit optimization, programs that need minimal dependencies.

### Quasar

A zero-copy, `no_std` framework with Anchor-like ergonomics. Generates:

- `Cargo.toml` with quasar-lang dependency
- `src/lib.rs` with `#[program]` block containing inline instruction logic
- `src/instructions/<name>.rs` per instruction (Accounts struct only)
- `src/state/<name>.rs` per state with Pod types and explicit discriminators
- `src/errors.rs` with `#[error_code]` enum

Best for: developers wanting zero-copy performance with Anchor-style syntax.

---

## Understanding the Output

### File Structure (Anchor Example)

```
programs/my_program/
  Cargo.toml
  src/
    lib.rs              -- program entry, #[program] mod
    instructions/
      mod.rs            -- pub mod initialize; pub mod transfer;
      initialize.rs     -- handler fn + Accounts struct
      transfer.rs
    state/
      mod.rs
      vault.rs          -- #[account] struct Vault { ... }
    errors.rs           -- #[error_code] enum MyProgramError { ... }
    events.rs           -- #[event] structs
    constants.rs        -- pub const values
```

### Warnings and Errors

After generation, the code panel shows:

- **Warnings**: non-fatal issues like "Instruction has no accounts"
- **Errors**: fatal issues that prevented generation

---

## Workflow Tips

1. **Start with the Program node.** Every flow needs exactly one.
2. **Name things carefully.** Names become Rust identifiers. Use snake_case for instructions/accounts and PascalCase for state/error/event names. Rust keywords are not allowed.
3. **Use auto space.** When initializing an account with a state type, set space to "auto" to let the framework calculate the correct size.
4. **Prefer flags for simple cases.** Use the isMut/isSigner/isInit toggles on Account nodes for common patterns. Use explicit Constraint nodes only when you need fine-grained control.
5. **Chain logic nodes.** Connect logic nodes in sequence (top to bottom) to control execution order. Use the `order` property to enforce ordering.
6. **Use if-else for branching.** Connect child logic nodes to the if-else node's bottom handle for the "then" branch, and to the "else-out" handle for the "else" branch.
7. **Always add Error nodes.** Custom errors make debugging easier. Define them with error codes starting at 6000 and connect them to the instructions that use them.
8. **Check the generated code.** Review the output, especially for custom-code blocks and CPI calls, which may need manual adjustment.
9. **Iterate visually.** Modify nodes and connections, then regenerate. The visual flow is the single source of truth.
