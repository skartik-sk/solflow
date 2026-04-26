# SolStudio Framework Component Corpus

Last updated: 2026-04-26

This document is the working support matrix for parser, editor nodes, codegen,
SDK generation, test runner, and audit rules. It is based on the adjacent local
framework repos:

- `../anchor`
- `../pinocchio`
- `../quasar`
- `../codama`
- `../kit`

## Product Use

Use this corpus to drive:

- Parser fixtures and parse-report confidence checks.
- Editor palette node categories and property controls.
- Framework-specific codegen coverage.
- SDK generation and client defaults.
- Real test-runner workflows.
- Audit rule fixtures and framework-specific remediation.

## Anchor

Primary scan areas:

- `../anchor/lang/src`
- `../anchor/lang/derive`
- `../anchor/spl/src`
- `../anchor/tests`

Parser coverage priorities:

- `#[program]` module handlers using `Context<T>`.
- `#[derive(Accounts)]` structs with `#[account(...)]` constraints.
- Account wrappers:
  - `Account`
  - `AccountLoader`
  - `LazyAccount`
  - `InterfaceAccount`
  - `Program`
  - `Interface`
  - `Signer`
  - `SystemAccount`
  - `Sysvar`
  - `UncheckedAccount`
  - raw `AccountInfo`
- Constraints:
  - `init`
  - `init_if_needed`
  - `mut`
  - `signer`
  - `payer`
  - `space`
  - `close`
  - `has_one`
  - `owner`
  - `address`
  - `constraint = ...`
  - `seeds`
  - `bump`
  - `seeds::program`
  - `realloc`
  - token/mint/associated token constraints.
- State markers:
  - `#[account]`
  - zero-copy loaders
  - custom discriminator tests
  - migration/realloc accounts.
- Events/errors:
  - `#[event]`
  - `emit!`
  - `emit_cpi!`
  - `#[error_code]`
  - `require!` and related macros.
- CPI:
  - `CpiContext::new`
  - `CpiContext::new_with_signer`
  - `with_signer`
  - `remaining_accounts`
  - Anchor SPL helpers.

High-value fixture sources:

- `../anchor/tests/events`
- `../anchor/tests/errors`
- `../anchor/tests/interface-account`
- `../anchor/tests/pda-derivation`
- `../anchor/tests/realloc`
- `../anchor/tests/spl`
- `../anchor/tests/cpi-returns`
- `../anchor/tests/optional`
- `../anchor/tests/lazy-account`

Editor/codegen implications:

- Add first-class nodes for PDA account, token account, mint account, ATA,
  interface account, account migration/realloc, event emit, error return, CPI,
  and access control.
- Property controls need constraint editors for seeds, bump, payer, space,
  close destination, owner/address, has-one authority, and token/mint fields.
- Codegen must generate equivalent constraints per framework instead of
  downgrading to unchecked accounts.

Audit implications:

- `SW001`: authority fields using `UncheckedAccount`/`AccountInfo` or missing
  `Signer`/`signer` constraint.
- `SW002`: `AccountInfo`/unchecked deserialization without owner validation.
- `SW003`: CPI program accounts without address/program ID constraints.
- `SW004`: non-canonical or user-controlled PDA seeds/bump/seeds::program.
- `SW008`: CPI-mutated `Account` used after CPI without `reload()`.
- `SW009`/`SW010`: token accounts without mint/authority constraints.

## Pinocchio

Primary scan areas:

- `../pinocchio/sdk/src`
- `../pinocchio/sdk/src/entrypoint`
- `../pinocchio/programs`

Parser coverage priorities:

- Entry macros:
  - `entrypoint!`
  - `program_entrypoint!`
  - `lazy_program_entrypoint!`
- Dispatch styles:
  - numeric discriminator match arms
  - instruction enum/data unpacking
  - handler functions called from dispatch.
- Account model:
  - `AccountView`
  - `MaybeAccount`
  - owner checks through `owner()`
  - signer checks through account metadata.
- State/data:
  - packed structs
  - manual byte decoding
  - `from_bytes`/`from_account_view` style helpers.
- CPI:
  - `invoke`
  - `invoke_unchecked`
  - `invoke_signed`
  - `invoke_signed_unchecked`
  - `Signer`
  - token/system instruction builders.

High-value fixture sources:

- `../pinocchio/sdk/src/entrypoint`
- `../pinocchio/programs/token/src/instructions`
- `../pinocchio/programs/token-2022/src/instructions`
- `../pinocchio/programs/system/src/instructions`
- `../pinocchio/programs/associated-token-account/src`

Editor/codegen implications:

- Add support for manual-dispatch programs where there is no Anchor-style
  accounts struct.
- Model instruction discriminators explicitly.
- Token/system CPI nodes should emit Pinocchio instruction-builder code.
- Account parser should support explicit account index mapping and validation
  blocks.

Audit implications:

- `SW001`: `key`/address comparisons without signer metadata checks.
- `SW002`: state unpack/from-bytes helpers without nearby owner/length checks.
- `SW003`: `invoke_unchecked` or CPI target passed from user accounts.
- `SW005`: packed byte math, unchecked arithmetic, and `as` casts.
- `SW006`: manual account/instruction discrimination without discriminator
  validation.
- `SW008`: AccountView resize/CPI mutation use after invocation.

