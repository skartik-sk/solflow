# Node Reference

Complete reference for every node type in Solana Contract Flow.

---

## Program Node

The root node of every flow. Exactly one Program node is required per flow. It defines the top-level program metadata.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string (snake_case) | Yes | Program name. Becomes the Rust crate name and module name. |
| version | string | Yes | Semantic version, e.g., `0.1.0` |
| programId | string (base58) | No | On-chain program address. Defaults to `11111111111111111111111111111111` if not set. |
| description | string | No | Human-readable program description |
| license | string | No | License identifier. Defaults to `MIT`. |

### Connections

- **Output** (bottom): connects to Instruction nodes
- No inputs

### What It Generates

**Anchor:**
```rust
declare_id!("ProgramIdHere");

#[program]
pub mod my_program {
    use super::*;
    // instruction entry points...
}
```

**Pinocchio:**
```rust
solana_address::declare_id!("ProgramIdHere");
pinocchio::program_entrypoint!(process_instruction);
```

**Quasar:**
```rust
declare_id!("ProgramIdHere");

#[program]
pub mod my_program {
    use super::*;
    // instruction logic inline...
}
```

---

## Instruction Node

Represents a single instruction handler in the program. Each instruction is an entry point that clients can invoke.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string (snake_case) | Yes | Instruction name. Becomes the Rust function name. |
| description | string | No | Documentation for the instruction |
| args | InstructionArg[] | No | Array of arguments passed by the client |
| accessControl | enum | No | `none` (default), `admin_only`, or `custom` |
| discriminator | number[8] | No | Custom 8-byte discriminator. Auto-generated if not set. |

### Instruction Arguments

Each argument has:

| Field | Type | Description |
|-------|------|-------------|
| name | string (snake_case) | Argument name |
| type | SolanaType | See supported types below |
| description | string | Optional documentation |

### Supported Types (SolanaType)

**Primitives:** `bool`, `u8`, `u16`, `u32`, `u64`, `u128`, `i8`, `i16`, `i32`, `i64`, `i128`, `f32`, `f64`, `String`, `Pubkey`

**Composites:**
- `{ array: [SolanaType, number] }` -- fixed-size array, e.g., `[u8; 32]`
- `{ vec: SolanaType }` -- dynamic vector, e.g., `Vec<u64>`
- `{ option: SolanaType }` -- optional value, e.g., `Option<Pubkey>`
- `{ defined: string }` -- user-defined type reference
- `{ hashMap: [SolanaType, SolanaType] }` -- hash map
- `{ enum: EnumDefinition }` -- inline enum

### Access Control

| Mode | Behavior |
|------|----------|
| `none` | No restrictions. Any caller can invoke. |
| `admin_only` | Only the program authority can invoke. |
| `custom` | Custom validation logic (you write the check). |

### Connections

- **Input** (top): from Program node
- **Output right**: to Account nodes
- **Output bottom**: to Logic nodes and Custom Code nodes
- **Output left top**: to Error nodes
- **Output left bottom**: to Event nodes

### What It Generates

**Anchor:** A separate file `src/instructions/<name>.rs` with:
```rust
pub fn handler(ctx: Context<Initialize>, amount: u64) -> Result<()> {
    // logic body
    Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct Initialize<'info> {
    // account fields
}
```

**Pinocchio:** A separate file `src/instructions/<name>.rs` with:
```rust
pub fn process(
    program_id: &Address,
    accounts: &mut [AccountView],
    data: &[u8],
) -> ProgramResult {
    // account destructuring, validation, logic
    Ok(())
}
```

**Quasar:** The handler function is generated inline in `src/lib.rs` within the `#[program]` block. A separate file contains only the Accounts struct.

---

## Account Node

Represents a Solana account passed to an instruction. This is the most configurable node type.

### Account Types (14 types)

