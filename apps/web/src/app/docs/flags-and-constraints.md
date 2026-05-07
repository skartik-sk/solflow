# Flags and Constraints

Detailed explanation of every account flag and constraint in Solana Contract Flow, what it means in Solana, and how it is expressed in each framework.

---

## Account Flags

Account flags are quick toggles on the Account node. They are the most common way to configure account behavior. Under the hood, they produce the same IR constraints as explicit Constraint nodes.

---

### `isMut` -- Writable Account

#### What it means in Solana

On Solana, every account passed to an instruction has a `is_writable` flag in the transaction. When set to `true`, the runtime allows the program to modify the account's data and transfer lamports out. If `false`, the program can only read the account.

Marking an account as writable does two things:
1. The Solana runtime allows your program to write to it.
2. The framework validates that the client actually passed the account as writable.

#### When to use

- Any account whose data your instruction modifies (set-field operations).
- Accounts involved in SOL transfers (lamport debits).
- Accounts that will be closed (lamport transfer out).
- Payers of account creation or reallocation.

#### Generated Code

**Anchor:**
```rust
#[derive(Accounts)]
pub struct MyInstruction<'info> {
    #[account(mut)]
    pub my_account: Account<'info, MyState>,
}
```

Note: Anchor's `init` and `init_if_needed` constraints implicitly imply `mut`, so the `mut` attribute is omitted when init is present.

**Pinocchio:**
```rust
// Validate my_account is writable
if !my_account.is_writable() {
    return Err(ProgramError::InvalidAccountData);
}
```

**Quasar:**
```rust
#[derive(Accounts)]
pub struct MyInstruction<'info> {
    pub my_account: &'info mut Account<'info, MyState>,
}
```

Quasar expresses mutability in the type itself (`&'info mut`).

---

### `isSigner` -- Transaction Signer

#### What it means in Solana

The `is_signer` flag indicates that the account's private key holder authorized this transaction by providing a valid signature. The Solana runtime verifies the signature before the program executes.

This is the primary access control mechanism on Solana: only someone who controls the private key can produce a valid signature.

#### When to use

- The authority/owner of an account (to prove ownership).
- The payer creating a new account.
- Any account whose identity must be verified.
- Token authority for transfers/mints/burns.

#### Generated Code

**Anchor:**
```rust
#[derive(Accounts)]
pub struct MyInstruction<'info> {
    pub authority: Signer<'info>,
}
```

The `Signer<'info>` type automatically validates that the account signed the transaction.

**Pinocchio:**
```rust
// Validate authority is signer
if !authority.is_signer() {
    return Err(ProgramError::MissingRequiredSignature);
}
```

**Quasar:**
```rust
#[derive(Accounts)]
pub struct MyInstruction<'info> {
    pub authority: &'info Signer,
}
```

---

### `isInit` -- Create Account

#### What it means in Solana

Creating an account on Solana means:
1. Finding a new keypair (or PDA) for the account.
2. Transferring lamports to it (at least rent-exempt minimum).
3. Allocating space for the data.
4. Assigning ownership to your program.

The `init` flag handles all of this. The payer provides the lamports for rent, and the space determines how much data the account can hold.

#### When to use

- When your instruction creates a new data account (e.g., initializing a user profile, creating a vault).
- When the account must be brand new (not previously created).

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| payer | string | The account name that pays the rent exemption fee |
| space | number or "auto" | Data size in bytes. "auto" calculates from the bound state type. |

#### Space Calculation

When space is set to "auto", the codegen calculates:

