import { handlers } from "@solflow/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  authPostRateLimit,
  clientIpFromHeaders,
  rateLimitHeaders,
} from "@/lib/rate-limit";

const { GET: authGet, POST: authPost } = handlers;

export const GET = authGet;

export async function POST(req: NextRequest) {
  const rl = authPostRateLimit(clientIpFromHeaders(req.headers));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many auth requests. Please wait before trying again." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  return authPost(req);
}
