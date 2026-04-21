# Code Generation Guide

How Solana Contract Flow transforms your visual flow into Rust source code.

---

## The IR Pipeline

Code generation follows a three-stage pipeline:

```
UI (React Flow)  -->  Transformer  -->  IR (JSON)  -->  Codegen  -->  Rust Files
   nodes + edges      flowToIR()      ProgramIR      generateCode()   GeneratedFile[]
```

### Stage 1: UI State

The visual editor maintains a graph of `Node` and `Edge` objects (React Flow types). Each node has a `type` field and a `data` object containing the user's configuration.

### Stage 2: Transformer (`flowToIR`)

Located in `@solflow/ir`, the transformer walks the graph and produces a validated `ProgramIR` object:

1. **Find the Program node** -- the root of the flow.
2. **Discover instructions** -- follow edges from the Program node to Instruction nodes.
3. **For each instruction:**
   - Collect connected Account nodes.
   - For each Account, collect connected Constraint nodes and State nodes.
   - Merge flag-based constraints (isMut, isSigner, etc.) with explicit Constraint nodes. Explicit nodes override flags of the same type.
   - Collect connected Logic nodes and Custom Code nodes, sorted by `order`.
   - For if-else logic, recursively collect child nodes for then/else branches.
4. **Collect global definitions** -- State, Error, Event, Integration nodes are collected from the entire graph.
5. **Validate** -- The resulting IR is validated against the Zod schema (`ProgramIRSchema.parse()`).

### Stage 3: Codegen (`generateCode`)

The codegen module in `@solflow/codegen` takes the validated IR and a framework name, producing a `GeneratedProject` with files, warnings, and errors.

---

## ProgramIR Structure

The intermediate representation is a typed JSON object:

```
ProgramIR
  version: "1.0.0"
  program:
    name: string (snake_case)
    version: string
    programId?: string
    description?: string
    license?: string
  instructions: Instruction[]
  states: State[]
  errors: ErrorVariant[]
  events: IrEvent[]
  integrations: Integration[]
  constants: { name, type, value }[]
  metadata:
    createdAt, updatedAt, flowHash, generatorVersion
```

### Key IR Types

**Instruction:**
```
Instruction
  id: UUID
  name: snake_case
  args: InstructionArg[]
  accounts: Account[]
  body: LogicOperation[]
  accessControl: "none" | "admin_only" | "custom"
```

**Account:**
```
Account
  id: UUID
  name: snake_case
  accountType: AccountType (14 variants)
  stateType?: string
  constraints: Constraint[]
```

**Constraint** (discriminated union, 18 variants):
```
{ type: "signer" }
{ type: "mut" }
{ type: "init", payer, space }
{ type: "init-if-needed", payer, space }
{ type: "close", target }
{ type: "has-one", field, target, errorCode? }
{ type: "seeds", seeds: Seed[], bump?, programId? }
{ type: "owner", owner }
{ type: "address", address }
{ type: "token-authority", authority }
{ type: "token-mint", mint }
{ type: "realloc", space, payer, zeroInit }
{ type: "custom", expression, errorCode? }
{ type: "mint-authority", authority }
{ type: "mint-decimals", decimals }
{ type: "associated-token-authority", authority }
{ type: "associated-token-mint", mint }
{ type: "safety-comment", comment }
```

**LogicOperation** (discriminated union, 12 variants):
```
{ type: "set-field", account, field, value }
{ type: "transfer-sol", from, to, amount }
{ type: "transfer-token", from, to, authority, amount, signerSeeds? }
{ type: "mint-to", mint, to, authority, amount, signerSeeds? }
{ type: "burn", mint, from, authority, amount, signerSeeds? }
{ type: "require", condition, errorCode }
{ type: "if-else", condition, thenBody: LogicOperation[], elseBody?: LogicOperation[] }
{ type: "emit-event", event, fields }
{ type: "return-error", errorCode }
{ type: "cpi", targetProgram, instruction, accounts, data, signerSeeds? }
{ type: "math", operation, left, right, result, checked }
{ type: "custom-code", code, inputs, outputs }
```

