// packages/audit/src/rules/index.ts
// IR-level static analysis rules — runs in-browser, instant.
// Per docs/architecture/14-audit-system.md

import type { ProgramIR, Account, Instruction, LogicOperation } from "@solflow/ir";
import type { AuditRule, AuditFinding, NodePatch } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasSigner(acc: Account): boolean {
  return (
    acc.constraints.some((c) => c.type === "signer") ||
    acc.accountType === "signer"
  );
}

function hasOwner(acc: Account): boolean {
  return acc.constraints.some((c) => c.type === "owner");
}

function hasMut(acc: Account): boolean {
  return acc.constraints.some((c) => c.type === "mut");
}

function isMutableOperation(op: LogicOperation): boolean {
  return (
    op.type === "set-field" ||
    op.type === "transfer-sol" ||
    op.type === "transfer-token" ||
    op.type === "mint-to" ||
    op.type === "burn"
  );
}

function flattenOps(ops: LogicOperation[]): LogicOperation[] {
  const result: LogicOperation[] = [];
  for (const op of ops) {
    result.push(op);
    if (op.type === "if-else") {
      result.push(...flattenOps(op.thenBody));
      if (op.elseBody) result.push(...flattenOps(op.elseBody));
    }
  }
  return result;
}

function instructionNodeId(ix: Instruction): string {
  return ix.sourceNodeId ?? ix.id;
}

function accountNodeId(acc: Account): string {
  return acc.sourceNodeId ?? acc.id;
}

function operationNodeId(op: LogicOperation, ix: Instruction): string {
  return op.sourceNodeId ?? instructionNodeId(ix);
}

