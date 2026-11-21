// The `deposit` handler of the vault template, as @solflow/codegen writes it.
// Generated with generateCode(vaultIR, framework) on
// packages/browser-compiler/toolchain/fixtures/vault-ir.json. Lines are verbatim;
// Quasar's excerpt is shown dedented by one level, and one emit! field's stray
// indent is set to its block's depth (what rustfmt would do).

export type FrameworkId = "anchor" | "pinocchio" | "quasar";

export interface Excerpt {
  id: FrameworkId;
  name: string;
  file: string;
  /** Line number of the first line, in the generated file */
  start: number;
  lines: string[];
  /** Line numbers (in the file) that enforce the graph's `amount > 0` constraint */
  mark: number[];
  where: string;
  short: string;
  size: string | null;
}

export const EXCERPTS: Excerpt[] = [
  {
    id: "anchor",
    name: "Anchor",
    file: "instructions/deposit.rs",
    start: 6,
    mark: [7],
    where: "Compiled on the server",
    short: "On the server",
    size: null,
    lines: [
      "pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {",
      "    require!(amount > 0, VaultError::InvalidAmount);",
      "    let vault = &mut ctx.accounts.vault;",
      "    let amount: u64 = amount;",
      "    let cpi_accounts = anchor_lang::system_program::Transfer {",
      "        from: ctx.accounts.authority.to_account_info(),",
      "        to: vault.to_account_info(),",
      "    };",
      "    let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);",
      "    anchor_lang::system_program::transfer(cpi_ctx, amount)?;",
      "    let new_balance = vault.balance.checked_add(amount).ok_or(ProgramError::InvalidArgument)?;",
      "    vault.balance = new_balance;",
    ],
  },
  {
    id: "pinocchio",
    name: "Pinocchio",
    file: "instructions/deposit.rs",
    start: 40,
    mark: [40, 41, 42],
    where: "Compiled in your browser",
    short: "In your browser",
    size: "11,392",
    lines: [
      "    if !(amount > 0) {",
      "        return Err(VaultError::InvalidAmount.into());",
      "    }",
      "    {",
      "        use pinocchio_system::instructions::Transfer;",
      "        let amount: u64 = amount;",
      "        Transfer {",
      "            from: authority,",
      "            to: vault,",
      "            lamports: amount,",
      "        }",
      "        .invoke()?;",
      "    }",
    ],
  },
  {
    id: "quasar",
    name: "Quasar",
    file: "src/lib.rs",
    start: 29,
    mark: [31],
    where: "Compiled in your browser",
    short: "In your browser",
    size: "10,432",
    lines: [
      "#[instruction(discriminator = 1)]",
      "pub fn deposit(ctx: Ctx<Deposit>, amount: u64) -> Result<(), ProgramError> {",
      "    require!(amount > 0, VaultError::InvalidAmount);",
      "    ctx.accounts.system_program.transfer(ctx.accounts.authority, ctx.accounts.vault, amount).invoke()?;",
      "    let vault_account = &mut ctx.accounts.vault;",
      "    let new_balance = u64::from(vault_account.balance).checked_add(amount).ok_or(ProgramError::InvalidArgument)?;",
      "    vault_account.balance = PodU64::from(new_balance);",
      "    emit!(DepositEvent {",
      "        authority: *ctx.accounts.authority.address(),",
      "        amount: amount,",
      "        new_balance: new_balance,",
      "    });",
      "    Ok(())",
      "}",
    ],
  },
];

export type TokenKind = "com" | "str" | "num" | "key" | "mac" | "type" | "fn" | "attr" | "punct" | null;

const KEYWORDS = new Set([
  "pub", "fn", "let", "mut", "if", "else", "return", "use", "impl", "struct", "enum", "match", "as", "ref",
  "self", "Self", "crate", "super", "mod", "const", "static", "true", "false", "for", "in", "while", "loop",
]);
const PRIMS = new Set(["u8", "u16", "u32", "u64", "u128", "i64", "bool", "usize"]);

/** A small Rust tokenizer: enough for a handler excerpt, nothing more. */
export function rustTokens(line: string): { text: string; kind: TokenKind }[] {
  const out: { text: string; kind: TokenKind }[] = [];
  if (/^\s*#\[/.test(line)) return [{ text: line, kind: "attr" }];
  const re =
    /(\/\/.*$)|(b?"(?:[^"\\]|\\.)*")|(\b\d[\d_]*\b)|([A-Za-z_]\w*!)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)|([{}()[\];,.:&*?!<>=|+-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), kind: null });
    const [text, com, str, num, mac, call, word, punct] = m;
    let kind: TokenKind = null;
    if (com) kind = "com";
    else if (str) kind = "str";
    else if (num) kind = "num";
    else if (mac) kind = "mac";
    else if (call) kind = KEYWORDS.has(call) ? "key" : /^[A-Z]/.test(call) ? "type" : "fn";
    else if (word) kind = KEYWORDS.has(word) ? "key" : PRIMS.has(word) || /^[A-Z]/.test(word) ? "type" : null;
    else if (punct) kind = "punct";
    out.push({ text, kind });
    last = m.index + text.length;
  }
  if (last < line.length) out.push({ text: line.slice(last), kind: null });
  return out;
}
