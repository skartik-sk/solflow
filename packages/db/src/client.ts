import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";

// TEMP DIAGNOSTIC: surface the real cause of the serverless crash (the runtime
// otherwise just prints "Node.js process exited"). Remove once auth is green.
process.on("unhandledRejection", (reason) => {
  const r = reason as { message?: unknown; stack?: unknown; code?: unknown } | null;
  console.error(
    "[UNHANDLED_REJECTION]",
    JSON.stringify({
      message: r?.message ?? String(reason),
      code: r?.code,
      stack: r?.stack,
    }),
  );
});

// Neon's serverless driver speaks WebSocket; on Node it needs a ws constructor.
// Using the driver adapter means Prisma no longer needs its native query-engine
// binary — so "Prisma Client could not locate the Query Engine" can't happen on
// Vercel serverless (or anywhere).
neonConfig.webSocketConstructor = ws as unknown as never;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString
  ? new PrismaNeon({ connectionString })
  : undefined;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
