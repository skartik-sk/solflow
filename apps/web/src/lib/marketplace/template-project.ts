// apps/web/src/lib/marketplace/template-project.ts
// Build the data for a new project copied from a marketplace template.
// Templates are sanitized (programId stripped), so every copy gets its own
// program keypair. The program id is written to the program node
// (data.programId) AND to irData.program.programId, the same fields deploy.ts
// reads, so declare_id! matches and the IR hash used by the compile/deploy
// stale check stays consistent.

import { Keypair } from "@solana/web3.js";
import { encodeSecretKey } from "@/server/secret-key-crypto";

type Framework = "ANCHOR" | "PINOCCHIO" | "QUASAR";

interface FlowLike {
  nodes?: Array<{ type?: string; data?: Record<string, unknown> } & Record<string, unknown>>;
  edges?: unknown[];
  [key: string]: unknown;
}

export interface TemplateProjectData {
  framework: Framework;
  flowData: Record<string, unknown>;
  irData: Record<string, unknown> | undefined;
  programKeypair: string;
  programId: string;
}

export function buildProjectFromTemplate(
  template: { templateFlowData: unknown; templateIR: unknown },
  sourceFramework: Framework | null | undefined,
  fallbackFramework: Framework = "ANCHOR",
): TemplateProjectData {
  const programKp = Keypair.generate();
  const programId = programKp.publicKey.toBase58();

  const flow = clone((template.templateFlowData ?? {}) as FlowLike);
  const nodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  flow.nodes = nodes.map((node) =>
    node?.type === "program"
      ? { ...node, data: { ...(node.data ?? {}), programId } }
      : node,
  );
  if (!Array.isArray(flow.edges)) flow.edges = [];

  let irData: Record<string, unknown> | undefined;
  const ir = template.templateIR as { program?: Record<string, unknown> } | null;
  if (ir && typeof ir === "object" && ir.program && typeof ir.program === "object") {
    irData = clone(ir as Record<string, unknown>);
    irData.program = { ...(irData.program as Record<string, unknown>), programId };
  }

  return {
    framework: sourceFramework ?? fallbackFramework,
    flowData: flow,
    irData,
    programKeypair: encodeSecretKey(programKp.secretKey),
    programId,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
