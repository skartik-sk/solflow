# Escrow Template

A Solana program for trustless atomic token swaps between two parties using an escrow pattern.

## Overview

A maker creates an escrow by depositing token A into a PDA-owned vault, specifying how much of token B they want in return. A taker can then fulfill the escrow by sending token B to the maker and receiving token A from the vault. The maker can also cancel (refund) the escrow at any time to reclaim their tokens.

## Instructions

### `make`
Creates the escrow PDA (derived from `"escrow"`, maker address, and mint A address), initializes an associated token account for the vault, and deposits the maker's token A. Records both the deposited amount and the desired receive amount. Emits a `MakeEvent`.

### `take`
The taker fulfills the escrow by:
1. Sending token B (the `receive_amount`) from the taker to the maker's token B account
2. Receiving token A from the vault (signed by the escrow PDA) into the taker's token A account
3. Closing the escrow account (rent returned to taker)

Emits a `TakeEvent`.

### `refund`
The maker cancels the escrow by:
1. Transferring all deposited token A back from the vault to the maker's token account (signed by escrow PDA)
2. Closing the escrow account (rent returned to maker)

Emits a `RefundEvent`.

## State

**EscrowState** fields:
- `maker` (Pubkey) - escrow creator
- `taker` (Pubkey) - intended taker (default Pubkey if open to anyone)
- `mint_a` (Pubkey) - token A mint (deposited by maker)
- `mint_b` (Pubkey) - token B mint (wanted by maker)
- `amount` (u64) - amount of token A deposited
- `receive_amount` (u64) - amount of token B expected in return
- `bump` (u8) - PDA bump seed

## Errors

| Code | Name | Description |
|------|------|-------------|
| 6000 | InvalidAmount | Amount must be greater than 0 |
| 6001 | InvalidMaker | Invalid maker account |
| 6002 | EscrowExpired | The escrow has expired |
| 6003 | Unauthorized | Only the escrow maker can perform this action |

## Events

- **MakeEvent** - maker, mint_a, mint_b, amount, receive_amount
- **TakeEvent** - maker, taker, token_a_amount, token_b_amount
- **RefundEvent** - maker, amount
