import type {
  Account,
  Instruction,
  InstructionArg,
  LogicOperation,
  ProgramIR,
  SolanaType,
} from "@solflow/ir";
import type {
  AuditSeverity,
  AuditStressCategory,
  AuditStressSummary,
  AuditStressTestCase,
} from "./types";

type InputValue = string | number | boolean;

interface NumericBounds {
  min: string;
  max: string;
  signed: boolean;
}

const NUMERIC_BOUNDS: Record<string, NumericBounds> = {
  u8: { min: "0", max: "255", signed: false },
  u16: { min: "0", max: "65535", signed: false },
  u32: { min: "0", max: "4294967295", signed: false },
  u64: { min: "0", max: "18446744073709551615", signed: false },
  u128: { min: "0", max: "340282366920938463463374607431768211455", signed: false },
  i8: { min: "-128", max: "127", signed: true },
  i16: { min: "-32768", max: "32767", signed: true },
  i32: { min: "-2147483648", max: "2147483647", signed: true },
  i64: { min: "-9223372036854775808", max: "9223372036854775807", signed: true },
  i128: {
    min: "-170141183460469231731687303715884105728",
    max: "170141183460469231731687303715884105727",
    signed: true,
  },
  f32: { min: "-3.4028235e38", max: "3.4028235e38", signed: true },
  f64: { min: "-1.7976931348623157e308", max: "1.7976931348623157e308", signed: true },
};

const STRESS_CATEGORIES: AuditStressCategory[] = [
  "input-boundary",
  "arithmetic-boundary",
  "require-boundary",
  "account-validation",
  "pda-validation",
  "token-validation",
  "cpi-validation",
];

const SEVERITIES: AuditSeverity[] = ["critical", "high", "medium", "low", "info"];

export function generateDeterministicStressPlan(ir: ProgramIR): AuditStressTestCase[] {
  const cases: AuditStressTestCase[] = [];
  const seen = new Set<string>();

  const add = (testCase: AuditStressTestCase) => {
    if (seen.has(testCase.id)) return;
    seen.add(testCase.id);
    cases.push(testCase);
  };

  for (const ix of ir.instructions) {
    addInputBoundaryCases(ix, add);
    addRequirementBoundaryCases(ix, add);
    addArithmeticBoundaryCases(ix, add);
    addAccountValidationCases(ix, add);
    addCpiValidationCases(ix, add);
  }

  return cases;
}

export function summarizeStressTests(tests: AuditStressTestCase[]): AuditStressSummary {
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<AuditSeverity, number>;
  const byCategory = Object.fromEntries(STRESS_CATEGORIES.map((c) => [c, 0])) as Record<AuditStressCategory, number>;

  for (const test of tests) {
    bySeverity[test.severity]++;
    byCategory[test.category]++;
  }

  return {
    total: tests.length,
    bySeverity,
    byCategory,
  };
}

function addInputBoundaryCases(
  ix: Instruction,
  add: (testCase: AuditStressTestCase) => void,
) {
  for (const arg of ix.args) {
    const bounds = getNumericBounds(arg.type);
    if (!bounds) continue;

    const points = bounds.signed
      ? [
          ["min", bounds.min, "no-panic"],
          ["below-zero", "-1", "no-panic"],
          ["zero", "0", "no-panic"],
          ["one", "1", "no-panic"],
          ["max", bounds.max, "no-panic"],
          ["below-min", decrementDecimal(bounds.min), "reject"],
          ["above-max", incrementDecimal(bounds.max), "reject"],
        ]
      : [
          ["zero", "0", "no-panic"],
          ["one", "1", "no-panic"],
          ["max", bounds.max, "no-panic"],
          ["below-min", "-1", "reject"],
          ["above-max", incrementDecimal(bounds.max), "reject"],
        ];

    for (const [variant, value, expected] of points) {
      add({
        id: stressId(ix, "input-boundary", arg.name, variant),
        title: `${arg.name} ${variant}`,
        description: `Run ${ix.name} with ${arg.name} at the ${variant.replace("-", " ")} boundary.`,
        category: "input-boundary",
        instructionName: ix.name,
        nodeId: ix.id,
        target: arg.name,
        severity: expected === "reject" ? "medium" : "info",
        inputs: { [arg.name]: toInputValue(value) },
        expected: expected as AuditStressTestCase["expected"],
        rationale: `Numeric ${formatType(arg.type)} inputs should handle valid edges and reject values outside the type domain.`,
      });
    }
  }
}

