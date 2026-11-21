// Presentational view for /share/[slug]. The page fetches the share; this renders.

import React from "react";
import Link from "next/link";
import type { Node, Edge } from "@xyflow/react";
import { ShieldCheck } from "lucide-react";
import { FlowPreview } from "@/app/marketplace/[id]/flow-preview";
import { readInstructions } from "./ListingDetail";
import { Chip, GraphThumbStyles, MarketHeader, btnPrimary, panel } from "./parts";

export function SharedGraphView({
  title,
  description,
  createdAt,
  nodes,
  edges,
  audit,
}: {
  title: string;
  description: string | null;
  createdAt: Date;
  nodes: Node[];
  edges: Edge[];
  audit: { score?: number; summary?: Record<string, number>; findings?: unknown[] } | null;
}) {
  const instructions = readInstructions(nodes, edges);
  const severities = audit?.summary
    ? Object.entries(audit.summary).filter(([, n]) => typeof n === "number")
    : [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <GraphThumbStyles />
      <MarketHeader max="max-w-[1320px]" crumbs={[{ label: "Shared graph" }]}>
        <Chip className="mr-2 hidden sm:inline-flex">Read-only</Chip>
        <Link href="/" className={btnPrimary}>
          Open SolStudio
        </Link>
      </MarketHeader>

      <section className="mx-auto grid max-w-[1320px] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className={`${panel} flex min-h-[420px] flex-col overflow-hidden lg:h-[calc(100dvh-104px)] lg:min-h-[560px]`}>
          <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-3.5">
            <span className="truncate text-[12.5px] font-medium">{title}</span>
            <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-muted-foreground">
              {nodes.length} nodes · {edges.length} edges
            </span>
          </div>
          <div className="h-[420px] flex-1 bg-background lg:h-auto">
            <FlowPreview nodes={nodes} edges={edges} />
          </div>
        </div>

        <aside className="space-y-3">
          <div className={`${panel} p-4`}>
            <h1 className="text-[18px] font-semibold leading-snug tracking-[-0.02em]">{title}</h1>
            {description && <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
            <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-white/[0.06] bg-white/[0.06]">
              {[
                ["Nodes", String(nodes.length)],
                ["Edges", String(edges.length)],
                ["Audit score", typeof audit?.score === "number" ? `${audit.score}/100` : "Not run"],
                ["Shared", createdAt.toISOString().slice(0, 10)],
              ].map(([k, v]) => (
                <div key={k} className="bg-card px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">{k}</dt>
                  <dd className="font-mono text-[13px] tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            {severities.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {severities.map(([sev, n]) => (
                  <Chip
                    key={sev}
                    tone={/critical|high/i.test(sev) && n > 0 ? "bad" : /medium/i.test(sev) && n > 0 ? "warn" : "neutral"}
                    className="capitalize"
                  >
                    {sev} <span className="font-mono tabular-nums">{n}</span>
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {instructions.length > 0 && (
            <div className={`${panel} overflow-hidden`}>
              <p className="border-b border-white/[0.07] px-4 py-2.5 text-[12.5px] font-semibold">Instructions</p>
              <ul className="divide-y divide-white/[0.06]">
                {instructions.map((ix) => (
                  <li key={ix.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="flex min-w-0 items-center gap-2 font-mono text-[12px]">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-[3px] bg-[#38bdf8]" />
                      <span className="truncate">{ix.name}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {ix.accounts.length} acc
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="flex gap-2 px-1 text-[12px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This public view strips private keys, custom wallet pubkeys, and credential-like values before sharing.
          </p>
        </aside>
      </section>
    </main>
  );
}
