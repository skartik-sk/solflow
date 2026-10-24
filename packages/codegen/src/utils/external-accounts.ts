import type { ProgramIR } from "@solflow/ir";

/** Account and program types from Token Metadata (Metaplex), which programs use but don't define. */
export const METADATA_TYPES = new Set(["MetadataAccount", "MasterEditionAccount", "Metadata"]);

/** A state type that comes from a library rather than the program's own `state` module. */
export function isExternalType(name: string | undefined, ir: ProgramIR): boolean {
  return !!name && METADATA_TYPES.has(name) && !ir.states.some((s) => s.name === name);
}

export function usesMetadata(ir: ProgramIR): boolean {
  return ir.instructions.some((ix) => ix.accounts.some((a) => isExternalType(a.stateType, ir)));
}
