import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/trpc/routers";

export const trpc: CreateTRPCReact<AppRouter, unknown> =
  createTRPCReact<AppRouter>();

export function makeTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: getBaseUrl() + "/api/trpc",
        transformer: superjson,
      }),
    ],
  });
}

let _vanillaClient: ReturnType<typeof createTRPCClient<AppRouter>> | undefined;

export function getVanillaClient() {
  if (!_vanillaClient) {
    _vanillaClient = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: getBaseUrl() + "/api/trpc",
          transformer: superjson,
        }),
      ],
    });
  }
  return _vanillaClient;
}

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3001}`;
}
