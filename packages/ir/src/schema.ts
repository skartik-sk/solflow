import { z } from "zod";

// ─── Rust reserved keywords ──────────────────────────────────────────
// These identifiers would cause compilation errors if used as field, instruction,
// account, or state names in generated Rust code.
const RUST_KEYWORDS = new Set([
  "as", "async", "await", "break", "const", "continue", "crate", "dyn",
  "else", "enum", "extern", "fn", "for", "if", "impl", "in", "let",
  "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "self",
  "Self", "static", "struct", "super", "trait", "type", "unsafe", "use",
  "where", "while", "yield",
  // Additional reserved keywords
  "abstract", "become", "box", "do", "final", "macro", "override", "priv",
  "try", "typeof", "unsized", "virtual",
]);

/** Validates a snake_case identifier that is not a Rust keyword. */
const safeSnakeName = z.string()
  .regex(/^[a-z_][a-z0-9_]*$/, "Must be snake_case (letters, digits, underscores)")
  .refine((s) => !RUST_KEYWORDS.has(s), "Rust keyword cannot be used as identifier");

/** Validates a PascalCase identifier that is not a Rust keyword. */
const safePascalName = z.string()
  .regex(/^[A-Z][a-zA-Z0-9]*/, "Must be PascalCase")
  .refine((s) => !RUST_KEYWORDS.has(s), "Rust keyword cannot be used as identifier");

// ─── Primitive Types ───────────────────────────────────────────────

export const EnumDefinitionSchema: z.ZodType<EnumDefinition> = z.lazy(() =>
  z.object({
    name: z.string(),
    variants: z.array(
      z.object({
        name: z.string(),
        fields: z.array(FieldSchema).optional(),
      }),
    ),
  }),
);

export type EnumDefinition = {
  name: string;
  variants: Array<{ name: string; fields?: Field[] }>;
};

export type SolanaType =
  | "bool"
  | "u8"
  | "u16"
  | "u32"
  | "u64"
  | "u128"
  | "i8"
  | "i16"
  | "i32"
  | "i64"
  | "i128"
  | "f32"
  | "f64"
  | "String"
  | "Pubkey"
  | { array: [SolanaType, number] }
  | { vec: SolanaType }
  | { option: SolanaType }
  | { defined: string }
  | { hashMap: [SolanaType, SolanaType] }
  | { enum: EnumDefinition };

export const SolanaTypeSchema: z.ZodType<SolanaType> = z.lazy(() =>
  z.union([
    z.literal("bool"),
    z.literal("u8"),
    z.literal("u16"),
    z.literal("u32"),
    z.literal("u64"),
    z.literal("u128"),
    z.literal("i8"),
    z.literal("i16"),
    z.literal("i32"),
    z.literal("i64"),
    z.literal("i128"),
    z.literal("f32"),
    z.literal("f64"),
    z.literal("String"),
    z.literal("Pubkey"),
    z.object({
      array: z.tuple([SolanaTypeSchema, z.number().int().positive()]),
    }),
    z.object({ vec: SolanaTypeSchema }),
    z.object({ option: SolanaTypeSchema }),
    z.object({ defined: z.string() }),
    z.object({ hashMap: z.tuple([SolanaTypeSchema, SolanaTypeSchema]) }),
    z.object({ enum: EnumDefinitionSchema }),
  ]),
);

// ─── Seed Definitions ──────────────────────────────────────────────

export const SeedSchema = z.object({
  type: z.enum(["literal", "account-field", "instruction-arg", "pubkey"]),
  value: z.string(),
});
export type Seed = z.infer<typeof SeedSchema>;

// ─── Field Definition ──────────────────────────────────────────────

export const FieldSchema = z.object({
  name: safeSnakeName,
  type: SolanaTypeSchema,
  description: z.string().optional(),
  maxLen: z.number().optional(),
});
export type Field = z.infer<typeof FieldSchema>;

// ─── Constraint Definition ─────────────────────────────────────────