function addArithmeticBoundaryCases(
  ix: Instruction,
  add: (testCase: AuditStressTestCase) => void,
) {
  const argsByName = new Map(ix.args.map((arg) => [arg.name, arg]));

  for (const op of flattenOps(ix.body)) {
    if (op.type !== "math") continue;

    const leftBounds = getBoundsForExpression(op.left, argsByName) ?? getDefaultIntegerBounds();
    const rightBounds = getBoundsForExpression(op.right, argsByName) ?? getDefaultIntegerBounds();
    const severity: AuditSeverity = op.checked ? "info" : "high";

    if (op.operation === "add") {
      add({
        id: stressId(ix, "arithmetic-boundary", op.result, "add-overflow"),
        title: `${op.result} add overflow`,
        description: `Probe ${op.left} + ${op.right} at the maximum boundary.`,
        category: "arithmetic-boundary",
        instructionName: ix.name,
        nodeId: ix.id,
        target: op.result,
        severity,
        inputs: inputMap(op.left, leftBounds.max, op.right, "1"),
        expected: "reject",
        rationale: op.checked
          ? "Checked addition should reject overflow without mutating state."
          : "Unchecked addition can wrap; this case should fail until checked arithmetic is used.",
      });
    }

    if (op.operation === "sub") {
      add({
        id: stressId(ix, "arithmetic-boundary", op.result, "sub-underflow"),
        title: `${op.result} sub underflow`,
        description: `Probe ${op.left} - ${op.right} below the lower boundary.`,
        category: "arithmetic-boundary",
        instructionName: ix.name,
        nodeId: ix.id,
        target: op.result,
        severity,
        inputs: inputMap(op.left, leftBounds.min, op.right, "1"),
        expected: "reject",
        rationale: op.checked
          ? "Checked subtraction should reject underflow without mutating state."
          : "Unchecked subtraction can underflow; this case should fail until checked arithmetic is used.",
      });
    }

    if (op.operation === "mul") {
      add({
        id: stressId(ix, "arithmetic-boundary", op.result, "mul-overflow"),
        title: `${op.result} mul overflow`,
        description: `Probe ${op.left} * ${op.right} at the maximum boundary.`,
        category: "arithmetic-boundary",
        instructionName: ix.name,
        nodeId: ix.id,
        target: op.result,
        severity,
        inputs: inputMap(op.left, leftBounds.max, op.right, "2"),
        expected: "reject",
        rationale: op.checked
          ? "Checked multiplication should reject overflow without mutating state."
          : "Unchecked multiplication can wrap; this case should fail until checked arithmetic is used.",
      });
    }

    if (op.operation === "div" || op.operation === "mod") {
      add({
        id: stressId(ix, "arithmetic-boundary", op.result, `${op.operation}-zero`),
        title: `${op.result} ${op.operation} by zero`,
        description: `Probe ${op.left} ${op.operation} ${op.right} with a zero divisor.`,
        category: "arithmetic-boundary",
        instructionName: ix.name,
        nodeId: ix.id,
        target: op.result,
        severity,
        inputs: inputMap(op.left, "1", op.right, "0"),
        expected: "reject",
        rationale: op.checked
          ? `Checked ${op.operation} should reject zero divisors.`
          : `Unchecked ${op.operation} can panic on zero divisors; this case should fail safely.`,
      });
    }

    if (!op.checked) {
      add({
        id: stressId(ix, "arithmetic-boundary", op.result, "checked-arithmetic-required"),
        title: `${op.result} checked arithmetic guard`,
        description: `Require ${op.operation} to use checked arithmetic before production.`,
        category: "arithmetic-boundary",
        instructionName: ix.name,
        nodeId: ix.id,
        target: op.result,
        severity: "high",
        inputs: inputMap(op.left, leftBounds.max, op.right, rightBounds.max),
        expected: "reject",
        rationale: "The audit can auto-fix the graph node by enabling checked arithmetic.",
      });
    }
  }
}

