// GET /api/download/:projectId?include=program,sdk,irJson,idl
//
// Generates a .zip archive of the project's generated Rust source files and
// optional extras (IR JSON, IDL placeholder). Returns it as a file download.
//
// Per docs/architecture/17-api-design.md — REST endpoint for file downloads.

import { NextResponse } from "next/server";
import { auth } from "@solflow/auth";
import { prisma } from "@solflow/db";
import type { ProgramIR } from "@solflow/ir";
import { flowToIR } from "@solflow/ir";
import { generateCode } from "@solflow/codegen";
import type { Node, Edge } from "@xyflow/react";
import { strToU8, zipSync } from "fflate";

interface FlowData {
  nodes: Node[];
  edges: Edge[];
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  // ── Auth ──────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  // ── Parse query params ────────────────────────────────────────────
  const url = new URL(req.url);
  const includeParam = url.searchParams.get("include") ?? "program";
  const includes = new Set(includeParam.split(",").map((s) => s.trim()));

  // ── Fetch project ─────────────────────────────────────────────────
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    select: {
      id: true,
      name: true,
      framework: true,
      flowData: true,
      irData: true,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Generate code ─────────────────────────────────────────────────
  const flowData = project.flowData as FlowData | null;
  if (!flowData?.nodes) {
    return NextResponse.json(
      { error: "Project has no flow data to export" },
      { status: 400 },
    );
  }

  const framework = project.framework.toLowerCase() as "anchor" | "pinocchio" | "quasar";

  let ir: ProgramIR;
  try {
    ir = flowToIR(flowData.nodes, flowData.edges ?? []);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to generate IR: ${(err as Error).message}` },
      { status: 422 },
    );
  }

  const generated = generateCode(ir, framework);

  if (generated.errors.length > 0) {
    return NextResponse.json(
      {
        error: "Code generation produced errors",
        details: generated.errors,
      },
      { status: 422 },
    );
  }

  // ── Build zip entries ─────────────────────────────────────────────
  const zipEntries: Record<string, Uint8Array> = {};

  // Program source files
  if (includes.has("program")) {
    for (const file of generated.files) {
      zipEntries[file.path] = strToU8(file.content);
    }
  }

  // IR JSON
  if (includes.has("irJson")) {
    zipEntries["ir.json"] = strToU8(JSON.stringify(ir, null, 2));
  }

  // IDL placeholder (Anchor IDL format — will be real IDL once compile service lands)
  if (includes.has("idl")) {
    const idlPlaceholder = {
      version: ir.program.version,
      name: ir.program.name,
      instructions: ir.instructions.map((ix) => ({
        name: ix.name,
        accounts: ix.accounts.map((a) => ({
          name: a.name,
          isMut: a.constraints.some((c) => c.type === "mut"),
          isSigner: a.constraints.some((c) => c.type === "signer"),
        })),
        args: ix.args.map((arg) => ({ name: arg.name, type: arg.type })),
      })),
    };
    zipEntries["idl.json"] = strToU8(JSON.stringify(idlPlaceholder, null, 2));
  }

  // ── Produce zip ───────────────────────────────────────────────────
  const zipUint8 = zipSync(zipEntries, { level: 6 });
  // Copy into a standalone ArrayBuffer (no SharedArrayBuffer ambiguity)
  const body: ArrayBuffer = zipUint8.buffer.slice(
    zipUint8.byteOffset,
    zipUint8.byteOffset + zipUint8.byteLength,
  ) as ArrayBuffer;

  const safeName = ir.program.name.replace(/[^a-z0-9_-]/gi, "_");
  const filename = `${safeName}-${framework}.zip`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipUint8.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
