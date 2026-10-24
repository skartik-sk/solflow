import type { Instruction, Seed } from "@solflow/ir";

/**
 * Seeds a PDA signs with, minus the bump. Flows write the bump as a seed like `"vault.bump"`;
 * generators append the real bump byte themselves, so that marker is dropped here.
 * Returns the PDA account (the bump's owner) when it can be determined.
 */
export function splitSignerSeeds(
  seeds: Seed[],
  authority: string,
  ix?: Instruction,
): { seeds: Seed[]; pda: string | undefined } {
  const isBump = (s: Seed) => /^\w+\.bump$/.test(s.value);
  const marker = seeds.find(isBump);
  const pda = marker ? marker.value.split(".")[0] : authority;
  const isPda = ix?.accounts.some((a) => a.name === pda && a.constraints.some((c) => c.type === "seeds"));
  const rest = seeds.filter((s) => !isBump(s));
  // No seeds given for a PDA signer: it signs with the seeds it was derived from.
  const own = ix?.accounts.find((a) => a.name === pda)?.constraints.find((c) => c.type === "seeds");
  const signing = rest.length || own?.type !== "seeds" ? rest : own.seeds;
  return { seeds: signing, pda: marker || isPda ? pda : undefined };
}

/** How a lamport transfer out of `from` has to be done. */
export function solTransferKind(from: string, ix?: Instruction): "plain" | "pda-signed" | "program-owned" {
  const account = ix?.accounts.find((a) => a.name === from);
  if (!account) return "plain";
  // Our program owns it: the System Program can't debit it, the program moves lamports directly.
  if (account.accountType === "account" && account.stateType) return "program-owned";
  return account.constraints.some((c) => c.type === "seeds") ? "pda-signed" : "plain";
}