| Type | Description | Use Case |
|------|-------------|----------|
| `account` | A program-owned account with optional state type binding | General-purpose data accounts |
| `system-account` | A system-program-owned account (has lamports, no data) | Accounts you need to read but don't own |
| `signer` | An account that must sign the transaction | Transaction authority, payer |
| `program` | Another on-chain program (CPI target) | Cross-program invocations |
| `token-account` | An SPL Token account (`anchor_spl::token::TokenAccount`) | Holding SPL tokens |
| `mint` | An SPL Token mint (`anchor_spl::token::Mint`) | Token mint accounts |
| `associated-token` | An Associated Token Account | Derived token accounts for users |
| `unchecked-account` | An unvalidated `AccountInfo` (requires safety comment) | When you need raw account access |
| `system-program` | The System program (`Program<'info, System>`) | SOL transfers, account creation |
| `token-program` | The SPL Token program | Token operations |
| `associated-token-program` | The Associated Token program | Creating associated token accounts |
| `rent` | The Rent sysvar (`Sysvar<'info, Rent>`) | Rent-exempt checks |
| `clock` | The Clock sysvar (`Sysvar<'info, Clock>`) | Timestamps, slot numbers |
| `custom` | Custom-typed account with optional state binding | Any account with a custom type |

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string (snake_case) | Yes | Account identifier used in code |
| accountType | AccountType | Yes | One of the 14 types above |
| stateType | string | No | Name of the State struct this account stores |
| description | string | No | Documentation |
| seeds | SeedDefinition[] | No | PDA seeds (when the account is a PDA) |
| bump | string | No | PDA bump seed |

### Flags

| Flag | Effect |
|------|--------|
| `isMut` | Marks the account as mutable. In Anchor: `#[account(mut)]`. In Pinocchio: generates `is_writable()` check. |
| `isSigner` | Requires the account to be a transaction signer. In Anchor: type becomes `Signer<'info>`. In Pinocchio: generates `is_signer()` check. |
| `isInit` | Creates the account during instruction execution. Requires `payer` and `space`. |
| `isInitIfNeeded` | Creates the account only if it doesn't exist. Requires `payer` and `space`. |
| `isClose` | Closes the account, transferring lamports to `closeTarget`. |

### Contextual Fields (appear based on accountType + flags)

**When `isInit` or `isInitIfNeeded` is set:**

| Field | Type | Description |
|-------|------|-------------|
| payer | string | Name of the account that pays rent |
| space | number or "auto" | Account data size in bytes. "auto" calculates from the bound state type. |

**When `isClose` is set:**

| Field | Type | Description |
|-------|------|-------------|
| closeTarget | string | Name of the account receiving the lamports |

**When accountType is `token-account` and `isInit` is set:**

| Field | Type | Description |
|-------|------|-------------|
| tokenAuthority | string | The token account's owner/authority |
| tokenMint | string | The mint this token account is for |

**When accountType is `mint` and `isInit` is set:**

| Field | Type | Description |
|-------|------|-------------|
| mintAuthority | string | The mint authority |
| mintDecimals | number | Token decimals (0-9) |

**When accountType is `associated-token`:**

| Field | Type | Description |
|-------|------|-------------|
| associatedAuthority | string | The wallet address owning this ATA |
| associatedMint | string | The token mint for this ATA |

**When accountType is `unchecked-account`:**

| Field | Type | Description |
|-------|------|-------------|
| safetyComment | string | Required safety justification for using unchecked account |

### Connections

- **Input** (top): from Instruction node
- **Output** (right): to Constraint nodes
- **Input** (left): from State node

### PDA Seeds

When the account is a Program Derived Address, configure seeds:

Each seed has a **type** and **value**:

| Seed Type | Description | Example |
|-----------|-------------|---------|
| `literal` | A static byte string | `"vault"` generates `b"vault"` |
| `account-field` | A public key from another account | `authority` generates `authority.key().as_ref()` |
| `instruction-arg` | A value passed as an instruction argument | `seed_id` generates `seed_id.as_ref()` |
| `pubkey` | A public key from another account | `global_state` generates `global_state.key().as_ref()` |

