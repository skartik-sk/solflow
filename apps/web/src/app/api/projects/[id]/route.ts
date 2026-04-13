import { NextResponse } from "next/server";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const existing = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only allow known fields — reject unknown keys
  const allowedKeys = new Set(["name", "description", "flowData", "irData", "generatedCode", "framework"]);
  const unknownKeys = Object.keys(body).filter((k) => !allowedKeys.has(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json({ error: `Unknown fields: ${unknownKeys.join(", ")}` }, { status: 400 });
  }

  const { name, description, flowData, irData, generatedCode, framework } = body;

  // Validate field types
  if (name !== undefined && typeof name !== "string") {
    return NextResponse.json({ error: "name must be a string" }, { status: 400 });
  }
  if (description !== undefined && typeof description !== "string") {
    return NextResponse.json({ error: "description must be a string" }, { status: 400 });
  }
  if (name !== undefined && (String(name).trim().length === 0 || String(name).length > 200)) {
    return NextResponse.json({ error: "name must be 1-200 characters" }, { status: 400 });
  }
  if (framework !== undefined && !["ANCHOR", "PINOCCHIO", "QUASAR"].includes(framework as string)) {
    return NextResponse.json({ error: "Invalid framework" }, { status: 400 });
  }

  // Validate flowData structure (must be object with nodes + edges if present)
  if (flowData !== undefined && flowData !== null) {
    if (typeof flowData !== "object" || Array.isArray(flowData)) {
      return NextResponse.json({ error: "flowData must be an object" }, { status: 400 });
    }
    const fd = flowData as Record<string, unknown>;
    if (fd.nodes !== undefined && !Array.isArray(fd.nodes)) {
      return NextResponse.json({ error: "flowData.nodes must be an array" }, { status: 400 });
    }
    if (fd.edges !== undefined && !Array.isArray(fd.edges)) {
      return NextResponse.json({ error: "flowData.edges must be an array" }, { status: 400 });
    }
  }

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(description !== undefined && { description: String(description).trim() || null }),
      ...(framework !== undefined && { framework: framework as "ANCHOR" | "PINOCCHIO" | "QUASAR" }),
      ...(flowData !== undefined && { flowData: flowData ? (flowData as any) : null }),
      ...(irData !== undefined && { irData: irData ? (irData as any) : null }),
      ...(generatedCode !== undefined && { generatedCode: generatedCode ? (generatedCode as any) : null }),
    },
    select: {
      id: true,
      name: true,
      description: true,
      framework: true,
      status: true,
      flowData: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership before deleting
  const existing = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.project.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
