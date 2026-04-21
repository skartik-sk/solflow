// Anchor-specific regex patterns used by all parsers.

// ─── Program ─────────────────────────────────────────────────────────

/** Match #[program] mod declaration */
export const RE_PROGRAM_BLOCK = /#\[program\]\s*(?:\/\/\/\s*(.*))?\s*pub\s+mod\s+(\w+)\s*\{/;

/** Match instruction handler inside #[program] block */
export const RE_INSTRUCTION_FN =
  /(?:\/\/\/\s*(.*))?\s*pub\s+fn\s+(\w+)\s*\(\s*ctx\s*:\s*Context\s*<\s*(\w+)\s*>\s*(?:,\s*(.+?))?\s*\)\s*(?:->\s*Result\s*<\s*\(\)\s*>\s*)?\{/g;

/** Match a fn signature more broadly (for handler bodies already extracted) */
export const RE_FN_SIG =
  /pub\s+fn\s+(\w+)\s*\(\s*ctx\s*:\s*Context\s*<\s*(\w+)\s*>\s*(?:,\s*(.+?))?\s*\)/;

// ─── Accounts ────────────────────────────────────────────────────────

/** Match #[derive(Accounts)] struct */
export const RE_ACCOUNTS_STRUCT =
  /(?:#\[instruction\s*\(([^)]*)\)\s*\])?\s*#\[derive\s*\(\s*Accounts\s*\)\s*\]\s*(?:\/\/\/\s*(.*))?\s*pub\s+struct\s+(\w+)\s*<\s*'info\s*>\s*\{/;

/** Match a field inside an Accounts struct */
export const RE_ACCOUNT_FIELD =
  /(?:\/\/\/\s*(.*))?\s*(?:#\[account\(([^)]*)\)\]|\[([^\]]+)\])\s*(?:\/\/\/\s*(.*))?\s*pub\s+(\w+)\s*:\s*(.+?)(?:,|$)/gm;

// ─── State ───────────────────────────────────────────────────────────

/** Match #[account] (data struct, not inside Accounts derive) */
export const RE_STATE_STRUCT =
  /#\[account\s*(?:\(([^)]*)\))?\]\s*(?:\/\/\/\s*(.*))?\s*pub\s+struct\s+(\w+)\s*\{/;

// ─── Errors ──────────────────────────────────────────────────────────

/** Match #[error_code] enum */
export const RE_ERROR_ENUM = /#\[error_code\]\s*pub\s+enum\s+(\w+)\s*\{/;

/** Match an error variant */
export const RE_ERROR_VARIANT = /#\[msg\s*\(\s*"([^"]+)"\s*\)\s*\]\s*(\w+)/g;

// ─── Events ──────────────────────────────────────────────────────────

/** Match #[event] struct */
export const RE_EVENT_STRUCT = /#\[event\]\s*pub\s+struct\s+(\w+)\s*\{/;

// ─── Constraints ─────────────────────────────────────────────────────

/** Parse individual constraint tokens from an #[account(...)] attribute */
export const RE_CONSTRAINT_TOKENS =
  /(?:init_if_needed|init|mut|signer|close\s*=\s*(\w+)|has_one\s*=\s*(\w+)|payer\s*=\s*(\w+)|space\s*=\s*([^,\)]+)|seeds\s*=\s*(\[.*?\])\s*(?:,\s*bump(?:\s*=\s*(\w+))?)?|bump|constraint\s*=\s*([^,\)]+)|token::authority\s*=\s*(\w+)|token::mint\s*=\s*(\w+)|mint::authority\s*=\s*(\w+)|mint::decimals\s*=\s*(\d+))/g;

// ─── Logic operations ────────────────────────────────────────────────

/** set-field: account.field = value; (not let bindings) */
export const RE_SET_FIELD =
  /(?<!let\s+)(?<!let\s+mut\s+)(\w+)\.(\w+)\s*=\s*([^;]+);/g;

/** require! macro */
export const RE_REQUIRE =
  /require(_\w+)?!\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/g;

/** transfer sol */
export const RE_TRANSFER_SOL =
  /anchor_lang::system_program::transfer\s*\(\s*(\w+)\s*,\s*([^)]+)\)/g;

/** Transfer struct (used before transfer call) */
export const RE_TRANSFER_STRUCT =
  /Transfer\s*\{\s*from\s*:\s*(\w+)\s*,\s*to\s*:\s*(\w+)\s*\}/;

/** transfer token */
export const RE_TRANSFER_TOKEN =
  /anchor_spl::token::(?:transfer|transfer_checked)\s*\(\s*(\w+)\s*,\s*([^,)]+)(?:,\s*([^,)]+))?\)/g;

/** mint_to */
export const RE_MINT_TO =
  /anchor_spl::token::mint_to\s*\(\s*(\w+)\s*,\s*([^)]+)\)/g;

/** burn */
export const RE_BURN =
  /anchor_spl::token::burn\s*\(\s*(\w+)\s*,\s*([^)]+)\)/g;

/** emit! macro */
export const RE_EMIT = /emit!\s*\(\s*(\w+)\s*\{/g;

/** return err! */
export const RE_RETURN_ERR = /return\s+err!\s*\(\s*(\w+)\s*\)/g;

/** checked math operations */
export const RE_CHECKED_MATH =
  /(\w+)\s*=\s*(\w+)\.(?:checked_add|checked_sub|checked_mul|checked_div|checked_rem)\s*\(\s*(\w+)\s*\)/g;

/** direct arithmetic */
export const RE_DIRECT_MATH =
  /let\s+mut?\s+(\w+)\s*=\s*(\w+)\s*(\+|-|\*|\/|%)\s*(\w+)\s*;/g;

/** CpiContext::new */
export const RE_CPI_CONTEXT =
  /CpiContext::new(?:_with_signer)?\s*\(\s*(\w+)\s*,/g;

/** invoke_signed */
export const RE_INVOKE_SIGNED = /invoke_signed\s*\(/g;

/** if statement */
export const RE_IF = /\bif\s+(.+?)\s*\{/g;

/** else block */
export const RE_ELSE = /\}\s*else\s*\{/g;