function addRequirementBoundaryCases(
  ix: Instruction,
  add: (testCase: AuditStressTestCase) => void,
) {
  for (const op of flattenOps(ix.body)) {
    const condition =
      op.type === "require" ? op.condition : op.type === "if-else" ? op.condition : undefined;
    if (!condition) continue;

    const parsed = parseSimpleCondition(condition);
    if (!parsed) continue;

    const values = boundaryValuesForCondition(parsed.operator, parsed.literal);
    for (const point of values) {
      add({
        id: stressId(ix, "require-boundary", parsed.symbol, `${parsed.operator}-${point.label}`),
        title: `${parsed.symbol} ${point.label} ${parsed.literal}`,
        description: `Exercise ${condition} with ${parsed.symbol} ${point.label} the threshold.`,
        category: "require-boundary",
        instructionName: ix.name,
        nodeId: ix.id,
        target: condition,
        severity: point.expected === "pass" ? "info" : "medium",
        inputs: { [parsed.symbol]: toInputValue(point.value) },
        expected: point.expected,
        rationale: "Boundary checks should cover the failing edge, exact equality, and the first passing edge.",
      });
    }
  }
}

function addAccountValidationCases(
  ix: Instruction,
  add: (testCase: AuditStressTestCase) => void,
) {
  for (const acc of ix.accounts) {
    if (acc.accountType === "signer" || acc.constraints.some((c) => c.type === "signer")) {
      addAccountCase(ix, acc, add, {
        category: "account-validation",
        variant: "missing-signer",
        severity: "critical",
        title: `${acc.name} missing signer`,
        inputs: { [acc.name]: "non_signer_account" },
        rationale: "Privileged instructions must reject the same account when it is not a transaction signer.",
      });
    }

    for (const constraint of acc.constraints) {
      if (constraint.type === "owner") {
        addAccountCase(ix, acc, add, {
          category: "account-validation",
          variant: "wrong-owner",
          severity: "high",
          title: `${acc.name} wrong owner`,
          inputs: { [acc.name]: `owner_not_${constraint.owner}` },
          rationale: "Unchecked and program-owned accounts must reject fake accounts owned by the wrong program.",
        });
      }

      if (constraint.type === "address") {
        addAccountCase(ix, acc, add, {
          category: "account-validation",
          variant: "wrong-address",
          severity: acc.accountType === "program" ? "critical" : "high",
          title: `${acc.name} wrong address`,
          inputs: { [acc.name]: `address_not_${constraint.address}` },
          rationale: "Program and config accounts must reject lookalike accounts with a different address.",
        });
      }

      if (constraint.type === "has-one") {
        addAccountCase(ix, acc, add, {
          category: "account-validation",
          variant: `has-one-${constraint.field}`,
          severity: "high",
          title: `${acc.name} ${constraint.field} mismatch`,
          inputs: { [constraint.field]: `not_${constraint.target}` },
          rationale: "has_one relationships should reject account graphs with mismatched authority or owner fields.",
        });
      }

      if (constraint.type === "seeds") {
        addAccountCase(ix, acc, add, {
          category: "pda-validation",
          variant: "wrong-pda-seed",
          severity: "medium",
          title: `${acc.name} wrong PDA seed`,
          inputs: { [acc.name]: "pda_with_mutated_seed" },
          rationale: "PDA derivation should reject a valid account layout at the wrong derived address.",
        });
        if (constraint.bump) {
          addAccountCase(ix, acc, add, {
            category: "pda-validation",
            variant: "wrong-pda-bump",
            severity: "medium",
            title: `${acc.name} wrong PDA bump`,
            inputs: { [constraint.bump]: "bump_minus_one" },
            rationale: "Canonical bump handling should reject non-canonical PDA derivations.",
          });
        }
      }

      if (
        constraint.type === "token-mint" ||
        constraint.type === "associated-token-mint"
      ) {
        addAccountCase(ix, acc, add, {
          category: "token-validation",
          variant: "wrong-token-mint",
          severity: "high",
          title: `${acc.name} wrong token mint`,
          inputs: { [acc.name]: `mint_not_${constraint.mint}` },
          rationale: "Token accounts must reject a valid account owned by a different mint.",
        });
      }

      if (
        constraint.type === "token-authority" ||
        constraint.type === "associated-token-authority" ||
        constraint.type === "mint-authority"
      ) {
        addAccountCase(ix, acc, add, {
          category: "token-validation",
          variant: "wrong-token-authority",
          severity: "high",
          title: `${acc.name} wrong token authority`,
          inputs: { [acc.name]: `authority_not_${constraint.authority}` },
          rationale: "Token authority constraints must reject token accounts controlled by a different authority.",
        });
      }
    }

    if (
      acc.accountType === "token-account" ||
      acc.accountType === "associated-token" ||
      acc.accountType === "mint"
    ) {
      addAccountCase(ix, acc, add, {
        category: "token-validation",
        variant: "closed-or-empty-token-account",
        severity: "medium",
        title: `${acc.name} closed token account`,
        inputs: { [acc.name]: "closed_or_zero_lamport_token_account" },
        rationale: "Token flows should reject closed, uninitialized, or zero-lamport token accounts.",
      });
    }
  }
}