- **Anchor**: `8 + StateType::INIT_SPACE` (uses Anchor's derived space calculation, including dynamic type overhead)
- **Pinocchio**: Sum of field sizes plus 8-byte discriminator
- **Quasar**: Sum of field sizes plus 8-byte discriminator

For state types with dynamic fields (String, Vec), Anchor uses `#[derive(InitSpace)]` and `#[max_len(N)]` attributes. Pinocchio and Quasar require explicit sizing.

#### Generated Code

**Anchor:**
```rust
#[derive(Accounts)]
#[instruction(seed_id: u64)]
pub struct CreateVault<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Vault::INIT_SPACE
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

**Pinocchio:**
```rust
// Create account vault via system program
{
    use pinocchio_system::instructions::CreateAccount;
    CreateAccount {
        payer: payer,
        new_account: vault,
        lamports: 0,  // rent exempt minimum calculated at runtime
        space: 48 as u64,
        owner: program_id,
    }
    .invoke()?;
}
```

**Quasar:**
```rust
#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(init, payer = payer, space = 48)]
    pub vault: &'info mut Account<Vault>,
    #[account(mut)]
    pub payer: &'info mut Signer,
    pub system_program: &'info Program<System>,
}
```

---

### `isInitIfNeeded` -- Create Account If Missing

#### What it means in Solana

`init-if-needed` is identical to `init` but with one difference: if the account already exists and is owned by your program, the instruction proceeds without re-creating it. If the account does not exist, it is created.

This is useful for "lazy initialization" patterns where you want a single instruction to work whether the account exists or not.

#### Security Consideration

`init-if-needed` has security implications. An attacker could front-run the initialization by creating the account with their own data before the legitimate user does. Always validate the account state after init-if-needed.

In Anchor, this requires the `init-if-needed` feature flag in Cargo.toml:
```toml
anchor-lang = { version = "0.32.0", features = ["init-if-needed"] }
```

#### Parameters

Same as `init`: `payer` and `space`.

#### Generated Code

Same as `init` but with `init_if_needed` instead of `init` in Anchor/Quasar attributes.

---

### `isClose` -- Close Account

#### What it means in Solana

Closing an account means:
1. Transferring all lamports from the account to a destination (the "close target").
2. Setting the account's data length to zero.
3. Setting the account's owner to the system program.

After closing, the account key can be reused by anyone (it becomes a regular system account).

#### When to use

- Reclaiming rent from accounts that are no longer needed.
- Clean-up operations in your program.
- Refundable escrow patterns where accounts are created and later closed.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| closeTarget | string | The account name that receives the lamports |

#### Generated Code

**Anchor:**
```rust
#[account(close = sol_destination)]
pub my_account: Account<'info, MyState>,
```

**Pinocchio:**
```rust
// Close my_account: transfer all lamports to sol_destination
{
    let target_lamports = sol_destination.lamports();
    let src_lamports = my_account.lamports();
    **sol_destination.lamports.borrow_mut() = target_lamports
        .checked_add(src_lamports)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    **my_account.lamports.borrow_mut() = 0;
}
```

**Quasar:**
```rust
#[account(close = sol_destination)]
pub my_account: &'info Account<MyState>,
```

---

## PDA Seeds

### What are PDA Seeds?

Program Derived Addresses (PDAs) are deterministically derived from seeds and a program ID. They have two key properties:

1. **Deterministic**: The same seeds + program ID always produce the same address.
2. **No private key**: Only the program can sign for PDAs (using `invoke_signed` / `CpiContext::new_with_signer`).

PDAs are used for:
- Vault accounts with deterministic addresses (e.g., one vault per user)
- Escrow accounts keyed by trade parameters
- Mint accounts with predictable addresses
- Any account where you need the program to sign on behalf of an address

### Seed Types

Each seed contributes bytes to the PDA derivation:

| Seed Type | Description | When to Use |
|-----------|-------------|-------------|
| `literal` | A fixed byte string, e.g., `"vault"` | Static prefixes, namespace tags |
| `account-field` | The public key of another account in the instruction | One-account-per-user patterns |
| `instruction-arg` | A value passed as an instruction argument | Parameterized PDAs (e.g., by item ID) |
| `pubkey` | A public key from another account | Same as account-field, explicit reference |

### Bump Seed

The "bump" is a single byte (0-255) that ensures the derived address does not have a corresponding private key. It is found by iterating from 255 downward during PDA creation.

You can:
- **Store the bump** in a state field and reference it by name. This is the recommended approach for efficiency.
- **Let the framework find it** by using `bump` without a value. Anchor and Quasar will find the canonical bump at runtime.

### Configuring Seeds in the Editor

On an Account node, add seeds in the seeds configuration:

1. Click "Add Seed" to add a seed entry.
2. Select the seed type (literal, account-field, instruction-arg, pubkey).
3. Enter the value:
   - For `literal`: the string value (e.g., `vault`, `escrow`)
   - For `account-field`: the account name (e.g., `authority`, `mint`)
   - For `instruction-arg`: the argument name (e.g., `item_id`)
   - For `pubkey`: the account name holding the public key
4. Optionally set `bump` to a variable name or leave blank for canonical bump.

### Seeds Example: One Vault Per Authority

```json
{
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
pub vault: Account<'info, Vault>,
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
pub vault: &'info Account<Vault>,
```

### Seeds with PDA Signing

When your program needs to sign for a PDA (e.g., in a token transfer where the PDA is the authority), the logic operations accept `signerSeeds`:

```json
{
  "type": "transfer-token",
  "from": "vault_token",
  "to": "destination",
  "authority": "vault",
  "amount": "1000000",
  "signerSeeds": [
    { "type": "literal", "value": "vault" },
    { "type": "account-field", "value": "authority" }
  ]
}
```

**Anchor:**
```rust
let seeds = &[b"vault", authority.key().as_ref()];
let signer_seeds = &[&seeds[..]];
let cpi_ctx = CpiContext::new_with_signer(
    token_program.to_account_info(),
    cpi_accounts,
    signer_seeds,
);
anchor_spl::token::transfer(cpi_ctx, amount)?;
```

**Pinocchio:**
```rust
let seeds: [Seed; 2] = [
    Seed::from(b"vault" as &[u8]),
    Seed::from(authority.address().as_ref()),
];
let signer = Signer::from(&seeds);
TokenTransfer { from, to, authority, amount }
    .invoke_signed(&[signer])?;
```

---

## Constraint Types (Detailed)

### `has-one` -- Field Equality Check

Validates that a field in the account's data matches the public key of another account in the instruction.

**Parameters:**
- `field`: The field name in the state struct (must be `Pubkey` type)
- `target`: The account name whose public key must match
- `errorCode` (optional): Custom error variant if check fails

**Example:** Ensure `vault.authority == authority.key()`

**Anchor:** `#[account(has_one = authority)]`
**Pinocchio:** Manual byte comparison at offset 32-64
**Quasar:** `#[account(has_one = authority)]`

### `owner` -- Program Ownership Check

Validates that the account is owned by a specific program.

**Parameters:**
- `owner`: Account name or expression for the expected owner program

**Example:** Verify an account is owned by the token program.

**Anchor:** `#[account(owner = token_program)]`
**Pinocchio:** `if account.owner() != owner.address() { return Err(...); }`

### `address` -- Exact Address Check

Validates that the account's address matches an expected value.

**Parameters:**
- `address`: Expected address expression or literal

**Example:** Ensure an account is a specific well-known address.

**Anchor:** `#[account(address = expected)]`
**Pinocchio:** `if account.address() != &Address::from_str("...").unwrap() { return Err(...); }`

### `token-authority` -- Token Account Owner

Validates that an SPL token account's owner/authority matches an expected account.

**Parameters:**
- `authority`: Account name expected to be the token account's authority

**Anchor:** `#[account(token::authority = authority)]`
**Pinocchio:** Reads bytes at offset 32-64 of the token account data and compares

### `token-mint` -- Token Mint Match

Validates that an SPL token account is for a specific mint.

**Parameters:**
- `mint`: Account name of the expected mint

**Anchor:** `#[account(token::mint = mint)]`
**Pinocchio:** Reads bytes at offset 0-32 of the token account data and compares

### `mint-authority` -- Mint Authority Check

Validates the mint account's authority field.

**Parameters:**
- `authority`: Account name expected to be the mint's authority

**Anchor:** `#[account(mint::authority = authority)]`
**Pinocchio:** Reads bytes at offset 0-32 of the mint data and compares

### `mint-decimals` -- Mint Decimals Check

Validates the mint account's decimals value.

**Parameters:**
- `decimals`: Expected decimals value (0-9)

**Anchor:** `#[account(mint::decimals = 9)]`
**Pinocchio:** Reads byte at offset 44 of the mint data and compares

### `associated-token-authority` -- ATA Owner Check

Validates that an Associated Token Account's owner matches an expected account.

**Parameters:**
- `authority`: Account name expected to be the ATA's owner

**Anchor:** `#[account(associated_token::authority = authority)]`

### `associated-token-mint` -- ATA Mint Check

Validates that an Associated Token Account is for a specific mint.

**Parameters:**
- `mint`: Account name of the expected mint

**Anchor:** `#[account(associated_token::mint = mint)]`

### `realloc` -- Resize Account Data

Changes the allocated data size of an account.

**Parameters:**
- `space`: New total size in bytes
- `payer`: Account that pays for additional rent (or receives refunded rent)
- `zeroInit`: Whether newly allocated bytes are zero-initialized

**Anchor:** `#[account(realloc = 100, realloc::payer = payer, realloc::zero = false)]`
**Pinocchio:** `data.resize(new_len, false);`

### `safety-comment` -- Audit Documentation

Adds a safety justification comment for unchecked accounts or auditing purposes.

**Parameters:**
- `comment`: Safety justification text

**Anchor:** `/// CHECK: This account is safe because...`
**Pinocchio:** `// Safety: This account is safe because...`

### `custom` -- Custom Constraint Expression

A custom Rust boolean expression evaluated as a constraint.

**Parameters:**
- `expression`: Rust boolean expression
- `errorCode` (optional): Custom error variant if expression evaluates to false

**Anchor:** `#[account(constraint = account.data.len() > 0 @ MyError::InvalidData)]`
**Pinocchio:** `if !(expression) { return Err(error.into()); }`

---

## Quick Reference: Flag vs Constraint Node

Most account validations can be set either via flags on the Account node or via explicit Constraint nodes. Here is when to use each:

| Use Flags When | Use Constraint Nodes When |
|----------------|--------------------------|
| Simple cases (mut, signer, init) | You need parameters (has-one with custom error) |
| Quick prototyping | Seeds with multiple components |
| Most common patterns | Token validations (token-authority, token-mint) |
| You want fewer nodes on the canvas | You need realloc, owner, address checks |
| | You need custom constraint expressions |
| | You want to document safety for unchecked accounts |

**Merging behavior:** When both a flag and a constraint node of the same type exist, the constraint node's parameters take precedence. This lets you set a quick flag (e.g., `isInit = true`) and then override specific parameters with a constraint node if needed.

---

## Type Mapping Reference

### Rust Types by Framework

| SolanaType | Anchor | Pinocchio | Quasar (state) | Quasar (args) |
|------------|--------|-----------|-----------------|---------------|
| `bool` | `bool` | `bool` | `PodBool` | `bool` |
| `u8` | `u8` | `u8` | `u8` | `u8` |
| `u16` | `u16` | `u16` | `PodU16` | `u16` |
| `u32` | `u32` | `u32` | `PodU32` | `u32` |
| `u64` | `u64` | `u64` | `PodU64` | `u64` |
| `u128` | `u128` | `u128` | `u128` | `u128` |
| `i8` | `i8` | `i8` | `i8` | `i8` |
| `i16` | `i16` | `i16` | `PodI16` | `i16` |
| `i32` | `i32` | `i32` | `PodI32` | `i32` |
| `i64` | `i64` | `i64` | `PodI64` | `i64` |
| `i128` | `i128` | `i128` | `i128` | `i128` |
| `f32` | `f32` | `f32` | `f32` | `f32` |
| `f64` | `f64` | `f64` | `f64` | `f64` |
| `String` | `String` | length-prefixed parser | `String<'a, N>` | `String` |
| `Pubkey` | `Pubkey` | `Address` | `Address` | `Address` |
| `{ vec: T }` | `Vec<T>` | length-prefixed parser | `Vec<'a, T, N>` | `Vec<T>` |
| `{ option: T }` | `Option<T>` | `Option<T>` | `Option<T>` | `Option<T>` |
| `{ array: [T, N] }` | `[T; N]` | `[T; N]` | `[T; N]` | `[T; N]` |

### Account Type Mapping

| AccountType | Anchor | Pinocchio | Quasar |
|-------------|--------|-----------|--------|
| `account` | `Account<'info, T>` | `AccountView` | `&'info Account<T>` |
| `system-account` | `SystemAccount<'info>` | `AccountView` | `&'info AccountInfo<'info>` |
| `signer` | `Signer<'info>` | `AccountView` | `&'info Signer` |
| `program` | `Program<'info, T>` | `AccountView` | `&'info Program<T>` |
| `token-account` | `Account<'info, TokenAccount>` | `AccountView` | `&'info TokenAccount` |
| `mint` | `Account<'info, Mint>` | `AccountView` | `&'info Mint` |
| `associated-token` | `InterfaceAccount<'info, TokenAccount>` | `AccountView` | `&'info InterfaceAccount<TokenAccount>` |
| `unchecked-account` | `UncheckedAccount<'info>` | `AccountView` | `&'info AccountInfo<'info>` |
| `system-program` | `Program<'info, System>` | `AccountView` | `&'info Program<System>` |
| `token-program` | `Program<'info, Token>` | `AccountView` | `&'info Program<Token>` |
| `associated-token-program` | `Program<'info, AssociatedToken>` | `AccountView` | `&'info Program<AssociatedToken>` |
| `rent` | `Sysvar<'info, Rent>` | `AccountView` | `Sysvar<'info, Rent>` |
| `clock` | `Sysvar<'info, Clock>` | `AccountView` | `Sysvar<'info, Clock>` |
| `custom` | User-defined type | `AccountView` | User-defined type |