---

## Framework Comparison

### Architecture Differences

| Aspect | Anchor | Pinocchio | Quasar |
|--------|--------|-----------|--------|
| stdlib | std | no_std | no_std (opt) |
| Entry | `#[program]` macro | `program_entrypoint!` | `#[program]` macro |
| Dispatch | Anchor runtime (sha256 disc) | Manual discriminator match | Quasar runtime |
| Account types | Typed wrappers (`Account<T>`, `Signer`, etc.) | `AccountView` (all accounts) | References (`&'info Account<T>`) |
| State access | Deserialize/serialize | Zero-copy byte offsets | Pod types (zero-copy) |
| Error handling | `#[error_code]` + `Result<()>` | `ProgramError::Custom` | `#[error_code]` |
| Events | `#[event]` + `emit!()` | `sol_log_data` (manual) | `#[event]` + `emit!()` |
| Mutability | `#[account(mut)]` attribute | `is_writable()` check | `&'info mut` in type |
| Signer | `Signer<'info>` type | `is_signer()` check | `&'info Signer` type |
| Dependencies | anchor-lang, anchor-spl | pinocchio, pinocchio-system, pinocchio-token | quasar-lang |
| Compute cost | Higher (deserialization overhead) | Minimal | Minimal (zero-copy) |

### File Structure

**Anchor:**
```
programs/<name>/
  Cargo.toml
  src/
    lib.rs                  -- declare_id! + #[program] mod + dispatch
    instructions/
      mod.rs
      <instruction>.rs      -- handler fn + #[derive(Accounts)] struct
    state/
      mod.rs
      <state>.rs            -- #[account] struct
    errors.rs               -- #[error_code] enum
    events.rs               -- #[event] structs
    constants.rs
```

**Pinocchio:**
```
programs/<name>/
  Cargo.toml
  src/
    lib.rs                  -- #![no_std] + program_entrypoint! + discriminator dispatch
    instructions/
      mod.rs
      <instruction>.rs      -- process() fn with manual validation
    state/
      mod.rs
      <state>.rs            -- Zero-copy struct with byte-offset accessors
    errors.rs               -- enum + From<T> for ProgramError
    events.rs               -- structs (manual serialization)
    constants.rs
    utils.rs                -- PDA verification (only when needed)
```

**Quasar:**
```
programs/<name>/
  Cargo.toml
  src/
    lib.rs                  -- #[program] block with ALL instruction logic inline
    instructions/
      mod.rs
      <instruction>.rs      -- #[derive(Accounts)] struct ONLY (no handler)
    state/
      mod.rs
      <state>.rs            -- #[account(discriminator = [...])] struct with Pod types
    errors.rs               -- #[error_code] enum
    events.rs               -- #[event(discriminator = N)] structs
    constants.rs
```

### Key Difference: Where Logic Lives

- **Anchor**: Logic is in separate handler functions (`src/instructions/<name>.rs`), dispatched from `lib.rs`.
- **Pinocchio**: Logic is in separate `process()` functions (`src/instructions/<name>.rs`), dispatched by manual discriminator matching in `lib.rs`.
- **Quasar**: Logic is inline in `lib.rs` inside the `#[program]` block. Instruction files contain ONLY the Accounts structs.

---

## How Flags Map to Generated Code

### `isMut` (Writable)

| Framework | Generated Code |
|-----------|---------------|
| Anchor | `#[account(mut)]` attribute on the account field (unless `init` or `init-if-needed` is present, which implies mut) |
| Pinocchio | `if !account.is_writable() { return Err(ProgramError::InvalidAccountData); }` |
| Quasar | Type becomes `&'info mut Account<T>` instead of `&'info Account<T>` |

### `isSigner`

| Framework | Generated Code |
|-----------|---------------|
| Anchor | Account type becomes `Signer<'info>` (not an attribute -- the type itself) |
| Pinocchio | `if !account.is_signer() { return Err(ProgramError::MissingRequiredSignature); }` |
| Quasar | Type becomes `&'info Signer` or `&'info mut Signer` |