function addCpiValidationCases(
  ix: Instruction,
  add: (testCase: AuditStressTestCase) => void,
) {
  for (const op of flattenOps(ix.body)) {
    if (op.type !== "cpi") continue;

    add({
      id: stressId(ix, "cpi-validation", op.targetProgram, `${op.instruction}-wrong-program`),
      title: `${op.instruction} CPI wrong program`,
      description: `Run ${ix.name} with ${op.targetProgram} replaced by a lookalike program.`,
      category: "cpi-validation",
      instructionName: ix.name,
      nodeId: ix.id,
      target: op.targetProgram,
      severity: "critical",
      inputs: { [op.targetProgram]: "malicious_program_id" },
      expected: "reject",
      rationale: "CPI targets must be pinned to the expected program ID so attackers cannot route calls to a malicious program.",
    });

    for (const account of op.accounts) {
      add({
        id: stressId(ix, "cpi-validation", account.from, `${op.instruction}-wrong-cpi-account`),
        title: `${op.instruction} CPI wrong ${account.from}`,
        description: `Run ${ix.name} with the CPI account mapping ${account.from} -> ${account.to} mutated.`,
        category: "cpi-validation",
        instructionName: ix.name,
        nodeId: ix.id,
        target: account.from,
        severity: "high",
        inputs: { [account.from]: `not_${account.to}` },
        expected: "reject",
        rationale: "CPI account metas should reject swapped accounts that satisfy shape checks but point at the wrong account.",
      });
    }

    if (op.signerSeeds && op.signerSeeds.length > 0) {
      add({
        id: stressId(ix, "cpi-validation", op.targetProgram, `${op.instruction}-wrong-signer-seeds`),
        title: `${op.instruction} CPI wrong signer seeds`,
        description: `Run ${ix.name} with mutated CPI signer seeds.`,
        category: "cpi-validation",
        instructionName: ix.name,
        nodeId: ix.id,
        target: op.targetProgram,
        severity: "high",
        inputs: { signerSeeds: "mutated_signer_seeds" },
        expected: "reject",
        rationale: "CPI signer seeds must derive the exact PDA signer expected by the callee.",
      });
    }
  }
}

function addAccountCase(
  ix: Instruction,
  acc: Account,
  add: (testCase: AuditStressTestCase) => void,
  options: {
    category: AuditStressCategory;
    variant: string;
    severity: AuditSeverity;
    title: string;
    inputs: Record<string, InputValue>;
    rationale: string;
  },
) {
  add({
    id: stressId(ix, options.category, acc.name, options.variant),
    title: options.title,
    description: `Run ${ix.name} with ${acc.name} set to ${options.variant.replace(/-/g, " ")}.`,
    category: options.category,
    instructionName: ix.name,
    nodeId: acc.id,
    target: acc.name,
    severity: options.severity,
    inputs: options.inputs,
    expected: "reject",
    rationale: options.rationale,
  });
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

function parseSimpleCondition(condition: string):
  | { symbol: string; operator: string; literal: string }
  | null {
  const match = condition
    .trim()
    .match(/^([a-zA-Z_][\w.]*)\s*(<=|>=|==|!=|<|>)\s*(-?\d+(?:\.\d+)?)$/);
  if (match) {
    return { symbol: match[1], operator: match[2], literal: match[3] };
  }

  const reversed = condition
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*(<=|>=|==|!=|<|>)\s*([a-zA-Z_][\w.]*)$/);
  if (!reversed) return null;

  return {
    symbol: reversed[3],
    operator: flipOperator(reversed[2]),
    literal: reversed[1],
  };
}