export const ConstraintSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("signer") }),
  z.object({ type: z.literal("mut") }),
  z.object({
    type: z.literal("init"),
    payer: z.string(),
    space: z.union([z.number(), z.literal("auto")]),
  }),
  z.object({
    type: z.literal("init-if-needed"),
    payer: z.string(),
    space: z.union([z.number(), z.literal("auto")]),
  }),
  z.object({ type: z.literal("close"), target: z.string() }),
  z.object({
    type: z.literal("has-one"),
    field: z.string(),
    target: z.string(),
    errorCode: z.string().optional(),
  }),
  z.object({
    type: z.literal("seeds"),
    seeds: z.array(SeedSchema),
    bump: z.string().optional(),
    programId: z.string().optional(),
  }),
  z.object({ type: z.literal("owner"), owner: z.string() }),
  z.object({ type: z.literal("address"), address: z.string() }),
  z.object({
    type: z.literal("token-authority"),
    authority: z.string(),
  }),
  z.object({ type: z.literal("token-mint"), mint: z.string() }),
  z.object({
    type: z.literal("realloc"),
    space: z.number(),
    payer: z.string(),
    zeroInit: z.boolean(),
  }),
  z.object({
    type: z.literal("custom"),
    expression: z.string(),
    errorCode: z.string().optional(),
  }),
]);
export type Constraint = z.infer<typeof ConstraintSchema>;

// ─── Account Definition ────────────────────────────────────────────

export const AccountTypeSchema = z.enum([
  "account",
  "system-account",
  "signer",
  "program",
  "token-account",
  "mint",
  "associated-token",
  "unchecked-account",
  "system-program",
  "token-program",
  "associated-token-program",
  "rent",
  "clock",
  "custom",
]);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  name: safeSnakeName,
  accountType: AccountTypeSchema,
  stateType: z.string().optional(),
  constraints: z.array(ConstraintSchema),
  description: z.string().optional(),
});
export type Account = z.infer<typeof AccountSchema>;

// ─── Logic Operations ──────────────────────────────────────────────

export type LogicOperation =
  | { type: "set-field"; account: string; field: string; value: string }
  | {
      type: "transfer-sol";
      from: string;
      to: string;
      amount: string;
    }
  | {
      type: "transfer-token";
      from: string;
      to: string;
      authority: string;
      amount: string;
      signerSeeds?: Seed[];
    }
  | {
      type: "mint-to";
      mint: string;
      to: string;
      authority: string;
      amount: string;
      signerSeeds?: Seed[];
    }
  | {
      type: "burn";
      mint: string;
      from: string;
      authority: string;
      amount: string;
    }
  | { type: "require"; condition: string; errorCode: string }
  | {
      type: "if-else";
      condition: string;
      thenBody: LogicOperation[];
      elseBody?: LogicOperation[];
    }
  | { type: "emit-event"; event: string; fields: Record<string, string> }
  | { type: "return-error"; errorCode: string }
  | {
      type: "cpi";
      targetProgram: string;
      instruction: string;
      accounts: Array<{ from: string; to: string }>;
      data: Array<{ name: string; value: string }>;
      signerSeeds?: Seed[];
    }
  | {
      type: "math";
      operation: "add" | "sub" | "mul" | "div" | "mod";
      left: string;
      right: string;
      result: string;
      checked: boolean;
    }
  | { type: "custom-code"; code: string; inputs: string[]; outputs: string[] };