function nodeLocation(ix: Instruction, acc?: Account): AuditFinding["location"] {
  return acc
    ? { instructionName: ix.name, accountName: acc.name, nodeId: accountNodeId(acc) }
    : { instructionName: ix.name, nodeId: instructionNodeId(ix) };
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export const RULES: AuditRule[] = [
  // ── ACCESS CONTROL ─────────────────────────────────────────────────────────

  {
    id: "SOL-001",
    name: "Missing Signer Check",
    description:
      "An account that performs privileged operations is not marked as signer",
    severity: "critical",
    category: "access-control",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        const flatOps = flattenOps(ix.body);
        for (const op of flatOps) {
          if (!isMutableOperation(op)) continue;

          // For set-field, flag user/system accounts that perform writes without a signer.
          // Program-owned data accounts (accountType "account" or with a stateType) are
          // legitimately written by the program itself — the *authority* signer is checked
          // separately. Only flag system-account / unchecked-account used as the writer.
          if (op.type === "set-field") {
            const acc = ix.accounts.find((a) => a.name === op.account);
            const isProgramOwned =
              acc?.accountType === "account" || !!acc?.stateType;
            if (acc && !hasSigner(acc) && hasMut(acc) && !isProgramOwned) {
              findings.push({
                ruleId: "SOL-001",
                severity: "critical",
                title: `Missing signer check on "${acc.name}"`,
                description: `Account "${acc.name}" in instruction "${ix.name}" has mutable state changes but no signer constraint.`,
                location: nodeLocation(ix, acc),
                recommendation:
                  "Add a signer constraint to the account performing privileged writes.",
                cweId: "CWE-862",
              });
            }
          }

          // For transfer-sol, the from account must be a signer
          if (op.type === "transfer-sol") {
            const fromAcc = ix.accounts.find((a) => a.name === op.from);
            if (fromAcc && !hasSigner(fromAcc)) {
              findings.push({
                ruleId: "SOL-001",
                severity: "critical",
                title: `Missing signer on SOL transfer source "${op.from}"`,
                description: `The source account "${op.from}" for a SOL transfer in "${ix.name}" is not a signer.`,
                location: nodeLocation(ix, fromAcc),
                recommendation:
                  "Ensure the SOL transfer source account has a signer constraint.",
                cweId: "CWE-862",
              });
            }
          }
        }
      }
      return findings;
    },
    // Auto-fix: add a signer constraint to the flagged account's node data.
    // The node's `data.constraints` array is extended with { type: "signer" }.
    autoFix: (ir: ProgramIR, finding: AuditFinding): NodePatch[] => {
      const patches: NodePatch[] = [];
      const ixName = finding.location.instructionName;
      const accName = finding.location.accountName;
      if (!ixName || !accName) return patches;

      const ix = ir.instructions.find((i) => i.name === ixName);
      if (!ix) return patches;
      const acc = ix.accounts.find((a) => a.name === accName);
      if (!acc || !acc.id) return patches;

      // Patch the original account node when sourceNodeId is available.
      const alreadyHasSigner = acc.constraints.some((c) => c.type === "signer");
      if (!alreadyHasSigner) {
        patches.push({
          nodeId: accountNodeId(acc),
          data: {
            constraints: [...acc.constraints, { type: "signer" }],
          },
        });
      }
      return patches;
    },
  },

  {
    id: "SOL-002",    name: "Missing Owner Check",
    description:
      "Program-owned account is not verified to be owned by the expected program",
    severity: "high",
    category: "account-validation",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          if (acc.accountType === "unchecked-account") {
            if (!hasOwner(acc) && !hasSigner(acc)) {
              findings.push({
                ruleId: "SOL-002",
                severity: "high",
                title: `Missing owner check on unchecked account "${acc.name}"`,
                description: `UncheckedAccount "${acc.name}" in "${ix.name}" has no owner validation. An attacker could pass a fake account.`,
                location: nodeLocation(ix, acc),
                recommendation:
                  "Add an owner constraint or use a typed account instead of UncheckedAccount.",
                cweId: "CWE-345",
              });
            }
          }
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-003",
    name: "Missing Account Discriminator Check",
    description:
      "Account type is not verified via discriminator (type cosplay vulnerability)",
    severity: "high",
    category: "account-validation",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      // Only relevant for Pinocchio — Anchor handles this automatically.
      // We flag UncheckedAccounts that have a stateType hint but no owner check.
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          if (
            acc.accountType === "unchecked-account" &&
            acc.stateType &&
            !hasOwner(acc)
          ) {
            findings.push({
              ruleId: "SOL-003",
              severity: "high",
              title: `Potential type cosplay on "${acc.name}"`,
              description: `Account "${acc.name}" references state type "${acc.stateType}" but has no owner constraint to prevent type cosplay.`,
              location: nodeLocation(ix, acc),
              recommendation:
                "Add an owner constraint to verify the account is owned by this program.",
              cweId: "CWE-345",
            });
          }
        }
      }
      return findings;
    },
  },

  // ── ARITHMETIC ─────────────────────────────────────────────────────────────

  {
    id: "SOL-010",
    name: "Unchecked Arithmetic",
    description: "Math operations without overflow/underflow protection",
    severity: "high",
    category: "arithmetic",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        const flatOps = flattenOps(ix.body);
        for (const op of flatOps) {
          if (op.type === "math" && !op.checked) {
            findings.push({
              ruleId: "SOL-010",
              severity: "high",
              title: `Unchecked ${op.operation} in "${ix.name}"`,
              description: `Math operation "${op.operation}" is not using checked arithmetic. This can lead to overflow/underflow.`,
              location: { ...nodeLocation(ix), nodeId: operationNodeId(op, ix) },
              recommendation:
                'Enable "checked" on the math operation node to use checked_add/checked_sub/etc.',
              cweId: "CWE-190",
            });
          }
        }
      }
      return findings;
    },
    // Auto-fix: prefer the original math logic node; fall back to the instruction
    // node for old IR payloads that do not carry sourceNodeId yet.
    autoFix: (ir: ProgramIR, finding: AuditFinding): NodePatch[] => {
      const patches: NodePatch[] = [];
      const ixName = finding.location.instructionName;
      if (!ixName) return patches;

      const ix = ir.instructions.find((i) => i.name === ixName);
      if (!ix) return patches;

      const updatedBody = ix.body.map((op) => {
        if (op.type === "math" && !op.checked) {
          return { ...op, checked: true };
        }
        return op;
      });
      const targetsLogicNode =
        !!finding.location.nodeId &&
        flattenOps(ix.body).some((op) => op.sourceNodeId === finding.location.nodeId);

      patches.push({
        nodeId: finding.location.nodeId ?? instructionNodeId(ix),
        data: targetsLogicNode ? { mathChecked: true } : { body: updatedBody },
      });
      return patches;
    },
  },

  {
    id: "SOL-020",    name: "PDA Seed Collision Risk",
    description:
      "PDA seeds may not be unique enough, allowing account collision",
    severity: "medium",
    category: "pda-security",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      // Track seed patterns across all PDAs in all instructions
      const seenPatterns = new Map<string, string>();

      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          const seedsConstraint = acc.constraints.find(
            (c) => c.type === "seeds",
          );
          if (!seedsConstraint || seedsConstraint.type !== "seeds") continue;

          const seeds = seedsConstraint.seeds;
          // Only literal seeds (no user-specific data) = high collision risk
          const allLiteral = seeds.every((s) => s.type === "literal");
          if (allLiteral && seeds.length > 0) {
            const pattern = seeds.map((s) => s.value).join("|");
            const existing = seenPatterns.get(pattern);
            if (existing) {
              findings.push({
                ruleId: "SOL-020",
                severity: "medium",
                title: `PDA seed collision between "${acc.name}" and "${existing}"`,
                description: `Two PDA accounts share identical literal seeds "${pattern}". This could cause collisions.`,
                location: nodeLocation(ix, acc),
                recommendation:
                  "Add user-specific seeds (e.g., user pubkey) to make PDAs unique per user.",
                cweId: "CWE-330",
              });
            } else {
              seenPatterns.set(pattern, acc.name);
            }
          }
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-021",
    name: "Missing Bump Verification",
    description: "PDA bump is not stored or verified on subsequent calls",
    severity: "medium",
    category: "pda-security",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          const seedsConstraint = acc.constraints.find(
            (c) => c.type === "seeds",
          );
          if (!seedsConstraint || seedsConstraint.type !== "seeds") continue;
          // If bump is not stored (no bump field), flag it
          if (!seedsConstraint.bump) {
            findings.push({
              ruleId: "SOL-021",
              severity: "medium",
              title: `PDA "${acc.name}" does not store/verify bump`,
              description: `The PDA "${acc.name}" in "${ix.name}" uses seeds but does not specify a bump field. Canonical bump should be stored and re-verified.`,
              location: nodeLocation(ix, acc),
              recommendation:
                "Store the canonical bump in account data and use it in the seeds constraint (bump = account.bump).",
            });
          }
        }
      }
      return findings;
    },
  },

  // ── TOKEN SECURITY ─────────────────────────────────────────────────────────

  {
    id: "SOL-030",
    name: "Missing Mint Check",
    description: "Token account mint is not validated",
    severity: "high",
    category: "token-security",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          if (
            acc.accountType === "token-account" ||
            acc.accountType === "associated-token"
          ) {
            const hasMintCheck = acc.constraints.some(
              (c) => c.type === "token-mint",
            );
            if (!hasMintCheck) {
              findings.push({
                ruleId: "SOL-030",
                severity: "high",
                title: `Missing mint check on token account "${acc.name}"`,
                description: `Token account "${acc.name}" in "${ix.name}" has no mint constraint. An attacker could pass a token account with a different mint.`,
                location: nodeLocation(ix, acc),
                recommendation:
                  "Add a token-mint constraint to verify the token account belongs to the expected mint.",
                cweId: "CWE-345",
              });
            }
          }
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-031",
    name: "Missing Token Authority Check",
    description: "Token account authority is not validated",
    severity: "high",
    category: "token-security",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        const flatOps = flattenOps(ix.body);
        for (const op of flatOps) {
          if (
            op.type === "transfer-token" ||
            op.type === "mint-to" ||
            op.type === "burn"
          ) {
            const authAcc = ix.accounts.find((a) => a.name === op.authority);
            if (authAcc) {
              const hasAuthorityConstraint = authAcc.constraints.some(
                (c) => c.type === "token-authority",
              );
              if (!hasAuthorityConstraint && !hasSigner(authAcc)) {
                findings.push({
                  ruleId: "SOL-031",
                  severity: "high",
                  title: `Missing token authority check on "${authAcc.name}"`,
                  description: `Account "${authAcc.name}" is used as token authority in "${ix.name}" but has no authority constraint or signer check.`,
                  location: nodeLocation(ix, authAcc),
                  recommendation:
                    "Add a token-authority constraint or signer constraint to the authority account.",
                  cweId: "CWE-862",
                });
              }
            }
          }
        }
      }
      return findings;
    },
  },

  // ── CPI SECURITY ───────────────────────────────────────────────────────────

  {
    id: "SOL-040",
    name: "CPI to Unverified Program",
    description: "Cross-program invocation to a program that is not validated",
    severity: "critical",
    category: "cpi-security",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        const flatOps = flattenOps(ix.body);
        for (const op of flatOps) {
          if (op.type === "cpi") {
            const targetAcc = ix.accounts.find(
              (a) => a.name === op.targetProgram,
            );
            if (targetAcc) {
              const hasAddressCheck = targetAcc.constraints.some(
                (c) => c.type === "address",
              );
              const isKnownProgram =
                targetAcc.accountType === "system-program" ||
                targetAcc.accountType === "token-program" ||
                targetAcc.accountType === "associated-token-program";
              if (!hasAddressCheck && !isKnownProgram) {
                findings.push({
                  ruleId: "SOL-040",
                  severity: "critical",
                  title: `CPI to unverified program "${op.targetProgram}"`,
                  description: `Instruction "${ix.name}" performs a CPI to "${op.targetProgram}" without verifying the program address.`,
                  location: nodeLocation(ix, targetAcc),
                  recommendation:
                    "Add an address constraint on the target program account to ensure only the expected program can be called.",
                  cweId: "CWE-346",
                });
              }
            }
          }
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-041",
    name: "Account Not Reloaded After CPI",
    description: "Account data may be stale after CPI call",
    severity: "medium",
    category: "cpi-security",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        const flatOps = flattenOps(ix.body);
        const cpiOps = flatOps.filter((op) => op.type === "cpi");
        if (cpiOps.length === 0) continue;

        // After any CPI, if there are set-field operations on accounts passed to the CPI,
        // the account data might be stale.
        for (const cpiOp of cpiOps) {
          if (cpiOp.type !== "cpi") continue;
          const cpiAccountNames = new Set(cpiOp.accounts.map((a) => a.from));
          const afterCpiIdx = flatOps.indexOf(cpiOp) + 1;
          for (let i = afterCpiIdx; i < flatOps.length; i++) {
            const afterOp = flatOps[i];
            if (
              afterOp.type === "set-field" &&
              cpiAccountNames.has(afterOp.account)
            ) {
              const account = ix.accounts.find((a) => a.name === afterOp.account);
              findings.push({
                ruleId: "SOL-041",
                severity: "medium",
                title: `Possible stale account data after CPI in "${ix.name}"`,
                description: `Account "${afterOp.account}" is written after a CPI in "${ix.name}" without a reload. Data from before the CPI may be stale.`,
                location: account
                  ? nodeLocation(ix, account)
                  : {
                      instructionName: ix.name,
                      accountName: afterOp.account,
                      nodeId: operationNodeId(afterOp, ix),
                    },
                recommendation:
                  "Reload account data after CPI calls by re-reading account state if needed.",
              });
              break; // One finding per CPI per instruction is enough
            }
          }
        }
      }
      return findings;
    },
  },

  // ── DATA VALIDATION ────────────────────────────────────────────────────────

  {
    id: "SOL-050",
    name: "Missing Input Validation",
    description: "Instruction arguments are not validated before use",
    severity: "medium",
    category: "data-validation",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        if (ix.args.length === 0) continue;
        const flatOps = flattenOps(ix.body);

        // Check if there are any require() calls validating args
        const hasRequire = flatOps.some((op) => op.type === "require");

        // If there are numeric args used in math or transfers, and no require, flag it
        const numericTypes = [
          "u8",
          "u16",
          "u32",
          "u64",
          "u128",
          "i8",
          "i16",
          "i32",
          "i64",
          "i128",
        ];
        const hasNumericArgs = ix.args.some(
          (a) => typeof a.type === "string" && numericTypes.includes(a.type),
        );

        if (hasNumericArgs && !hasRequire) {
          const hasMathOrTransfer = flatOps.some(
            (op) =>
              op.type === "math" ||
              op.type === "transfer-sol" ||
              op.type === "transfer-token" ||
              op.type === "mint-to",
          );
          if (hasMathOrTransfer) {
            findings.push({
              ruleId: "SOL-050",
              severity: "medium",
              title: `Missing input validation in "${ix.name}"`,
              description: `Instruction "${ix.name}" uses numeric arguments in math/transfer operations but has no require() validation.`,
              location: {
                ...nodeLocation(ix),
                nodeId: flatOps.find(
                  (op) =>
                    op.type === "math" ||
                    op.type === "transfer-sol" ||
                    op.type === "transfer-token" ||
                    op.type === "mint-to",
                )?.sourceNodeId ?? instructionNodeId(ix),
              },
              recommendation:
                "Add require() checks (Logic > Require node) to validate argument bounds before use.",
              cweId: "CWE-20",
            });
          }
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-051",
    name: "Close Account Without Zeroing Data",
    description:
      "Account is closed but data is not zeroed, potentially leaking info",
    severity: "low",
    category: "data-validation",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          const closeConstraint = acc.constraints.find(
            (c) => c.type === "close",
          );
          if (!closeConstraint) continue;

          // Check if there's an explicit zero-init after close (custom-code or set-field zeroing)
          const flatOps = flattenOps(ix.body);
          const hasZeroOp = flatOps.some(
            (op) =>
              op.type === "custom-code" &&
              op.code.toLowerCase().includes("zero"),
          );

          if (!hasZeroOp) {
            findings.push({
              ruleId: "SOL-051",
              severity: "low",
              title: `Account "${acc.name}" closed without zeroing data`,
              description: `Account "${acc.name}" in "${ix.name}" uses a close constraint but residual data is not explicitly zeroed. This may leak information.`,
              location: nodeLocation(ix, acc),
              recommendation:
                "Use Anchor's close constraint which zeros data automatically, or add explicit zeroing in a custom code block.",
            });
          }
        }
      }
      return findings;
    },
  },

  // ── DENIAL OF SERVICE ──────────────────────────────────────────────────────

  {
    id: "SOL-060",
    name: "Unbounded Iteration",
    description: "Loop without bounds could exceed compute budget",
    severity: "medium",
    category: "denial-of-service",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      // Look for custom-code blocks that contain loops
      for (const ix of ir.instructions) {
        const flatOps = flattenOps(ix.body);
        for (const op of flatOps) {
          if (op.type === "custom-code") {
            const hasLoop =
              op.code.includes("for ") ||
              op.code.includes("while ") ||
              op.code.includes(".iter()") ||
              op.code.includes(".for_each(");
            if (hasLoop) {
              findings.push({
                ruleId: "SOL-060",
                severity: "medium",
                title: `Potential unbounded iteration in "${ix.name}"`,
                description: `Custom code block in "${ix.name}" contains a loop. If the collection size is unbounded, it may exceed the compute budget.`,
                location: { ...nodeLocation(ix), nodeId: operationNodeId(op, ix) },
                recommendation:
                  "Add a maximum size bound to collections and verify the loop will not exceed compute limits (~200k CUs per instruction).",
              });
            }
          }
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-061",
    name: "Large Account Realloc",
    description: "Realloc without maximum bounds could fail or be expensive",
    severity: "low",
    category: "denial-of-service",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          const reallocConstraint = acc.constraints.find(
            (c) => c.type === "realloc",
          );
          if (!reallocConstraint || reallocConstraint.type !== "realloc")
            continue;
          // Solana limits realloc to 10KB per instruction
          if (reallocConstraint.space > 10_240) {
            findings.push({
              ruleId: "SOL-061",
              severity: "low",
              title: `Realloc of ${reallocConstraint.space} bytes on "${acc.name}" may fail`,
              description: `Account "${acc.name}" in "${ix.name}" requests a realloc of ${reallocConstraint.space} bytes, which exceeds the 10KB per-instruction realloc limit.`,
              location: nodeLocation(ix, acc),
              recommendation:
                "Realloc in increments ≤ 10,240 bytes across multiple instructions, or reconsider the account structure.",
            });
          }
        }
      }
      return findings;
    },
  },
];
