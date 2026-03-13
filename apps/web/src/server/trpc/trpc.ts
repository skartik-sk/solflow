// tRPC server initialisation — context, procedures, middleware.
// Per docs/architecture/17-api-design.md.

import { initTRPC, TRPCError } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { ZodError } from "zod";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";

// ─── Context ─────────────────────────────────────────────────────────────────

export async function createContext(opts: FetchCreateContextFnOptions) {
  const session = await auth();

  return {
    session,
    prisma,
    headers: opts.req.headers,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

// ─── tRPC init ────────────────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// ─── Exports ─────────────────────────────────────────────────────────────────

export const router = t.router;
export const publicProcedure = t.procedure;

// Protected procedure — throws UNAUTHORIZED if no session
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      // Narrow: session.user is definitely defined here
      session: {
        ...ctx.session,
        user: ctx.session.user as NonNullable<typeof ctx.session.user>,
      },
    },
  });
});
