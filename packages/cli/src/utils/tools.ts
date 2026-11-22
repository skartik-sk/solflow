// Friendly errors for missing local toolchains.

const TOOL_HINTS: Record<string, string> = {
  anchor: "Install the Anchor CLI (avm): https://www.anchor-lang.com/docs/installation",
  cargo: "Install Rust (https://rustup.rs) and the Solana CLI for cargo build-sbf: https://solana.com/docs/intro/installation",
  solana: "Install the Solana CLI: https://solana.com/docs/intro/installation",
  surfpool: "Install Surfpool (https://surfpool.run) or re-run with --no-setup to skip simnet setup",
};

/** Clear message for a required tool that is not on PATH. */
export function missingToolMessage(cmd: string): string {
  const hint = TOOL_HINTS[cmd] ?? "Install it and make sure it is on your PATH.";
  return `\`${cmd}\` was not found on your PATH. ${hint}`;
}