### What It Generates

**Anchor:** Maps to typed account wrappers:
```
accountType="signer" + isSigner  -> Signer<'info>
accountType="account" + stateType -> Account<'info, MyState>
accountType="system-program"       -> Program<'info, System>
accountType="token-account"        -> Account<'info, TokenAccount>
accountType="mint"                 -> Account<'info, Mint>
accountType="unchecked-account"    -> UncheckedAccount<'info>
```

**Pinocchio:** All accounts are `AccountView`. Validation checks are generated explicitly:
```rust
if !authority.is_signer() {
    return Err(ProgramError::MissingRequiredSignature);
}
if !vault.is_writable() {
    return Err(ProgramError::InvalidAccountData);
}
```

**Quasar:** Uses reference types with mutability in the type:
```rust
pub vault: &'info mut Account<Vault>,   // mut + state
pub authority: &'info Signer,            // signer
pub system_program: &'info Program<System>,  // system-program
```

---

## State Node

Defines an on-chain data structure stored in program-owned accounts.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string (PascalCase) | Yes | Struct name, e.g., `Vault`, `UserProfile` |
| fields | Field[] | Yes | Array of data fields |
| isZeroCopy | boolean | No | Enable zero-copy (Pinocchio-style) access |
| customDiscriminator | number[8] | No | Custom 8-byte discriminator |

### State Fields

Each field has:

| Field | Type | Description |
|-------|------|-------------|
| name | string (snake_case) | Field name |
| type | SolanaType | Data type (see Instruction args for full list) |
| description | string | Optional documentation |
| maxLen | number | For dynamic types (String, Vec), the max capacity |
| defaultValue | string | Optional default value |

### Connections

- **Output** (right): to Account node's left (data-in) handle

### What It Generates

**Anchor:**
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

**Pinocchio:** Zero-copy struct with byte-offset accessors:
```rust
pub struct Vault;

impl Vault {
    pub const LEN: usize = 48; // 8 (disc) + 32 + 8
    const AUTHORITY_OFFSET: usize = 8;
    const BALANCE_OFFSET: usize = 40;

    pub fn authority(data: &[u8]) -> &Address { /* ... */ }
    pub fn set_authority(data: &mut [u8], value: &Address) { /* ... */ }
    pub fn balance(data: &[u8]) -> u64 { /* ... */ }
    pub fn set_balance(data: &mut [u8], value: u64) { /* ... */ }
}
```

**Quasar:** Pod-typed struct with explicit discriminator:
```rust
#[account(discriminator = [1, 0, 0, 0, 0, 0, 0, 0])]
pub struct Vault {
    pub authority: Address,
    pub balance: PodU64,
}
```

---

## Constraint Node

Adds a validation rule to an account. Constraints are alternative to flags for more granular control.

### All 18 Constraint Types

#### 1. `signer`

Requires the account to have signed the transaction.

**Parameters:** None

**Generated code:**
- Anchor: Type becomes `Signer<'info>`
- Pinocchio: `if !account.is_signer() { return Err(...); }`

#### 2. `mut`

Marks the account as writable.

**Parameters:** None

**Generated code:**
- Anchor: `#[account(mut)]`
- Pinocchio: `if !account.is_writable() { return Err(...); }`

#### 3. `init`

Creates a new account funded by a payer with the specified space.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| payer | string | Account name paying for rent |
| space | number or "auto" | Account data size. "auto" uses the bound state type's `INIT_SPACE`. |

**Generated code:**
- Anchor: `#[account(init, payer = payer, space = 8 + Vault::INIT_SPACE)]`
- Pinocchio: `CreateAccount { payer, new_account, ... }.invoke()?;`

#### 4. `init-if-needed`

Creates a new account if it doesn't exist, otherwise uses the existing one.

**Parameters:** Same as `init`

**Note:** In Anchor, this requires the `init-if-needed` feature flag in `Cargo.toml`.

