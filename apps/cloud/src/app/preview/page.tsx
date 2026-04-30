"use client";

import React, { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Clock, GitBranch, Share2, ShieldCheck } from "lucide-react";

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

const NODE_COLORS: Record<string, string> = {
  trigger: "#f59e0b",
  action: "#3b82f6",
  transform: "#06b6d4",
  logic: "#8b5cf6",
  output: "#10b981",
};

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
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
            <ArrowLeft className="h-3.5 w-3.5" />
            SolStudio Cloud
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
            <Share2 className="h-3 w-3" />
            Preview
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {!snapshot ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-300" />
            <h1 className="text-sm font-semibold">Preview could not be opened</h1>
            <p className="mt-1 text-xs text-muted-foreground">The snapshot link is missing or invalid.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{snapshot.name ?? "Workflow Preview"}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {nodes.length} node{nodes.length === 1 ? "" : "s"}{" "}
                  &middot; {edges.length} connection{edges.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <Metric label="Status" value={snapshot.status ?? "Draft"} />
                <Metric label="Timeout" value={`${snapshot.settings?.timeout ?? 120}s`} />
                <Metric label="Simulation" value={snapshot.settings?.safety?.simulationRequired === false ? "Optional" : "Required"} />
                <Metric label="Generated" value={snapshot.generatedAt ? new Date(snapshot.generatedAt).toLocaleDateString() : "Now"} />
              </div>
            </div>

            <section className="mb-6 rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold">Workflow Graph</h2>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3 w-3" />
                  Redacted snapshot
                </div>
              </div>
              <div className="overflow-auto rounded-lg border border-border bg-background">
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
                          stroke="hsl(var(--muted-foreground))"
                          strokeOpacity="0.35"
                          strokeWidth="2"
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
                        className="absolute w-[160px] rounded-lg border border-border bg-card p-3 shadow-lg"
                        style={{ left: point.x, top: point.y, borderLeftWidth: 3, borderLeftColor: color }}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold">{labelFor(node.type)}</span>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{category}</span>
                        </div>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">{node.id}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold">Safety</h2>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <SafetyRow label="Simulation" value={snapshot.settings?.safety?.simulationRequired === false ? "Optional" : "Required"} />
                  <SafetyRow label="Manual approval" value={snapshot.settings?.safety?.manualApprovalRequired === false ? "Optional" : "Required"} />
                  <SafetyRow label="Wallet automation" value={snapshot.settings?.safety?.walletAutomationAllowed ? "Allowed" : "Locked"} />
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="mb-3 text-sm font-semibold">Nodes</h2>
                <div className="space-y-2">
                  {nodes.map((node) => (
                    <div key={node.id} className="flex items-center justify-between gap-3 text-xs">
                      <span>{labelFor(node.type)}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{node.type}</span>
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
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-semibold">{value}</p>
    </div>
  );
}

function SafetyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-background px-2 py-1.5">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function WorkflowPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
          <Clock className="mr-2 h-4 w-4 animate-spin" />
          Loading preview...
        </div>
      }
    >
      <PreviewContent />
    </Suspense>
  );
}
