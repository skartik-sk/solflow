import { appRouter } from "@/server/trpc/routers";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";

export async function createServerCaller() {
  const session = await auth();
  return appRouter.createCaller({
    session,
    prisma,
    headers: new Headers(),
  });
}