#### 5. `close`

Closes the account and transfers lamports to the target.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| target | string | Account name receiving the lamports |

**Generated code:**
- Anchor: `#[account(close = sol_destination)]`
- Pinocchio: Manual lamport transfer + zeroing

#### 6. `has-one`

Validates that a field in the account data matches another account's public key.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| field | string | Field name in the account's data |
| target | string | Account name that must match |
| errorCode | string | Optional custom error if validation fails |

**Generated code:**
- Anchor: `#[account(has_one = authority)]`
- Pinocchio: Manual byte comparison at field offset

#### 7. `seeds`

Validates the account is a valid PDA derived from the given seeds.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| seeds | SeedDefinition[] | Array of seeds (see Account node seeds section) |
| bump | string | Optional bump seed value |
| programId | string | Optional program ID for cross-program PDAs |

**Generated code:**
- Anchor: `#[account(seeds = [b"vault", authority.key().as_ref()], bump)]`
- Pinocchio: `crate::utils::verify_pda(account.address(), &[seeds], program_id)?;`

#### 8. `owner`

Validates that the account is owned by a specific program.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| owner | string | Account name or expression for the expected owner |

**Generated code:**
- Anchor: `#[account(owner = token_program)]`
- Pinocchio: `if account.owner() != owner.address() { return Err(...); }`

#### 9. `address`

Validates the account's address matches an expected value.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| address | string | Expected address expression |

**Generated code:**
- Anchor: `#[account(address = expected_pubkey)]`
- Pinocchio: Direct address comparison

#### 10. `token-authority`

Validates the SPL token account's authority field.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| authority | string | Account name expected to be the token authority |

**Generated code:**
- Anchor: `#[account(token::authority = authority)]`
- Pinocchio: Manual byte check at offset 32

#### 11. `token-mint`

Validates the SPL token account's mint field.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| mint | string | Account name expected to be the mint |

**Generated code:**
- Anchor: `#[account(token::mint = mint)]`
- Pinocchio: Manual byte check at offset 0

#### 12. `mint-authority`

Validates the mint's authority field.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| authority | string | Account name expected to be the mint authority |

**Generated code:**
- Anchor: `#[account(mint::authority = authority)]`

#### 13. `mint-decimals`

Validates the mint's decimals field.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| decimals | number | Expected decimals value (0-9) |

**Generated code:**
- Anchor: `#[account(mint::decimals = 9)]`

#### 14. `associated-token-authority`

Validates the Associated Token Account's authority.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| authority | string | Account name expected to be the ATA owner |

**Generated code:**
- Anchor: `#[account(associated_token::authority = authority)]`

#### 15. `associated-token-mint`

Validates the Associated Token Account's mint.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| mint | string | Account name expected to be the mint |

**Generated code:**
- Anchor: `#[account(associated_token::mint = mint)]`

#### 16. `realloc`

Reallocates account data space.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| space | number | New account data size in bytes |
| payer | string | Account paying for the space difference |
| zeroInit | boolean | Whether to zero-initialize new memory |

**Generated code:**
- Anchor: `#[account(realloc = 100, realloc::payer = payer, realloc::zero = false)]`

#### 17. `safety-comment`

Adds a safety justification comment (for unchecked accounts or auditing).

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| comment | string | Safety justification text |

**Generated code:**
- Anchor: `/// CHECK: This account is validated by the program logic`
- Pinocchio: `// Safety: This account is validated by the program logic`

#### 18. `custom`

A custom constraint expression.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| expression | string | Rust boolean expression |
| errorCode | string | Optional custom error variant |

**Generated code:**
- Anchor: `#[account(constraint = account.data.len() > 0 @ MyError::InvalidData)]`
- Pinocchio: `if !(expression) { return Err(...); }`

---

## Error Node

Defines a custom error variant for the program.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string (PascalCase) | Yes | Error variant name, e.g., `InsufficientFunds` |
| code | number | Yes | Error code, typically starting at 6000 |
| message | string | Yes | Human-readable error description |

