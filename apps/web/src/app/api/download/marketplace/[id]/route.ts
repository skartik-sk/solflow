// GET /api/download/marketplace/:id?framework=anchor
//
// Generates a .zip archive of a marketplace template's generated Rust source.
// No auth required — marketplace templates are public.

import { NextResponse } from "next/server";
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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const url = new URL(req.url);
  const framework = (url.searchParams.get("framework") ?? "anchor").toLowerCase() as string;
  if (!["anchor", "pinocchio", "quasar"].includes(framework)) {
    return NextResponse.json({ error: "Invalid framework" }, { status: 400 });
  }

  const listing = await prisma.marketplaceListing.findFirst({
    where: { id, status: "PUBLISHED" },
    select: {
      title: true,
      templateFlowData: true,
      templateIR: true,
    },
  });

  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Use stored IR first, fall back to flowToIR
  let ir: ProgramIR;
  const storedIR = listing.templateIR as ProgramIR | null;
  if (storedIR?.program?.name) {
    ir = storedIR;
  } else {
    const fd = listing.templateFlowData as FlowData | null;
    if (!fd?.nodes) {
      return NextResponse.json(
        { error: "Template has no flow data" },
        { status: 400 },
      );
    }
    try {
      ir = flowToIR(fd.nodes, fd.edges ?? []);
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to generate IR: ${(err as Error).message}` },
        { status: 422 },
      );
    }
  }

  const generated = generateCode(ir, framework as "anchor" | "pinocchio" | "quasar");

  if (generated.errors.length > 0) {
    return NextResponse.json(
      { error: "Code generation produced errors", details: generated.errors },
      { status: 422 },
    );
  }

  const zipEntries: Record<string, Uint8Array> = {};
  for (const file of generated.files) {
    zipEntries[file.path] = strToU8(file.content);
  }

  const zipUint8 = zipSync(zipEntries, { level: 6 });
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
