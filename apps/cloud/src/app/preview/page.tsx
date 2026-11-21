"use client";

import React, { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Clock, Share2, ShieldCheck } from "lucide-react";
import { SolMark } from "@/components/ui-kit/cloud-mark";

type PreviewNode = {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
};

type PreviewEdge = {
  id: string;
  source: string;
  target: string;
};

type PreviewSnapshot = {
  name?: string;
  status?: string;
  generatedAt?: string;
  definition?: {
    nodes?: PreviewNode[];
    edges?: PreviewEdge[];
  };
  settings?: {
    timeout?: number;
    safety?: {
      simulationRequired?: boolean;
      manualApprovalRequired?: boolean;
      walletAutomationAllowed?: boolean;
    };
  };
};

// The editor's node colours (content only)
const NODE_COLORS: Record<string, string> = {
  trigger: "#4ade80",
  action: "#38bdf8",
  transform: "#58d3db",
  logic: "#c084fc",
  output: "#f5a524",
};

const panel = "rounded-[14px] border border-white/[0.07] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";

function decodeSnapshot(raw: string | null): PreviewSnapshot | null {
  if (!raw) return null;
  try {
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as PreviewSnapshot;
  } catch {
    return null;
  }
}

function labelFor(type: string): string {
  const [, name = type] = type.split(":");
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function categoryFor(type: string): string {
  return type.split(":")[0] || "action";
}

function buildBounds(nodes: PreviewNode[]) {
  const xs = nodes.map((node) => node.position?.x ?? 0);
  const ys = nodes.map((node) => node.position?.y ?? 0);
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const maxX = Math.max(...xs, 900);
  const maxY = Math.max(...ys, 420);
  return { minX, minY, maxX, maxY, width: Math.max(900, maxX - minX + 220), height: Math.max(420, maxY - minY + 120) };
}

function nodePoint(node: PreviewNode, bounds: ReturnType<typeof buildBounds>) {
  return {
    x: (node.position?.x ?? 0) - bounds.minX + 80,
    y: (node.position?.y ?? 0) - bounds.minY + 70,
  };
}

function edgePath(source: PreviewNode, target: PreviewNode, bounds: ReturnType<typeof buildBounds>) {
  const s = nodePoint(source, bounds);
  const t = nodePoint(target, bounds);
  const sx = s.x + 140;
  const sy = s.y + 28;
  const tx = t.x;
  const ty = t.y + 28;
  const midX = (sx + tx) / 2;
  return `M${sx},${sy} C${midX},${sy} ${midX},${ty} ${tx},${ty}`;
}

function PreviewContent() {
  const params = useSearchParams();
  const snapshot = useMemo(() => decodeSnapshot(params.get("snapshot")), [params]);
  const nodes = snapshot?.definition?.nodes ?? [];
  const edges = snapshot?.definition?.edges ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const bounds = buildBounds(nodes);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/[0.07] bg-background/85">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 rounded-md text-[14px] font-semibold tracking-[-0.01em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <SolMark size={22} />
            <span>
              SolStudio <span className="font-normal text-muted-foreground">Cloud</span>
            </span>
          </Link>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/[0.08] px-2 text-[12px] text-muted-foreground">
            <Share2 className="h-3 w-3" aria-hidden />
            Shared preview
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {!snapshot ? (
          <div className={`${panel} mx-auto max-w-md p-5`}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-amber-400/10 text-amber-300">
                <AlertTriangle className="h-4 w-4" aria-hidden />
              </span>
              <h1 className="text-[15px] font-semibold">Preview could not be opened</h1>
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">The snapshot link is missing or invalid. Ask for a fresh share link from the editor.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-[20px] font-semibold leading-tight tracking-[-0.02em]">{snapshot.name ?? "Workflow Preview"}</h1>
                <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">
                  {nodes.length} node{nodes.length === 1 ? "" : "s"}{" "}
                  &middot; {edges.length} connection{edges.length === 1 ? "" : "s"}
                </p>
              </div>
              <dl className={`${panel} grid grid-cols-2 overflow-hidden md:grid-cols-4`}>
                <Metric label="Status" value={snapshot.status ?? "Draft"} />
                <Metric label="Timeout" value={`${snapshot.settings?.timeout ?? 120}s`} />
                <Metric label="Simulation" value={snapshot.settings?.safety?.simulationRequired === false ? "Optional" : "Required"} />
                <Metric label="Generated" value={snapshot.generatedAt ? new Date(snapshot.generatedAt).toLocaleDateString() : "Now"} />
              </dl>
            </div>

            <section className={`${panel} mb-3 overflow-hidden`}>
              <div className="flex h-10 items-center justify-between border-b border-white/[0.07] px-4">
                <h2 className="text-[13px] font-medium">Workflow graph</h2>
                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Redacted snapshot
                </div>
              </div>
              <div className="overflow-auto bg-background bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1.2px)] bg-[length:20px_20px]">
                <div className="relative" style={{ width: bounds.width, height: bounds.height }}>
                  <svg className="absolute inset-0 h-full w-full" aria-hidden>
                    {edges.map((edge) => {
                      const source = byId.get(edge.source);
                      const target = byId.get(edge.target);
                      if (!source || !target) return null;
                      return (
                        <path
                          key={edge.id}
                          d={edgePath(source, target, bounds)}
                          fill="none"
                          stroke="rgba(255,255,255,0.2)"
                          strokeWidth="1.5"
                        />
                      );
                    })}
                  </svg>
                  {nodes.map((node) => {
                    const point = nodePoint(node, bounds);
                    const category = categoryFor(node.type);
                    const color = NODE_COLORS[category] ?? NODE_COLORS.action;
                    return (
                      <div
                        key={node.id}
                        className="absolute w-[160px] rounded-[10px] bg-popover"
                        style={{ left: point.x, top: point.y, boxShadow: `inset 3px 0 0 ${color}, 0 0 0 1px rgba(255,255,255,0.1), 0 12px 24px -12px rgba(0,0,0,0.8)` }}
                      >
                        <div className="flex h-8 items-center justify-between gap-2 border-b border-white/[0.06] pl-3 pr-2">
                          <span className="truncate text-[12px] font-medium">{labelFor(node.type)}</span>
                          <span className="text-[10.5px]" style={{ color }}>{category}</span>
                        </div>
                        <p className="truncate px-3 py-1.5 font-mono text-[10.5px] text-muted-foreground">{node.id}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2">
              <div className={`${panel} overflow-hidden`}>
                <h2 className="flex h-10 items-center border-b border-white/[0.07] px-4 text-[13px] font-medium">Safety</h2>
                <div className="text-[12.5px] text-muted-foreground">
                  <SafetyRow label="Simulation" value={snapshot.settings?.safety?.simulationRequired === false ? "Optional" : "Required"} />
                  <SafetyRow label="Manual approval" value={snapshot.settings?.safety?.manualApprovalRequired === false ? "Optional" : "Required"} />
                  <SafetyRow label="Wallet automation" value={snapshot.settings?.safety?.walletAutomationAllowed ? "Allowed" : "Locked"} />
                </div>
              </div>
              <div className={`${panel} overflow-hidden`}>
                <h2 className="flex h-10 items-center border-b border-white/[0.07] px-4 text-[13px] font-medium">Nodes</h2>
                <div>
                  {nodes.map((node) => (
                    <div key={node.id} className="flex h-9 items-center justify-between gap-3 border-b border-white/[0.06] px-4 text-[12.5px] last:border-b-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: NODE_COLORS[categoryFor(node.type)] ?? NODE_COLORS.action }} aria-hidden />
                        <span className="truncate">{labelFor(node.type)}</span>
                      </span>
                      <span className="truncate font-mono text-[11px] text-muted-foreground">{node.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="-mb-px -mr-px min-w-0 border-b border-r border-white/[0.07] px-3.5 py-2">
      <dt className="text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-[13px] font-medium">{value}</dd>
    </div>
  );
}

function SafetyRow({ label, value }: { label: string; value: string }) {
  const good = value === "Required" || value === "Locked";
  return (
    <div className="flex h-9 items-center justify-between border-b border-white/[0.06] px-4 last:border-b-0">
      <span>{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-medium ${good ? "text-foreground" : "text-amber-300"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${good ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden />
        {value}
      </span>
    </div>
  );
}

export default function WorkflowPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-[13px] text-muted-foreground">
          <Clock className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          Loading preview...
        </div>
      }
    >
      <PreviewContent />
    </Suspense>
  );
}
