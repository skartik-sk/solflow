// Server-side tRPC caller — used in Server Components and route handlers.
// Never call this from client components.
//
// In tRPC v11 the router exposes .createCaller(ctx) directly; there is no
// standalone createCallerFactory export from @trpc/server.

import { appRouter } from "@/server/trpc/routers";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";

export async function createServerCaller() {
  const session = await auth();

  return appRouter.createCaller({
    session,
    prisma,
    // headers are not needed for server-side calls
    headers: new Headers(),
  });
}