function boundaryValuesForCondition(operator: string, literal: string) {
  const below = decrementDecimal(literal);
  const above = incrementDecimal(literal);

  const passes = (valueLabel: "below" | "equal" | "above") => {
    switch (operator) {
      case ">":
        return valueLabel === "above";
      case ">=":
        return valueLabel === "equal" || valueLabel === "above";
      case "<":
        return valueLabel === "below";
      case "<=":
        return valueLabel === "below" || valueLabel === "equal";
      case "==":
        return valueLabel === "equal";
      case "!=":
        return valueLabel !== "equal";
      default:
        return false;
    }
  };

  return [
    { label: "below", value: below, expected: passes("below") ? "pass" : "fail" },
    { label: "equal", value: literal, expected: passes("equal") ? "pass" : "fail" },
    { label: "above", value: above, expected: passes("above") ? "pass" : "fail" },
  ] as const;
}

function flipOperator(operator: string): string {
  switch (operator) {
    case ">":
      return "<";
    case ">=":
      return "<=";
    case "<":
      return ">";
    case "<=":
      return ">=";
    default:
      return operator;
  }
}

function getBoundsForExpression(
  expression: string,
  argsByName: Map<string, InstructionArg>,
): NumericBounds | undefined {
  for (const [name, arg] of argsByName) {
    if (referencesSymbol(expression, name)) {
      return getNumericBounds(arg.type);
    }
  }
  return undefined;
}

function getNumericBounds(type: SolanaType): NumericBounds | undefined {
  if (typeof type !== "string") return undefined;
  return NUMERIC_BOUNDS[type];
}

function getDefaultIntegerBounds(): NumericBounds {
  return NUMERIC_BOUNDS.u64;
}

function referencesSymbol(expression: string, name: string): boolean {
  return new RegExp(`(^|[^a-zA-Z0-9_])${escapeRegExp(name)}($|[^a-zA-Z0-9_])`).test(expression);
}

function inputMap(
  leftName: string,
  leftValue: string,
  rightName: string,
  rightValue: string,
): Record<string, InputValue> {
  return {
    [leftName]: toInputValue(leftValue),
    [rightName]: toInputValue(rightValue),
  };
}

function toInputValue(value: string): InputValue {
  const numeric = Number(value);
  if (Number.isSafeInteger(numeric) && value.toLowerCase() !== "nan") {
    return numeric;
  }
  return value;
}

function incrementDecimal(value: string): string {
  if (value.includes(".") || value.toLowerCase().includes("e")) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric + 1) : value;
  }
  if (value.startsWith("-")) {
    const next = decrementUnsigned(value.slice(1));
    return next === "0" ? "0" : `-${next}`;
  }
  return incrementUnsigned(value);
}

function decrementDecimal(value: string): string {
  if (value.includes(".") || value.toLowerCase().includes("e")) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric - 1) : value;
  }
  if (value.startsWith("-")) {
    return `-${incrementUnsigned(value.slice(1))}`;
  }
  if (value === "0") return "-1";
  return decrementUnsigned(value);
}

function incrementUnsigned(value: string): string {
  const digits = value.split("");
  let carry = 1;
  for (let i = digits.length - 1; i >= 0; i--) {
    const next = Number(digits[i]) + carry;
    if (next === 10) {
      digits[i] = "0";
      carry = 1;
    } else {
      digits[i] = String(next);
      carry = 0;
      break;
    }
  }
  if (carry) digits.unshift("1");
  return digits.join("");
}

function decrementUnsigned(value: string): string {
  const digits = value.split("");
  for (let i = digits.length - 1; i >= 0; i--) {
    const next = Number(digits[i]) - 1;
    if (next < 0) {
      digits[i] = "9";
    } else {
      digits[i] = String(next);
      break;
    }
  }
  return digits.join("").replace(/^0+(?=\d)/, "") || "0";
}

function stressId(
  ix: Instruction,
  category: AuditStressCategory,
  target: string,
  variant: string,
): string {
  return ["dst", ix.name, category, target, variant].map(slug).filter(Boolean).join("-");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function formatType(type: SolanaType): string {
  return typeof type === "string" ? type : JSON.stringify(type);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