## Quasar

Primary scan areas:

- `../quasar/lang/src`
- `../quasar/derive/src`
- `../quasar/spl/src`
- `../quasar/idl/src`
- `../quasar/tests/programs`

Parser coverage priorities:

- Program handlers using `Ctx<T>` and `CtxWithRemaining<T>`.
- Account parsing through `#[derive(Accounts)]`.
- Account wrappers:
  - `Account<T>`
  - `InterfaceAccount<T>`
  - `Program<T>`
  - `Interface<T>`
  - `Signer`
  - `UncheckedAccount`
  - sysvars.
- Validation:
  - custom `validate()` implementations
  - token validation helpers
  - PDA checks
  - duplicate account aliases.
- Token features:
  - `token::mint`
  - `token::authority`
  - `mint::decimals`
  - `mint::authority`
  - `associated_token::mint`
  - `associated_token::authority`
  - Token-2022 and interface token variants.
- Events/errors:
  - `#[event]`
  - `#[error_code]`
  - Quasar IDL event/error model.
- IDL/codegen:
  - `ProgramFeatures`
  - PDA seed metadata
  - Python client generation
  - event decoding.

High-value fixture sources:

- `../quasar/tests/programs/test-events`
- `../quasar/tests/programs/test-errors`
- `../quasar/tests/programs/test-pda`
- `../quasar/tests/programs/test-sysvar`
- `../quasar/tests/programs/test-token-cpi`
- `../quasar/tests/programs/test-token-init`
- `../quasar/tests/programs/test-token-validate`
- `../quasar/examples/vault`
- `../quasar/examples/escrow`
- `../quasar/examples/multisig`

Editor/codegen implications:

- Quasar needs token/init/validate nodes, not only generic Anchor-style account
  nodes.
- Account property panels should expose Program vs Interface, Token vs
  Token-2022, and init vs init-if-needed modes.
- Codegen must support handler methods on account structs and module-based
  instruction files.

Audit implications:

- `SW001`: `UncheckedAccount` authority or token authority without Signer/PDA
  validation.
- `SW002`: custom account parsing without owner validation.
- `SW003`: token/CPI program account without Program/Interface validation.
- `SW004`: PDA checks using non-canonical derivation.
- `SW009`/`SW010`: missing Quasar SPL `validate_token_account`,
  `validate_mint`, or `validate_ata` equivalent.

## Codama

Primary scan areas:

- `../codama/packages/nodes`
- `../codama/packages/node-types`
- `../codama/packages/nodes-from-anchor`
- `../codama/packages/visitors`
- `../codama/packages/dynamic-client`
- `../codama/packages/dynamic-parsers`
- `../codama/packages/validators`

SDK generation implications:

- Use a typed node model as the bridge between IR/IDL and SDK output:
  - program nodes
  - instruction nodes
  - instruction accounts
  - instruction arguments
  - account nodes
  - defined type nodes
  - PDA nodes/seeds
  - discriminator nodes.
- Add visitors/passes for defaults:
  - payer/fee payer
  - authority
  - program IDs
  - system/token/ATA/sysvar program accounts
  - PDA default seed values.
- Dynamic client behavior should validate missing required accounts, optional
  accounts, resolvers, PDA derivation, and account default values.
- Parser output should preserve enough data for SDK generation:
  - account optionality
  - writable/signing flags
  - PDA seeds
  - discriminators
  - account defaults
  - instruction args
  - event decoders.

## Solana Kit

Primary scan areas:

- `../kit/packages/kit/src`
- `../kit/packages/transactions/src`
- `../kit/packages/transaction-messages/src`
- `../kit/packages/instructions/src`
- `../kit/packages/keys/src`
- `../kit/packages/addresses/src`
- `../kit/examples`

Runtime/test implications:

- Use Kit-style address, signer, transaction-message, and RPC boundaries in the
  future `@solflow/solana-runtime` package.
- Prefer explicit simulate/send/confirm paths for generated tests and Cloud
  wallet execution.
- Relevant patterns:
  - RPC creation and typed RPC APIs.
  - transaction simulation before send.
  - send-and-confirm with blockhash lifetime.
  - durable nonce confirmation.
  - transaction size/compute estimation.
  - keypair import/export helpers.
  - examples for signers, transfer lamports, token airdrop, RPC custom API.

## Next Implementation Slices

1. Parser fixtures:
   - Anchor SPL/interface/PDA/realloc.
   - Pinocchio program/lazy entrypoints and token instruction dispatch.
   - Quasar token init/validate/CPI and custom validate.

2. Editor nodes:
   - PDA account.
   - Token account.
   - Mint.
   - ATA.
   - Interface account/program.
   - CPI.
   - Event/error.
   - Account migration/realloc.

3. SDK generation:
   - Preserve Codama-compatible account defaults, PDA seeds, optionality, and
     discriminators from IR.
   - Add SDK-gen tests from generated framework fixtures.

4. Test runner:
   - Use framework adapters for build/test commands.
   - Use Kit runtime boundary for RPC/simulation/confirm where JS-side test
     orchestration is needed.

5. Audit:
   - Build SW001-SW010 fixtures across Anchor, Pinocchio, and Quasar.
   - Show the same finding format in CLI, web audit tab, and publish checks.