export const LogicOperationSchema: z.ZodType<LogicOperation> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("set-field"),
      account: z.string(),
      field: z.string(),
      value: z.string(),
    }),
    z.object({
      type: z.literal("transfer-sol"),
      from: z.string(),
      to: z.string(),
      amount: z.string(),
    }),
    z.object({
      type: z.literal("transfer-token"),
      from: z.string(),
      to: z.string(),
      authority: z.string(),
      amount: z.string(),
      signerSeeds: z.array(SeedSchema).optional(),
    }),
    z.object({
      type: z.literal("mint-to"),
      mint: z.string(),
      to: z.string(),
      authority: z.string(),
      amount: z.string(),
      signerSeeds: z.array(SeedSchema).optional(),
    }),
    z.object({
      type: z.literal("burn"),
      mint: z.string(),
      from: z.string(),
      authority: z.string(),
      amount: z.string(),
    }),
    z.object({
      type: z.literal("require"),
      condition: z.string(),
      errorCode: z.string(),
    }),
    z.object({
      type: z.literal("if-else"),
      condition: z.string(),
      thenBody: z.array(LogicOperationSchema),
      elseBody: z.array(LogicOperationSchema).optional(),
    }),
    z.object({
      type: z.literal("emit-event"),
      event: z.string(),
      fields: z.record(z.string()),
    }),
    z.object({
      type: z.literal("return-error"),
      errorCode: z.string(),
    }),
    z.object({
      type: z.literal("cpi"),
      targetProgram: z.string(),
      instruction: z.string(),
      accounts: z.array(z.object({ from: z.string(), to: z.string() })),
      data: z.array(z.object({ name: z.string(), value: z.string() })),
      signerSeeds: z.array(SeedSchema).optional(),
    }),
    z.object({
      type: z.literal("math"),
      operation: z.enum(["add", "sub", "mul", "div", "mod"]),
      left: z.string(),
      right: z.string(),
      result: z.string(),
      checked: z.boolean(),
    }),
    z.object({
      type: z.literal("custom-code"),
      code: z.string(),
      inputs: z.array(z.string()),
      outputs: z.array(z.string()),
    }),
  ]),
);

// ─── Instruction Definition ────────────────────────────────────────

export const InstructionArgSchema = z.object({
  name: safeSnakeName,
  type: SolanaTypeSchema,
  description: z.string().optional(),
});
export type InstructionArg = z.infer<typeof InstructionArgSchema>;

export const InstructionSchema = z.object({
  id: z.string().uuid(),
  name: safeSnakeName,
  description: z.string().optional(),
  discriminator: z.array(z.number()).length(8).optional(),
  args: z.array(InstructionArgSchema),
  accounts: z.array(AccountSchema),
  body: z.array(LogicOperationSchema),
});
export type Instruction = z.infer<typeof InstructionSchema>;

// ─── State Definition ──────────────────────────────────────────────

export const StateSchema = z.object({
  id: z.string().uuid(),
  name: safePascalName,
  fields: z.array(FieldSchema),
  description: z.string().optional(),
  isZeroCopy: z.boolean().default(false),
  customDiscriminator: z.array(z.number()).length(8).optional(),
});
export type State = z.infer<typeof StateSchema>;

// ─── Error Definition ──────────────────────────────────────────────

export const ErrorVariantSchema = z.object({
  id: z.string().uuid(),
  name: safePascalName,
  code: z.number().int().nonnegative(),
  message: z.string(),
});
export type ErrorVariant = z.infer<typeof ErrorVariantSchema>;

// ─── Event Definition ──────────────────────────────────────────────

export const EventSchema = z.object({
  id: z.string().uuid(),
  name: safePascalName,
  fields: z.array(FieldSchema),
  description: z.string().optional(),
});
export type IrEvent = z.infer<typeof EventSchema>;

// ─── Integration (Plugin) ──────────────────────────────────────────

export const IntegrationSchema = z.object({
  id: z.string().uuid(),
  pluginId: z.string(),
  integrationId: z.string(),
  config: z.record(z.unknown()),
  attachedTo: z.object({
    instructionId: z.string().uuid(),
    position: z.enum(["before-body", "after-body", "account-level"]),
  }),
});
export type Integration = z.infer<typeof IntegrationSchema>;

// ─── Root Program IR ───────────────────────────────────────────────

export const ProgramIRSchema = z.object({
  version: z.literal("1.0.0"),
  program: z.object({
    name: safeSnakeName,
    description: z.string().optional(),
    version: z.string(),
    programId: z.string().optional(),
    license: z.string().optional(),
  }),
  instructions: z.array(InstructionSchema).min(1),
  states: z.array(StateSchema),
  errors: z.array(ErrorVariantSchema),
  events: z.array(EventSchema),
  integrations: z.array(IntegrationSchema),
  constants: z.array(
    z.object({
      name: z.string(),
      type: SolanaTypeSchema,
      value: z.string(),
    }),
  ),
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    flowHash: z.string(),
    generatorVersion: z.string(),
  }),
});

export type ProgramIR = z.infer<typeof ProgramIRSchema>;