### `isInit`

| Framework | Generated Code |
|-----------|---------------|
| Anchor | `#[account(init, payer = payer_account, space = 8 + StateType::INIT_SPACE)]` |
| Pinocchio | `CreateAccount { payer, new_account, lamports: 0, space, owner: program_id }.invoke()?;` |
| Quasar | `#[account(init, payer = payer_account, space = N)]` |

**Space calculation:**
- When space is "auto" and a state type is bound:
  - Anchor: `8 + StateType::INIT_SPACE`
  - Pinocchio: Calculated from field sizes
  - Quasar: Calculated from field sizes
- When space is "auto" with no state type: defaults to `8` bytes

### `isInitIfNeeded`

Same as `isInit` but with:
- Anchor: `init_if_needed` instead of `init`
- Pinocchio: Same `CreateAccount` but wrapped in an existence check
- Quasar: `init_if_needed` instead of `init`

### `isClose`

| Framework | Generated Code |
|-----------|---------------|
| Anchor | `#[account(close = target_account)]` |
| Pinocchio | Manual lamport transfer: `**target.lamports.borrow_mut() = target_lamports + src_lamports; **src.lamports.borrow_mut() = 0;` |
| Quasar | `#[account(close = target_account)]` |

---

## How Seeds Map to Generated Code

Seeds define Program Derived Addresses (PDAs). Each seed has a type that determines how it is expressed in code.

### Seed Types

#### `literal` -- Static byte string

```json
{ "type": "literal", "value": "vault" }
```

| Framework | Generated |
|-----------|-----------|
| Anchor | `b"vault"` |
| Pinocchio | `b"vault" as &[u8]` |
| Quasar | `b"vault"` |

#### `account-field` -- Public key from another account

```json
{ "type": "account-field", "value": "authority" }
```

| Framework | Generated |
|-----------|-----------|
| Anchor | `authority.key().as_ref()` |
| Pinocchio | `authority.address().as_ref()` |
| Quasar | `authority.key().as_ref()` |

#### `instruction-arg` -- Value from instruction arguments

```json
{ "type": "instruction-arg", "value": "seed_id" }
```

| Framework | Generated |
|-----------|-----------|
| Anchor | `seed_id.as_ref()` |
| Pinocchio | `seed_id.as_ref()` |
| Quasar | `seed_id` (field name directly) |

#### `pubkey` -- Public key reference

```json
{ "type": "pubkey", "value": "global_state" }
```

| Framework | Generated |
|-----------|-----------|
| Anchor | `global_state.key().as_ref()` |
| Pinocchio | `global_state.address().as_ref()` |
| Quasar | `global_state` (field name directly) |

### Complete Seeds Constraint

```json
{
  "type": "seeds",
  "seeds": [
    { "type": "literal", "value": "vault" },
    { "type": "account-field", "value": "authority" }
  ],
  "bump": "vault_bump"
}
```

**Anchor:**
```rust
#[account(seeds = [b"vault", authority.key().as_ref()], bump = vault_bump)]
```

**Pinocchio:**
```rust
crate::utils::verify_pda(
    vault.address(),
    &[b"vault" as &[u8], authority.address().as_ref()],
    program_id,
)?;
```

**Quasar:**
```rust
#[account(seeds = [b"vault", authority.key().as_ref()], bump = vault_bump)]
```

### Bump

When `bump` is set, it references a variable or account field holding the bump value. When omitted, the framework's canonical bump (`bump` without arguments) is used.

---

## How Logic Operations Map to Generated Code

### set-field

**Anchor:**
```rust
let account = &mut ctx.accounts.account;
account.field = value;
```

**Pinocchio:**
```rust
{
    let data = &mut account.try_borrow_mut_data()?;
    StateType::set_field(data, value);
}
```

**Quasar:**
```rust
let account = &mut ctx.accounts.account;
account.field = PodType::from(value);  // Pod wrapping when applicable
```

### transfer-sol

