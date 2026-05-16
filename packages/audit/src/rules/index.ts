// packages/audit/src/rules/index.ts
// IR-level static analysis rules — runs in-browser, instant.
// Per docs/architecture/14-audit-system.md

import type {
  ProgramIR,
  Account,
  Instruction,
  LogicOperation,
} from "@solflow/ir";
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

function hasConstraint(
  acc: Account,
  type: Account["constraints"][number]["type"],
): boolean {
  return acc.constraints.some((c) => c.type === type);
}

function isWritableByConstraint(acc: Account): boolean {
  return (
    hasMut(acc) ||
    acc.constraints.some(
      (c) =>
        c.type === "init" ||
        c.type === "init-if-needed" ||
        c.type === "realloc" ||
        c.type === "close",
    )
  );
}

function hasStrongValidation(acc: Account): boolean {
  return acc.constraints.some(
    (c) =>
      c.type === "signer" ||
      c.type === "owner" ||
      c.type === "address" ||
      c.type === "seeds" ||
      c.type === "has-one" ||
      c.type === "token-authority" ||
      c.type === "token-mint" ||
      c.type === "associated-token-authority" ||
      c.type === "associated-token-mint" ||
      c.type === "mint-authority" ||
      c.type === "custom",
  );
}

function isProgramDataAccount(acc: Account): boolean {
  return acc.accountType === "account" || !!acc.stateType;
}

function matchesNameToken(value: string, tokens: string[]): boolean {
  return tokens.some((token) => value.includes(token));
}

function looksLikeDataAccount(acc: Account): boolean {
  const value = `${acc.name} ${acc.stateType ?? ""}`.toLowerCase();
  return (
    isProgramDataAccount(acc) ||
    matchesNameToken(value, [
      "state",
      "vault",
      "escrow",
      "pool",
      "position",
      "order",
      "profile",
      "config",
      "treasury",
      "registry",
      "record",
      "account",
    ])
  );
}

function looksLikeDisposableAccount(acc: Account): boolean {
  const value = `${acc.name} ${acc.stateType ?? ""}`.toLowerCase();
  return matchesNameToken(value, [
    "temp",
    "temporary",
    "scratch",
    "session",
    "escrow",
    "offer",
    "trade",
    "claim",
    "receipt",
    "disposable",
  ]);
}

function looksLikeAuthorityAccount(acc: Account): boolean {
  return /\b(authority|owner|admin|payer|user|maker|taker|signer)\b/i.test(
    acc.name,
  );
}

function looksLikeTokenHoldingAccount(acc: Account): boolean {
  return (
    acc.accountType === "token-account" ||
    acc.accountType === "associated-token"
  );
}

function inferRoleForTokenAccount(
  acc: Account,
  accountNames: Set<string>,
): string | undefined {
  const tokenName = acc.name.toLowerCase();
  const suffixes = [
    "_token_account",
    "_associated_token_account",
    "_associated_token",
    "_token",
    "_ata",
    "_ta",
  ];

  for (const accountName of accountNames) {
    if (accountName === acc.name) continue;
    const roleName = accountName.toLowerCase();
    if (
      suffixes.some((suffix) => tokenName === `${roleName}${suffix}`) ||
      (tokenName.startsWith(`${roleName}_`) && tokenName.includes("token"))
    ) {
      return accountName;
    }
  }

  return undefined;
}

function hasTokenRoleAnchor(acc: Account, roleName: string): boolean {
  return acc.constraints.some((c) => {
    if (
      (c.type === "token-authority" ||
        c.type === "associated-token-authority") &&
      c.authority === roleName
    ) {
      return true;
    }
    if (c.type !== "custom") return false;
    const expression = c.expression.toLowerCase();
    return (
      expression.includes(acc.name.toLowerCase()) &&
      expression.includes(roleName.toLowerCase()) &&
      (expression.includes("owner") || expression.includes("authority"))
    );
  });
}

function expectedWellKnownAccountType(
  acc: Account,
): Account["accountType"] | "sysvar-instructions" | undefined {
  const name = acc.name.toLowerCase();
  if (name === "system_program" || name === "system") {
    return "system-program";
  }
  if (name === "token_program" || name === "spl_token_program") {
    return "token-program";
  }
  if (
    name === "associated_token_program" ||
    name === "associated_token_program_id"
  ) {
    return "associated-token-program";
  }
  if (name === "rent" || name === "rent_sysvar") {
    return "rent";
  }
  if (name === "clock" || name === "clock_sysvar") {
    return "clock";
  }
  if (
    name === "instructions_sysvar" ||
    name === "instruction_sysvar" ||
    name === "sysvar_instructions"
  ) {
    return "sysvar-instructions";
  }
  return undefined;
}

