import { NextResponse } from "next/server";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string; description?: string; framework?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, description, framework } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const fw =
    framework === "QUASAR" ? "QUASAR" :
    framework === "PINOCCHIO" ? "PINOCCHIO" :
    "ANCHOR";

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      description: description?.trim() ?? null,
      framework: fw,
      userId: session.user.id,
      // Empty flow as initial state
      flowData: { nodes: [], edges: [] },
    },
    select: {
      id: true,
      name: true,
      framework: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json(project, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      framework: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(projects);
}
