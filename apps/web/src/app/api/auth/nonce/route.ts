import { generateNonce } from "@solflow/auth";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { nonceRateLimit } from "@/lib/rate-limit";

export async function GET() {
  // Derive IP from standard forwarded-for header (or a fallback constant).
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  const rl = nonceRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests. Please wait before requesting a new nonce.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Limit": "20",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      },
    );
  }

  const nonce = await generateNonce();
  return NextResponse.json(
    { nonce },
    {
      headers: {
        "X-RateLimit-Limit": "20",
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(rl.resetAt),
      },
    },
  );
}
