# Token Vault Template

A Solana program for managing SPL token vaults backed by PDA accounts.

## Overview

Each user can create a vault for a specific SPL token mint. The vault is a PDA derived from the literal `"vault"`, the user's address, and the mint address. An associated token account owned by the vault PDA holds the actual SPL tokens.

## Instructions

### `initialize`
Creates a new vault PDA and its associated token account. The vault stores the owner, mint, a running total of deposited tokens, and the PDA bump seed.

### `deposit`
Transfers SPL tokens from the user's token account into the vault's token account. Updates the `amount` field on the vault state. Emits a `DepositEvent`.

### `withdraw`
Transfers SPL tokens from the vault's token account back to the user. The vault PDA signs the transfer using its signer seeds. Only the vault authority can withdraw. Emits a `WithdrawEvent`.

### `close_vault`
Closes the vault account and returns the rent lamports to the authority. The vault must be empty (zero tokens) before it can be closed. Emits a `CloseVaultEvent`.

## State

**VaultState** fields:
- `authority` (Pubkey) - vault owner
- `mint` (Pubkey) - SPL token mint
- `amount` (u64) - total deposited tokens
- `bump` (u8) - PDA bump seed

## Errors

| Code | Name | Description |
|------|------|-------------|
| 6000 | InvalidAmount | Amount must be greater than 0 |
| 6001 | InsufficientFunds | Insufficient tokens in vault |
| 6002 | Unauthorized | Only the vault authority can perform this action |
| 6003 | VaultNotEmpty | Cannot close a vault that still holds tokens |

## Events

- **DepositEvent** - authority, amount, new_total
- **WithdrawEvent** - authority, amount, remaining
- **CloseVaultEvent** - authority
