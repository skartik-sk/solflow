// flow-preview.tsx — dynamic wrapper for the read-only flow canvas.
// Loads the inner component only on the client side (no SSR for React Flow).
"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { Node, Edge } from "@xyflow/react";

const FlowPreviewInner = dynamic(
  () =>
    import("./flow-preview-inner").then((m) => ({
      default: m.FlowPreviewInner,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading preview…
      </div>
    ),
  },
);

interface FlowPreviewProps {
  nodes: Node[];
  edges: Edge[];
}

export function FlowPreview({ nodes, edges }: FlowPreviewProps) {
  return <FlowPreviewInner nodes={nodes} edges={edges} />;
}
