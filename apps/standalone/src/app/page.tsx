"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { Node, Edge } from "@xyflow/react";
import { useFlowStore } from "@/web/store/flow-store";
import { useUIStore } from "@/web/store/ui-store";
import { loadProject, saveProject } from "../lib/standalone-api";

// React Flow can't be SSR'd
const FlowCanvas = dynamic(
  () =>
    import("@/web/components/editor/FlowCanvas").then((m) => ({
      default: m.FlowCanvas,
    })),
  { ssr: false, loading: () => <LoadingPlaceholder /> },
);

const NodePalette = dynamic(
  () =>
    import("@/web/components/editor/NodePalette").then((m) => ({
      default: m.NodePalette,
    })),
  { ssr: false },
);

export default function StandalonePage() {
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<string>("");
  const { nodes, edges, setFlow } = useFlowStore();
  const { paletteOpen } = useUIStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRemoteUpdate = useRef(false);

  // Load initial project data
  useEffect(() => {
    loadProject()
      .then((data) => {
        if (data.nodes?.length) {
          isRemoteUpdate.current = true;
          setFlow(data.nodes, data.edges ?? []);
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, [setFlow]);

  // Auto-save with debounce when nodes/edges change
  useEffect(() => {
    // Skip if not loaded yet, or if change came from remote update
    if (!loaded || isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProject({ nodes, edges })
        .then(() => setStatus("Saved"))
        .catch(() => setStatus("Save failed"));
      saveTimer.current = null;
    }, 1000);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, loaded]);

  // WebSocket listener for live reload from file watcher
  useEffect(() => {
    if (!loaded) return;

    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "flow-updated") {
              // Server re-parsed .rs files — reload project data
              loadProject()
                .then((data) => {
                  isRemoteUpdate.current = true;
                  setFlow(data.nodes ?? [], data.edges ?? []);
                  setStatus(`Updated: ${msg.nodes || 0} nodes`);
                })
                .catch(() => setStatus("Reload failed"));
            } else if (msg.type === "parse-error") {
              setStatus(`Parse error: ${msg.error}`);
            }
          } catch { /* ignore bad messages */ }
        };
        ws.onclose = () => {
          // Reconnect after 3s
          reconnectTimer = setTimeout(connect, 3000);
        };
        ws.onerror = () => ws?.close();
      } catch {
        // WebSocket not available (e.g. static export without server)
      }
    }

    connect();

    return () => {
      ws?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [loaded, setFlow]);

  if (!loaded) {
    return <LoadingScreen />;
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-12 border-b border-border flex items-center px-4 bg-card shrink-0">
        <h1 className="text-sm font-medium text-foreground">SolStudio Local</h1>
        {status && (
          <span className="ml-3 text-xs text-muted-foreground">{status}</span>
        )}
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative">
        {paletteOpen && (
          <div className="absolute left-0 top-0 bottom-0 z-10">
            <NodePalette />
          </div>
        )}
        <FlowCanvas />
      </div>
    </div>
  );
}

function LoadingPlaceholder() {
  return (
    <div className="h-full w-full bg-background flex items-center justify-center">
      <div className="text-muted-foreground text-sm">Loading canvas...</div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="h-screen w-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xl font-semibold text-foreground mb-2">SolStudio</div>
        <div className="text-sm text-muted-foreground">Loading project...</div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __SOLSTUDIO_STANDALONE__?: boolean;
  }
}
