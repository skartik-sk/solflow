import { generateNonce } from "@solflow/auth";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { clientIpFromHeaders, nonceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET() {
  // Derive IP from standard forwarded-for header (or a fallback constant).
  const headersList = await headers();
  const ip = clientIpFromHeaders(headersList);

  const rl = nonceRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests. Please wait before requesting a new nonce.",
      },
      {
        status: 429,
        headers: rateLimitHeaders(rl),
      },
    );
  }

  const nonce = await generateNonce();
  return NextResponse.json(
    { nonce },
    {
      headers: rateLimitHeaders(rl),
    },
  );
}