### Connections

- **Input** (left): from Instruction node's error-out handle

### What It Generates

**Anchor:**
```rust
#[error_code]
pub enum MyProgramError {
    #[msg("Insufficient funds for this operation")]
    InsufficientFunds,
}
```

**Pinocchio:**
```rust
pub enum MyProgramError {
    InsufficientFunds = 6000,
}

impl From<MyProgramError> for ProgramError {
    fn from(e: MyProgramError) -> Self {
        ProgramError::Custom(e as u32)
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

## Event Node

Defines an event that instructions can emit.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string (PascalCase) | Yes | Event struct name, e.g., `TransferEvent` |
| fields | Field[] | Yes | Array of event data fields |
| description | string | No | Documentation |

### Connections

- **Input** (left): from Instruction node's event-out handle

### What It Generates

**Anchor:**
```rust
#[event]
pub struct TransferEvent {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}
```

**Pinocchio:**
```rust
pub struct TransferEvent {
    pub from: Address,
    pub to: Address,
    pub amount: u64,
}
// Emitted via sol_log_data
```

**Quasar:**
```rust
#[event(discriminator = 0)]
pub struct TransferEvent {
    pub from: Address,
    pub to: Address,
    pub amount: u64,
}
```

---

## Logic Node

Defines an operation in the instruction body. This is the executable logic of your program.

### All 12 Logic Operations

#### 1. `set-field`

Sets a field on an account's data.

| Parameter | Type | Description |
|-----------|------|-------------|
| account | string | Account name to modify |
| field | string | Field name on the state struct |
| value | string | Value expression to assign |

**Generated code:**
```rust
// Anchor
vault.balance = new_amount;

// Pinocchio
Vault::set_balance(&mut vault.try_borrow_mut_data()?, new_amount);

// Quasar
vault.balance = PodU64::from(new_amount);
```

#### 2. `transfer-sol`

Transfers SOL from one account to another.

| Parameter | Type | Description |
|-----------|------|-------------|
| from | string | Source account name |
| to | string | Destination account name |
| amount | string | Amount in lamports |

**Generated code:**
```rust
// Anchor — system program CPI
anchor_lang::system_program::transfer(cpi_ctx, amount)?;

// Pinocchio — pinocchio_system
Transfer { from, to, lamports: amount }.invoke()?;

// Quasar — system program method
ctx.accounts.system_program.transfer(from, to, amount).invoke()?;
```

#### 3. `transfer-token`

Transfers SPL tokens.

| Parameter | Type | Description |
|-----------|------|-------------|
| from | string | Source token account |
| to | string | Destination token account |
| authority | string | Token account authority (signer) |
| amount | string | Amount in smallest units |
| signerSeeds | Seed[] | Optional PDA signer seeds for program-signed transfers |

#### 4. `mint-to`

Mints new tokens.

| Parameter | Type | Description |
|-----------|------|-------------|
| mint | string | Mint account |
| to | string | Destination token account |
| authority | string | Mint authority |
| amount | string | Amount to mint |
| signerSeeds | Seed[] | Optional PDA signer seeds |

#### 5. `burn`

Burns tokens.

| Parameter | Type | Description |
|-----------|------|-------------|
| mint | string | Mint account |
| from | string | Source token account |
| authority | string | Token account authority |
| amount | string | Amount to burn |
| signerSeeds | Seed[] | Optional PDA signer seeds |

#### 6. `require`

Validates a condition. Returns an error if the condition is false.

| Parameter | Type | Description |
|-----------|------|-------------|
| condition | string | Rust boolean expression |
| errorCode | string | Error variant name to return |

**Generated code:**
```rust
// Anchor
require!(balance >= amount, MyProgramError::InsufficientFunds);

// Pinocchio
if !(balance >= amount) {
    return Err(MyProgramError::InsufficientFunds.into());
}

