import { NextResponse } from "next/server";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";
import { generateCliToken, hashCliToken, redactCliToken } from "@/server/cli-api/tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

  const tokens = await prisma.apiKey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
  });
  return json({ tokens });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

  const body = await readJsonObject(request);
  const name = typeof body.name === "string" && body.name.trim()
    ? body.name.trim()
    : "SolStudio Cloud CLI";
  const expiresInDays = Number(body.expiresInDays ?? 90);
  const expiresAt = Number.isFinite(expiresInDays) && expiresInDays > 0
    ? new Date(Date.now() + Math.floor(expiresInDays) * 24 * 60 * 60 * 1000)
    : null;
  const token = generateCliToken();

  const apiKey = await prisma.apiKey.create({
    data: {
      key: hashCliToken(token),
      name,
      user: { connect: { id: session.user.id } },
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return json({
    token,
    tokenPreview: redactCliToken(token),
    apiKey,
  }, 201);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "Missing token id" }, 400);

  const existing = await prisma.apiKey.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!existing) return json({ error: "Token not found" }, 404);

  await prisma.apiKey.delete({ where: { id } });
  return json({ ok: true });
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
