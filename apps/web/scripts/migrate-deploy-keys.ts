import { PrismaClient } from "@solflow/db";
import {
  isEncryptedSecretKey,
  keypairFromStoredSecret,
  migrateStoredSecretKey,
} from "../src/server/secret-key-crypto";

type TableName = "user" | "project" | "deployment";
type FieldName = "deployerKeypair" | "programKeypair";

type MigrationTarget = {
  label: string;
  table: TableName;
  field: FieldName;
};

type Row = {
  id: string;
  deployerKeypair?: string | null;
  programKeypair?: string | null;
};

const targets: MigrationTarget[] = [
  { label: "User.deployerKeypair", table: "user", field: "deployerKeypair" },
  { label: "Project.programKeypair", table: "project", field: "programKeypair" },
  { label: "Deployment.programKeypair", table: "deployment", field: "programKeypair" },
];

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const verifyEncrypted = args.has("--verify-encrypted");

function getLimit(): number | undefined {
  const arg = process.argv.find((value) => value.startsWith("--limit="));
  if (!arg) return undefined;
  const raw = arg.slice("--limit=".length);
  const limit = Number.parseInt(raw, 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${raw}`);
  }
  return limit;
}

function model(target: MigrationTarget) {
  return prisma[target.table] as unknown as {
    findMany(input: unknown): Promise<Row[]>;
    updateMany(input: unknown): Promise<{ count: number }>;
  };
}

async function migrateTarget(target: MigrationTarget, limit: number | undefined) {
  const delegate = model(target);
  const rows = await delegate.findMany({
    where: { [target.field]: { not: null } },
    select: { id: true, [target.field]: true },
    ...(limit ? { take: limit } : {}),
  });

  let migrated = 0;
  let skipped = 0;
  let verified = 0;
  let failed = 0;

  for (const row of rows) {
    const current = row[target.field];
    if (!current) continue;

    try {
      if (isEncryptedSecretKey(current) && !verifyEncrypted) {
        skipped++;
        continue;
      }

      if (isEncryptedSecretKey(current) && verifyEncrypted) {
        keypairFromStoredSecret(current);
        skipped++;
        verified++;
        continue;
      }

      const result = migrateStoredSecretKey(current);

      if (write) {
        const update = await delegate.updateMany({
          where: { id: row.id, [target.field]: current },
          data: { [target.field]: result.stored },
        });
        if (update.count !== 1) {
          throw new Error("row changed before migration write");
        }
      }

      migrated++;
      console.log(`${write ? "migrated" : "would migrate"} ${target.label} ${row.id} publicKey=${result.publicKey}`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`failed ${target.label} ${row.id}: ${message}`);
    }
  }

  return { scanned: rows.length, migrated, skipped, verified, failed };
}

async function main() {
  if (!process.env.ENCRYPTION_MASTER_KEY && !process.env.AUTH_SECRET) {
    throw new Error("Set ENCRYPTION_MASTER_KEY or AUTH_SECRET before running deploy key migration");
  }

  const limit = getLimit();
  console.log(write ? "Running deploy key migration in WRITE mode." : "Running deploy key migration in dry-run mode. Pass --write to update rows.");

  let totalFailed = 0;
  for (const target of targets) {
    const summary = await migrateTarget(target, limit);
    totalFailed += summary.failed;
    console.log(
      `${target.label}: scanned=${summary.scanned} migrated=${summary.migrated} skipped=${summary.skipped} verifiedEncrypted=${summary.verified} failed=${summary.failed}`,
    );
  }

  if (totalFailed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