// Quasar
require!(balance >= amount, MyProgramError::InsufficientFunds);
```

#### 7. `if-else`

Conditional branching. Child logic nodes connected to this node form the "then" and "else" branches.

| Parameter | Type | Description |
|-----------|------|-------------|
| condition | string | Rust boolean expression |

**Child connections:**
- Connect to the default (bottom) handle for the "then" branch
- Connect to the "else-out" handle for the "else" branch

**Generated code:**
```rust
if condition {
    // then body
} else {
    // else body
}
```

#### 8. `emit-event`

Emits a program event.

| Parameter | Type | Description |
|-----------|------|-------------|
| event | string | Event struct name |
| fields | Record<string, string> | Field name to value expression mapping |

**Generated code:**
```rust
// Anchor & Quasar
emit!(TransferEvent {
    from: sender.key(),
    to: receiver.key(),
    amount: amt,
});

// Pinocchio
pinocchio::log::sol_log_data(&[&[]]);
```

#### 9. `return-error`

Returns a custom error from the instruction.

| Parameter | Type | Description |
|-----------|------|-------------|
| errorCode | string | Error variant name |

**Generated code:**
```rust
// Anchor
return err!(MyProgramError::Unauthorized);

// Pinocchio
return Err(MyProgramError::Unauthorized.into());

// Quasar
return Err(MyProgramError::Unauthorized.into());
```

#### 10. `math`

Performs arithmetic.

| Parameter | Type | Description |
|-----------|------|-------------|
| operation | enum | `add`, `sub`, `mul`, `div`, `mod` |
| left | string | Left operand expression |
| right | string | Right operand expression |
| result | string | Variable name to store the result |
| checked | boolean | If true, uses checked arithmetic that panics on overflow |

**Generated code (checked):**
```rust
// Anchor
let result = left.checked_add(right).ok_or(ErrorCode::ArithmeticOverflow)?;

// Pinocchio & Quasar
let result = left.checked_add(right).ok_or(ProgramError::ArithmeticOverflow)?;
```

**Generated code (unchecked):**
```rust
let result = left + right;
```

#### 11. `cpi`

Cross-Program Invocation. Calls an instruction on another program.

| Parameter | Type | Description |
|-----------|------|-------------|
| targetProgram | string | Account name of the target program |
| instruction | string | Instruction name to call |
| accounts | Array<{from, to}> | Account mapping (your account name to CPI account name) |
| data | Array<{name, value}> | Instruction data arguments |
| signerSeeds | Seed[] | Optional PDA signer seeds |

#### 12. `custom-code`

Injects raw Rust code into the instruction body.

| Parameter | Type | Description |
|-----------|------|-------------|
| code | string | Raw Rust code (multiple lines) |
| inputs | string[] | Variable/account names this code reads |
| outputs | string[] | Variable names this code produces |

The code is inserted verbatim. Use this for logic that cannot be expressed with other node types.

---

## Custom Code Node

A special node for injecting raw Rust code. Behaves like a Logic node but with freeform code.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | No | Display label |
| code | string | Yes | Raw Rust code to inject |
| inputs | string[] | No | Variable names consumed by the code |
| outputs | string[] | No | Variable names produced by the code |
| description | string | No | Documentation |

### Connections

- **Input** (top): from Instruction or Logic node
- **Output** (bottom): to Logic node
- **Input** (left): receives variable bindings
- **Output** (right): produces variable bindings

---

## Integration Node

Plugin integration point for extending code generation with custom logic.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Display name |
| pluginId | string | Yes | Plugin identifier |
| integrationId | string | Yes | Integration identifier |
| config | Record<string, unknown> | No | Plugin-specific configuration |
| attachedTo.instructionId | string | Yes | UUID of the instruction this integrates with |
| attachedTo.position | enum | Yes | `before-body`, `after-body`, or `account-level` |

### Connections

- **Input** (top): from Instruction node
- **Output** (bottom): to Account node