**Anchor:**
```rust
let cpi_accounts = anchor_lang::system_program::Transfer {
    from: ctx.accounts.from.to_account_info(),
    to: ctx.accounts.to.to_account_info(),
};
let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
anchor_lang::system_program::transfer(cpi_ctx, amount)?;
```

**Pinocchio:**
```rust
{
    use pinocchio_system::instructions::Transfer;
    Transfer { from, to, lamports: amount }.invoke()?;
}
```

**Quasar:**
```rust
ctx.accounts.system_program.transfer(ctx.accounts.from, ctx.accounts.to, amount).invoke()?;
```

### transfer-token (with PDA signer)

**Anchor:**
```rust
let seeds = &[b"vault", authority.key().as_ref()];
let signer_seeds = &[&seeds[..]];
let cpi_accounts = anchor_spl::token::Transfer {
    from: ctx.accounts.from.to_account_info(),
    to: ctx.accounts.to.to_account_info(),
    authority: ctx.accounts.authority.to_account_info(),
};
let cpi_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    cpi_accounts,
    signer_seeds,
);
anchor_spl::token::transfer(cpi_ctx, amount)?;
```

**Pinocchio:**
```rust
{
    use pinocchio_token::instructions::Transfer as TokenTransfer;
    use pinocchio::cpi::{Signer, Seed};
    let seeds: [Seed; N] = [Seed::from(b"vault" as &[u8]), Seed::from(authority.address().as_ref())];
    let signer = Signer::from(&seeds);
    TokenTransfer { from, to, authority, amount }
        .invoke_signed(&[signer])?;
}
```

**Quasar:**
```rust
let seeds = &[b"vault", authority];
ctx.accounts.token_program
    .transfer(ctx.accounts.from, ctx.accounts.to, ctx.accounts.authority, amount)
    .invoke_signed(&seeds)?;
```

### require

**Anchor:**
```rust
require!(condition, MyProgramError::ErrorCode);
```

**Pinocchio:**
```rust
if !(condition) {
    return Err(MyProgramError::ErrorCode.into());
}
```

**Quasar:**
```rust
require!(condition, MyProgramError::ErrorCode);
```

### if-else

All frameworks generate the same structure:
```rust
if condition {
    // then body operations
} else {
    // else body operations (if present)
}
```

### emit-event

**Anchor:**
```rust
emit!(MyEvent {
    field1: value1,
    field2: value2,
});
```

**Pinocchio:**
```rust
// Event: MyEvent
{
    // Event emission via sol_log_data
    pinocchio::log::sol_log_data(&[&[]]);
}
```
Note: Pinocchio events require manual serialization.

**Quasar:**
```rust
emit!(MyEvent {
    field1: value1,
    field2: value2,
});
```

### math (checked)

**Anchor:**
```rust
let result = left.checked_add(right)
    .ok_or(anchor_lang::error::ErrorCode::ArithmeticOverflow)?;
```

**Pinocchio & Quasar:**
```rust
let result = left.checked_add(right)
    .ok_or(ProgramError::ArithmeticOverflow)?;
```

### math (unchecked)

All frameworks:
```rust
let result = left + right;
```

### cpi (Cross-Program Invocation)

**Anchor:**
```rust
// CPI: program::instruction
{
    let cpi_program = ctx.accounts.program.to_account_info();
    let cpi_accounts = InstructionCpi {
        account: ctx.accounts.my_account.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    instruction(cpi_ctx, data_args)?;
}
```

**Pinocchio:**
```rust
// CPI: program::instruction
{
    let cpi_program = program;
    let seeds: [Seed; N] = [...];
    let signer = Signer::from(&seeds);
    // Build instruction data
    let ix_data = [...];
    // CPI invocation
    pinocchio::cpi::invoke_signed(&instruction, &[...accounts...], &[signer])?;
}
```

**Quasar:**
```rust
// CPI: program::instruction
ctx.accounts.program
    .instruction(InstructionCpi {
        account: ctx.accounts.my_account,
    }, data_args)
    .invoke_signed(&[seeds])?;
```