function hasWellKnownAccountValidation(acc: Account): boolean {
  return hasConstraint(acc, "address") || hasConstraint(acc, "custom");
}

function hasAccountReferenceSeed(
  acc: Account,
  accountNames: Set<string>,
): boolean {
  const seedsConstraint = acc.constraints.find((c) => c.type === "seeds");
  if (!seedsConstraint || seedsConstraint.type !== "seeds") return false;
  return seedsConstraint.seeds.some(
    (seed) =>
      seed.type === "account-field" &&
      Array.from(accountNames).some((name) => seed.value.includes(name)),
  );
}

function modifiedAccountNames(ops: LogicOperation[]): Set<string> {
  const names = new Set<string>();
  for (const op of flattenOps(ops)) {
    if (op.type === "set-field") {
      names.add(op.account);
    } else if (op.type === "transfer-sol") {
      names.add(op.from);
      names.add(op.to);
    } else if (op.type === "transfer-token") {
      names.add(op.from);
      names.add(op.to);
    } else if (op.type === "mint-to") {
      names.add(op.mint);
      names.add(op.to);
    } else if (op.type === "burn") {
      names.add(op.mint);
      names.add(op.from);
    } else if (op.type === "close-account") {
      names.add(op.account);
      names.add(op.destination);
    }
  }
  return names;
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

function nodeLocation(
  ix: Instruction,
  acc?: Account,
): AuditFinding["location"] {
  return acc
    ? {
        instructionName: ix.name,
        accountName: acc.name,
        nodeId: accountNodeId(acc),
      }
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
    id: "SOL-002",
    name: "Missing Owner Check",
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
              location: {
                ...nodeLocation(ix),
                nodeId: operationNodeId(op, ix),
              },
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
        flattenOps(ix.body).some(
          (op) => op.sourceNodeId === finding.location.nodeId,
        );

      patches.push({
        nodeId: finding.location.nodeId ?? instructionNodeId(ix),
        data: targetsLogicNode ? { mathChecked: true } : { body: updatedBody },
      });
      return patches;
    },
  },

  {
    id: "SOL-011",
    name: "Unsafe Narrowing Cast",
    description: "Custom Rust code contains unchecked narrowing casts",
    severity: "high",
    category: "arithmetic",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      const narrowingCastPattern = /\bas\s+(u8|u16|u32|i8|i16|i32|usize)\b/;
      for (const ix of ir.instructions) {
        for (const op of flattenOps(ix.body)) {
          if (op.type !== "custom-code") continue;
          const match = op.code.match(narrowingCastPattern);
          if (!match) continue;
          findings.push({
            ruleId: "SOL-011",
            severity: "high",
            title: `Potential narrowing cast to ${match[1]} in "${ix.name}"`,
            description: `Custom code in "${ix.name}" uses an unchecked "as ${match[1]}" cast. Narrowing casts can silently truncate values.`,
            location: { ...nodeLocation(ix), nodeId: operationNodeId(op, ix) },
            recommendation:
              "Use TryFrom/try_into with explicit error handling before narrowing numeric values.",
            cweId: "CWE-681",
          });
        }
      }
      return findings;
    },
  },

  // ── PDA SECURITY ──────────────────────────────────────────────────────────

  {
    id: "SOL-004",
    name: "Non-Canonical PDA Derivation",
    description: "PDA derivation uses user-controlled bump or program inputs",
    severity: "medium",
    category: "pda-security",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        const argNames = new Set(ix.args.map((arg) => arg.name));
        for (const acc of ix.accounts) {
          const seedsConstraint = acc.constraints.find(
            (c) => c.type === "seeds",
          );
          if (!seedsConstraint || seedsConstraint.type !== "seeds") continue;

          const bumpFromIxArg =
            !!seedsConstraint.bump && argNames.has(seedsConstraint.bump);
          const programFromIxArg =
            !!seedsConstraint.programId &&
            argNames.has(seedsConstraint.programId);
          if (!bumpFromIxArg && !programFromIxArg) continue;

          findings.push({
            ruleId: "SOL-004",
            severity: "medium",
            title: `PDA "${acc.name}" may use non-canonical derivation`,
            description: `PDA "${acc.name}" in "${ix.name}" derives from ${bumpFromIxArg ? "an instruction-provided bump" : "an instruction-provided program id"}.`,
            location: nodeLocation(ix, acc),
            recommendation:
              "Derive PDAs with canonical bumps from find_program_address and avoid user-controlled bump/program inputs.",
            cweId: "CWE-345",
          });
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-020",
    name: "PDA Seed Collision Risk",
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

  {
    id: "SOL-022",
    name: "PDA Missing Seeds Or Bump",
    description: "PDA-like account is missing seeds or bump validation",
    severity: "medium",
    category: "pda-security",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          const seedsConstraint = acc.constraints.find(
            (c) => c.type === "seeds",
          );
          const hasInit = acc.constraints.some(
            (c) => c.type === "init" || c.type === "init-if-needed",
          );
          const accountName = acc.name.toLowerCase();
          const likelyPda =
            matchesNameToken(accountName, [
              "pda",
              "vault",
              "escrow",
              "pool",
              "position",
              "config",
              "state",
              "treasury",
              "registry",
            ]) ||
            (hasInit && isProgramDataAccount(acc));

          if (
            seedsConstraint &&
            seedsConstraint.type === "seeds" &&
            !seedsConstraint.bump
          ) {
            findings.push({
              ruleId: "SOL-022",
              severity: "medium",
              title: `PDA "${acc.name}" has seeds without bump`,
              description: `Account "${acc.name}" in "${ix.name}" uses PDA seeds but does not validate a bump.`,
              location: nodeLocation(ix, acc),
              recommendation:
                "Add canonical bump validation to the PDA constraint and persist the bump if needed across instructions.",
            });
            continue;
          }

          if (!seedsConstraint && likelyPda) {
            findings.push({
              ruleId: "SOL-022",
              severity: "medium",
              title: `PDA-like account "${acc.name}" has no seeds`,
              description: `Account "${acc.name}" in "${ix.name}" looks like program-owned state but has no PDA seeds constraint.`,
              location: nodeLocation(ix, acc),
              recommendation:
                "Add seeds and bump constraints, or add an explicit address/owner/custom constraint if this account is intentionally not a PDA.",
            });
          }
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-023",
    name: "Shared PDA Across Authority Domains",
    description: "PDA seeds do not include authority-domain scoping",
    severity: "medium",
    category: "pda-security",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        const authorityNames = new Set(
          ix.accounts.filter(looksLikeAuthorityAccount).map((acc) => acc.name),
        );
        if (authorityNames.size === 0) continue;

        for (const acc of ix.accounts) {
          const seedsConstraint = acc.constraints.find(
            (c) => c.type === "seeds",
          );
          if (!seedsConstraint || seedsConstraint.type !== "seeds") continue;
          if (hasAccountReferenceSeed(acc, authorityNames)) continue;

          const seedText = seedsConstraint.seeds
            .map((seed) => seed.value.toLowerCase())
            .join(" ");
          const mentionsAuthority = Array.from(authorityNames).some((name) =>
            seedText.includes(name.toLowerCase()),
          );
          if (mentionsAuthority) continue;

          findings.push({
            ruleId: "SOL-023",
            severity: "medium",
            title: `PDA "${acc.name}" is not scoped by authority`,
            description: `PDA "${acc.name}" in "${ix.name}" has authority-like accounts in scope but its seeds do not reference them.`,
            location: nodeLocation(ix, acc),
            recommendation:
              "Include authority/user/owner pubkeys in PDA seeds to avoid sharing one PDA across unrelated authority domains.",
            cweId: "CWE-330",
          });
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

  {
    id: "SOL-032",
    name: "Token Account Role Not Anchored",
    description:
      "Role-named token account is not anchored to that role's pubkey",
    severity: "critical",
    category: "token-security",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        const accountNames = new Set(ix.accounts.map((acc) => acc.name));
        const destinationTokenAccounts = new Map<string, LogicOperation>();

        for (const op of flattenOps(ix.body)) {
          if (op.type === "transfer-token") {
            destinationTokenAccounts.set(op.to, op);
          } else if (op.type === "mint-to") {
            destinationTokenAccounts.set(op.to, op);
          }
        }

        for (const [tokenAccountName, op] of destinationTokenAccounts) {
          const tokenAcc = ix.accounts.find(
            (acc) => acc.name === tokenAccountName,
          );
          if (!tokenAcc || !looksLikeTokenHoldingAccount(tokenAcc)) continue;

          const roleName = inferRoleForTokenAccount(tokenAcc, accountNames);
          if (!roleName || hasTokenRoleAnchor(tokenAcc, roleName)) continue;

          const roleAcc = ix.accounts.find((acc) => acc.name === roleName);
          const roleSigns = !!roleAcc && hasSigner(roleAcc);
          const cpiAuthority =
            op.type === "transfer-token" || op.type === "mint-to"
              ? op.authority
              : undefined;
          const authorityIsRole = cpiAuthority === roleName;

          findings.push({
            ruleId: "SOL-032",
            severity: roleSigns || authorityIsRole ? "high" : "critical",
            title: `Token account "${tokenAcc.name}" is not anchored to "${roleName}"`,
            description: `Instruction "${ix.name}" sends tokens to role-named account "${tokenAcc.name}" but does not verify its internal token owner/authority is "${roleName}".`,
            location: nodeLocation(ix, tokenAcc),
            recommendation:
              "Add a token-authority or associated-token-authority constraint tying the token account to the named role, or add an equivalent custom owner check.",
            cweId: "CWE-862",
          });
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
    id: "SOL-042",
    name: "AccountInfo Used As CPI Target Program",
    description:
      "CPI target program account is typed as unchecked/raw AccountInfo",
    severity: "critical",
    category: "cpi-security",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const op of flattenOps(ix.body)) {
          if (op.type !== "cpi") continue;
          const targetAcc = ix.accounts.find(
            (a) => a.name === op.targetProgram,
          );
          if (!targetAcc) continue;
          const isUncheckedProgram =
            targetAcc.accountType === "unchecked-account" ||
            targetAcc.accountType === "system-account" ||
            targetAcc.accountType === "custom";
          const hasAddressCheck = hasConstraint(targetAcc, "address");
          if (!isUncheckedProgram || hasAddressCheck) continue;

          findings.push({
            ruleId: "SOL-042",
            severity: "critical",
            title: `Unchecked CPI target program "${targetAcc.name}"`,
            description: `Instruction "${ix.name}" uses "${targetAcc.name}" as a CPI target but it is modeled as an unchecked/raw account without a strict address constraint.`,
            location: nodeLocation(ix, targetAcc),
            recommendation:
              "Use a typed Program account where possible, or add an address constraint pinned to the expected program ID.",
            cweId: "CWE-346",
          });
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-043",
    name: "Well-Known Account Type Confusion",
    description:
      "Well-known sysvar or program account is modeled as unchecked/raw AccountInfo",
    severity: "critical",
    category: "account-validation",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          const expectedType = expectedWellKnownAccountType(acc);
          if (!expectedType) continue;
          if (acc.accountType === expectedType) continue;
          if (hasWellKnownAccountValidation(acc)) continue;

          findings.push({
            ruleId: "SOL-043",
            severity: "critical",
            title: `Unchecked well-known account "${acc.name}"`,
            description: `Account "${acc.name}" in "${ix.name}" looks like a well-known ${expectedType} account but is typed as "${acc.accountType}" without an address/custom validation constraint.`,
            location: nodeLocation(ix, acc),
            recommendation:
              "Use the typed account wrapper for this sysvar/program account, or pin it with an address/custom constraint.",
            cweId: "CWE-345",
          });
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
              const account = ix.accounts.find(
                (a) => a.name === afterOp.account,
              );
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
                nodeId:
                  flatOps.find(
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

  {
    id: "SOL-052",
    name: "Missing Close On Disposable Account",
    description:
      "Temporary or escrow-like initialized account has no close path",
    severity: "low",
    category: "data-validation",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        const closeOps = new Set(
          flattenOps(ix.body)
            .filter((op) => op.type === "close-account")
            .map((op) => (op.type === "close-account" ? op.account : "")),
        );
        for (const acc of ix.accounts) {
          const isInitialized = acc.constraints.some(
            (c) => c.type === "init" || c.type === "init-if-needed",
          );
          if (!isInitialized || !looksLikeDisposableAccount(acc)) continue;
          if (hasConstraint(acc, "close") || closeOps.has(acc.name)) continue;

          findings.push({
            ruleId: "SOL-052",
            severity: "low",
            title: `Disposable account "${acc.name}" has no close path`,
            description: `Account "${acc.name}" in "${ix.name}" looks temporary or escrow-like but is initialized without a close constraint or close operation.`,
            location: nodeLocation(ix, acc),
            recommendation:
              "Add a close constraint or a dedicated close instruction so rent is reclaimed and stale disposable state cannot linger.",
          });
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
                location: {
                  ...nodeLocation(ix),
                  nodeId: operationNodeId(op, ix),
                },
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

  {
    id: "SOL-062",
    name: "Missing Realloc Zero",
    description: "Realloc does not zero newly allocated bytes",
    severity: "medium",
    category: "data-validation",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          const reallocConstraint = acc.constraints.find(
            (c) => c.type === "realloc",
          );
          if (!reallocConstraint || reallocConstraint.type !== "realloc")
            continue;
          if (reallocConstraint.zeroInit) continue;

          findings.push({
            ruleId: "SOL-062",
            severity: "medium",
            title: `Realloc on "${acc.name}" does not zero new bytes`,
            description: `Account "${acc.name}" in "${ix.name}" uses realloc with zeroInit=false.`,
            location: nodeLocation(ix, acc),
            recommendation:
              "Set realloc zeroing to true unless you have a reviewed reason to preserve uninitialized bytes.",
            cweId: "CWE-665",
          });
        }
      }
      return findings;
    },
  },

  // ── ACCOUNT LIFECYCLE / STRUCTURE ─────────────────────────────────────────

  {
    id: "SOL-070",
    name: "Missing Mut On Modified Account",
    description:
      "Instruction logic modifies an account that is not marked writable",
    severity: "high",
    category: "account-validation",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        const modified = modifiedAccountNames(ix.body);
        for (const acc of ix.accounts) {
          if (!modified.has(acc.name) || isWritableByConstraint(acc)) continue;
          findings.push({
            ruleId: "SOL-070",
            severity: "high",
            title: `Modified account "${acc.name}" is not marked mut`,
            description: `Instruction "${ix.name}" writes to "${acc.name}" but the account has no mut/init/realloc/close writability constraint.`,
            location: nodeLocation(ix, acc),
            recommendation:
              "Mark the account writable with mut, or remove the write if the account should be read-only.",
            cweId: "CWE-664",
          });
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-071",
    name: "init_if_needed Manual Review",
    description:
      "init_if_needed can allow state reset or pre-initialization surprises",
    severity: "low",
    category: "account-validation",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          if (!hasConstraint(acc, "init-if-needed")) continue;
          findings.push({
            ruleId: "SOL-071",
            severity: "low",
            title: `Review init_if_needed on "${acc.name}"`,
            description: `Account "${acc.name}" in "${ix.name}" uses init_if_needed, which requires manual review for re-initialization and state-reset paths.`,
            location: nodeLocation(ix, acc),
            recommendation:
              "Validate existing state after init_if_needed and prefer explicit init flows for security-sensitive accounts.",
            cweId: "CWE-665",
          });
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-072",
    name: "AccountInfo Used For Data Account",
    description:
      "Data-account-like field is modeled as unchecked/raw AccountInfo",
    severity: "high",
    category: "account-validation",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          if (
            acc.accountType !== "unchecked-account" ||
            !looksLikeDataAccount(acc)
          )
            continue;
          if (hasOwner(acc) && hasConstraint(acc, "custom")) continue;
          findings.push({
            ruleId: "SOL-072",
            severity: "high",
            title: `Unchecked data account "${acc.name}"`,
            description: `Account "${acc.name}" in "${ix.name}" looks like program data but is modeled as an unchecked/raw account.`,
            location: nodeLocation(ix, acc),
            recommendation:
              "Use a typed account wrapper, or add explicit owner and discriminator/custom validation.",
            cweId: "CWE-345",
          });
        }
      }
      return findings;
    },
  },

  {
    id: "SOL-073",
    name: "Missing Constraint For Uniqueness",
    description:
      "Sensitive initialized account lacks domain-separating constraints",
    severity: "medium",
    category: "account-validation",
    check: (ir: ProgramIR): AuditFinding[] => {
      const findings: AuditFinding[] = [];
      for (const ix of ir.instructions) {
        for (const acc of ix.accounts) {
          const isInitialized =
            hasConstraint(acc, "init") || hasConstraint(acc, "init-if-needed");
          const sensitive =
            looksLikeDataAccount(acc) || looksLikeAuthorityAccount(acc);
          if (!isInitialized || !sensitive || hasStrongValidation(acc))
            continue;
          findings.push({
            ruleId: "SOL-073",
            severity: "medium",
            title: `Initialized account "${acc.name}" lacks uniqueness constraints`,
            description: `Account "${acc.name}" in "${ix.name}" is initialized without seeds, address, has_one, owner, or custom uniqueness validation.`,
            location: nodeLocation(ix, acc),
            recommendation:
              "Add PDA seeds, has_one relationships, address constraints, or custom domain-separation checks so one account cannot be reused across unrelated domains.",
            cweId: "CWE-330",
          });
        }
      }
      return findings;
    },
  },
];