---

## Generated File Details

### Cargo.toml

**Anchor:**
```toml
[package]
name = "my-program"
version = "0.1.0"
edition = "2021"

[dependencies]
anchor-lang = { version = "0.32.0", features = ["init-if-needed"] }
# anchor-spl = "0.32.0"  <-- added when token accounts are used
```

**Pinocchio:**
```toml
[package]
name = "my-program"
version = "0.1.0"
edition = "2021"

[dependencies]
pinocchio = { version = "0.11", features = ["cpi"] }
solana-address = { version = "2.0", features = ["decode"] }
# pinocchio-system = "0.6"  <-- added when CPI is used
# pinocchio-token = "0.4"   <-- added when SPL tokens are used
```

**Quasar:**
```toml
[package]
name = "my-program"
version = "0.1.0"
edition = "2021"

[dependencies]
quasar-lang = "0.0"
# quasar-spl = "0.0"  <-- added when SPL tokens are used
```

### State Structs

**Anchor** -- uses standard Rust types with derives:
```rust
#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey,  // 32 bytes
    pub balance: u64,       // 8 bytes
    #[max_len(64)]
    pub name: String,
}
```

**Pinocchio** -- uses zero-copy byte-offset accessors:
```rust
pub struct Vault;

impl Vault {
    pub const LEN: usize = 48;  // 8 (disc) + 32 + 8
    const AUTHORITY_OFFSET: usize = 8;
    const BALANCE_OFFSET: usize = 40;

    pub fn authority(data: &[u8]) -> &Address {
        unsafe { &*(data[8..40].as_ptr() as *const Address) }
    }

    pub fn set_authority(data: &mut [u8], value: &Address) {
        data[8..40].copy_from_slice(value.as_ref());
    }

    pub fn balance(data: &[u8]) -> u64 {
        u64::from_le_bytes(data[40..48].try_into().unwrap())
    }

    pub fn set_balance(data: &mut [u8], value: u64) {
        data[40..48].copy_from_slice(&value.to_le_bytes());
    }
}
```

**Quasar** -- uses Pod types with explicit discriminators:
```rust
#[account(discriminator = [1, 0, 0, 0, 0, 0, 0, 0])]
pub struct Vault {
    pub authority: Address,
    pub balance: PodU64,
}
```

### Error Enums

**Anchor:**
```rust
#[error_code]
pub enum MyProgramError {
    #[msg("Insufficient funds")]
    InsufficientFunds,
}
```

**Pinocchio:**
```rust
#[derive(Debug, Clone, Copy)]
pub enum MyProgramError {
    InsufficientFunds = 6000,
}

impl From<MyProgramError> for ProgramError {
    fn from(e: MyProgramError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl MyProgramError {
    pub fn message(&self) -> &str {
        match self {
            Self::InsufficientFunds => "Insufficient funds",
        }
    }
}
```

**Quasar:**
```rust
#[error_code]
pub enum MyProgramError {
    InsufficientFunds = 6000,
}
```

---

## Automatic Dependency Detection

The codegen automatically detects when certain dependencies are needed:

| Condition | Anchor | Pinocchio | Quasar |
|-----------|--------|-----------|--------|
| Any instruction uses token accounts, mints, or ATAs | `anchor-spl` | `pinocchio-token` | `quasar-spl` |
| Any instruction performs CPI (transfer-sol, transfer-token, mint-to, burn, cpi) | (built-in) | `pinocchio-system`, pinocchio `cpi` feature | (built-in) |
| Any account has PDA seeds | (built-in) | Generates `utils.rs` with `verify_pda()` | (built-in) |

---

## Deterministic Output

Code generation is deterministic:

1. **Instructions** are sorted alphabetically by name.
2. **States** are sorted alphabetically by name.
3. **Errors** are sorted by error code (ascending).
4. **Events** are sorted alphabetically by name.
5. **IR hash** is computed using stable JSON serialization with sorted keys.

This means the same visual flow always produces identical output code.

